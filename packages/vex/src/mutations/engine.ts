import { compileFilter, compileFieldOrValue, quoteLiteral } from '../adapters/postgres/operators.js';
import type { CompilationContext } from '../adapters/postgres/operators.js';
import type { ParamSlot, Row } from '../adapters/adapter.types.js';
import type { Filter } from '../schemas/filter.schema.js';
import type { DatabaseSchema } from '../schemas/database.schema.js';
import type { ScopePolicy, ScopeValues, ScopeMatch, ScopeRule } from '../scope/scope.types.js';
import { isSetMatch } from '../scope/scope.types.js';
import { VexScopeError } from '../scope/apply.js';
import { VexError } from '../errors.js';
import { isFieldPathShape } from '../schemas/identifier.schema.js';
import { resolveParams } from '../utils/context.js';
import { requireScope } from '../engine/executor.js';
import { MutationDefinitionSchema } from './schema.js';
import type { Mutation, MutationDefinition, CoreMutation, ResolvedMutation, ResolvedOnConflict, MutationValue, LookupValue, ReturnedRef, ItemRef } from './schema.js';
import { collectMutationContext, requiredContextKeys, returnedIn } from './signature.js';
import type { ReturnedSource } from './signature.js';

export type MutationTx = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};
export type MutationClient = MutationTx & {
  transaction?: <T>(fn: (tx: MutationTx) => Promise<T>) => Promise<T>;
};

const isLookup = (v: unknown): v is LookupValue =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && '$lookup' in v;
const isItemRef = (v: unknown): v is ItemRef =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && '$item' in v;
const isReturned = (v: unknown): v is ReturnedRef =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && '$returned' in v;

const collectLookups = (m: ResolvedMutation): LookupValue['$lookup'][] => {
  const out: LookupValue['$lookup'][] = [];
  const scan = (cols: Record<string, unknown> | undefined): void => {
    for (const v of Object.values(cols ?? {})) if (isLookup(v)) out.push(v.$lookup);
  };
  if (m.op === 'insert' || m.op === 'insertEach') {
    scan(m.values);
    scan(m.onConflict?.set);
  }
  if (m.op === 'update') scan(m.set);
  return out;
};

const findEntity = (table: string, schema: DatabaseSchema) =>
  schema.entities.find((e) => e.table === table || e.name === table);

const assertConflictTarget = (table: string, target: string[], entity: { fields: { name: string; primaryKey: boolean }[]; indexes: { fields: string[]; unique: boolean }[] }): void => {
  const uniqueSets = [
    entity.fields.filter((f) => f.primaryKey).map((f) => f.name),
    ...entity.indexes.filter((i) => i.unique).map((i) => [...i.fields]),
  ].filter((s) => s.length > 0);
  if (uniqueSets.length === 0) return; // the schema carries no uniqueness info — nothing to check against
  const want = new Set(target);
  const ok = uniqueSets.some((s) => s.length === want.size && s.every((c) => want.has(c)));
  if (!ok) {
    throw new VexError(
      'invalid_dsl',
      `onConflict target (${target.join(', ')}) does not match a unique constraint on "${table}". Unique column sets: ${uniqueSets.map((s) => `(${s.join(', ')})`).join(' ')}.`,
    );
  }
};

// A field position is collected whatever it looks like, so assertFilterColumns
// refuses a string that is not a column instead of it being compiled.
const filterColumns = (filter: Filter): string[] => {
  const out: string[] = [];
  const value = (v: unknown): void => {
    if (isFieldPathShape(v)) out.push(v);
  };
  const walk = (f: Filter): void => {
    if ('and' in f) return f.and.forEach(walk);
    if ('or' in f) return f.or.forEach(walk);
    if ('not' in f) return walk(f.not);
    if ('eq' in f) return f.eq.forEach(value);
    if ('neq' in f) return f.neq.forEach(value);
    if ('gt' in f) return f.gt.forEach(value);
    if ('gte' in f) return f.gte.forEach(value);
    if ('lt' in f) return f.lt.forEach(value);
    if ('lte' in f) return f.lte.forEach(value);
    if ('in' in f || 'notIn' in f) {
      const [field, target] = 'in' in f ? f.in : f.notIn;
      out.push(field);
      if (Array.isArray(target)) target.forEach(value);
      return;
    }
    if ('like' in f || 'ilike' in f) {
      const [field, pattern] = 'like' in f ? f.like : f.ilike;
      out.push(field);
      return value(pattern);
    }
    if ('isNull' in f) return void out.push(f.isNull);
    if ('isNotNull' in f) return void out.push(f.isNotNull);
    if ('semantic' in f) return void out.push(f.semantic.field);
    if ('fuzzy' in f) return void out.push(f.fuzzy.field);
    // `exists` and `optional` are not walked: the compiler refuses both in a write.
  };
  walk(filter);
  return out;
};

const assertFilterColumns = (filter: Filter, table: string, schema: DatabaseSchema, where: string): void => {
  const entity = findEntity(table, schema);
  if (entity === undefined) throw new VexError('invalid_dsl', `Unknown table "${table}" in ${where}.`);
  for (const path of filterColumns(filter)) {
    const dot = path.indexOf('.');
    const owner = path.slice(0, dot);
    const column = path.slice(dot + 1);
    if (!isFieldPathShape(path) || owner !== table || !entity.fields.some((f) => f.name === column)) {
      throw new VexError('invalid_dsl', `"${path}" in ${where} is not a column of "${table}".`);
    }
  }
};

const assertWritableColumns = (m: ResolvedMutation, schema: DatabaseSchema): void => {
  const entity = findEntity(m.table, schema);
  if (entity === undefined) throw new VexError('invalid_dsl', `Unknown table "${m.table}".`);
  if (m.op === 'update' || m.op === 'delete') assertFilterColumns(m.where, m.table, schema, 'the WHERE');
  const known = new Set(entity.fields.map((f) => f.name));
  const cols = m.op === 'insert' || m.op === 'insertEach' ? Object.keys(m.values) : m.op === 'update' ? Object.keys(m.set) : [];
  for (const c of cols) {
    if (!known.has(c)) throw new VexError('invalid_dsl', `Unknown column "${m.table}.${c}".`);
  }
  for (const l of collectLookups(m)) {
    const le = findEntity(l.from, schema);
    if (le === undefined) throw new VexError('invalid_dsl', `Unknown table "${l.from}" in $lookup.`);
    if (!le.fields.some((f) => f.name === l.field)) throw new VexError('invalid_dsl', `Unknown column "${l.from}.${l.field}" in $lookup.`);
    assertFilterColumns(l.where, l.from, schema, 'a $lookup');
  }
  if ((m.op === 'insert' || m.op === 'insertEach') && m.onConflict !== undefined) {
    for (const c of [...m.onConflict.target, ...Object.keys(m.onConflict.set ?? {})]) {
      if (!known.has(c)) throw new VexError('invalid_dsl', `Unknown column "${m.table}.${c}" in onConflict.`);
    }
    assertConflictTarget(m.table, m.onConflict.target, entity);
    if (m.onConflict.where !== undefined) assertFilterColumns(m.onConflict.where, m.table, schema, 'onConflict');
  }
};

const assertReturnedColumns = (refs: ReadonlyMap<string, ReturnedSource>, schema: DatabaseSchema): void => {
  for (const [ref, source] of refs) {
    if (findEntity(source.table, schema)?.fields.some((f) => f.name === source.column) !== true) {
      throw new VexError('invalid_dsl', `Unknown column "${ref}" in $returned.`);
    }
  }
};

const readMatchesFor = (table: string, policy: ScopePolicy): ScopeMatch[] => {
  const rule = policy.entities[table];
  if (rule === undefined) {
    if (policy.default === 'deny') throw new VexScopeError(table, `A $lookup reads "${table}", which is not allowed by scope policy (default: deny).`);
    return [];
  }
  if ('public' in rule) return [];
  if ('deny' in rule) throw new VexScopeError(table, `A $lookup reads "${table}", which is denied by scope policy.`);
  if (rule.read === undefined) {
    if (policy.default === 'deny') throw new VexScopeError(table, `A $lookup reads "${table}", which this principal has no read grant for.`);
    return [];
  }
  return rule.read;
};

const boundaryOf = (table: string, r: ScopeMatch): Filter =>
  isSetMatch(r) ? { in: [`${table}.${r.match}`, { $scope: r.in }] } : { eq: [`${table}.${r.match}`, { $scope: r.to }] };

const scopeLookups = <V extends MutationValue | ItemRef>(cols: Record<string, V>, policy: ScopePolicy): Record<string, V> => {
  const out: Record<string, V> = {};
  for (const [k, v] of Object.entries(cols)) {
    if (!isLookup(v)) {
      out[k] = v;
      continue;
    }
    let where: Filter = v.$lookup.where;
    for (const r of readMatchesFor(v.$lookup.from, policy)) {
      where = { and: [where, boundaryOf(v.$lookup.from, r)] };
    }
    out[k] = { $lookup: { ...v.$lookup, where } } as V;
  }
  return out;
};

type WriteGate = { rule: Extract<ScopePolicy['entities'][string], { read?: unknown }>; rules: readonly ScopeRule[] };

const writeGate = (table: string, op: 'insert' | 'update' | 'delete', policy: ScopePolicy): WriteGate | undefined => {
  const rule = policy.entities[table];
  if (rule === undefined) {
    if (policy.default === 'deny') throw new VexScopeError(table, `Writes to "${table}" are not allowed by scope policy (default: deny).`);
    return undefined;
  }
  if ('public' in rule) return undefined;
  if ('deny' in rule) throw new VexScopeError(table, `Writes to "${table}" are denied by scope policy.`);
  const specific = op === 'insert' ? rule.insert : op === 'update' ? rule.update : rule.delete;
  if (rule.write === undefined && specific === undefined) {
    if (policy.default === 'deny') throw new VexScopeError(table, `"${op}" on "${table}" is not allowed by scope policy (default: deny).`);
    return undefined;
  }
  return { rule, rules: [...(rule.write ?? []), ...(specific ?? [])] };
};

// The ON CONFLICT half is governed as the UPDATE it is. A `match` on a column
// of the conflict target gets no WHERE, on the reasoning that the insert pins
// that column from scope and so conflicts only with a row holding the same value.
const scopeInsertParts = <V extends MutationValue | ItemRef>(
  table: string,
  rawValues: Record<string, V>,
  rawConflict: ResolvedOnConflict | undefined,
  policy: ScopePolicy,
): { values: Record<string, V | { $scope: string }>; conflict: ResolvedOnConflict | undefined } => {
  let values: Record<string, V | { $scope: string }> = scopeLookups(rawValues, policy);
  let conflict: ResolvedOnConflict | undefined =
    rawConflict === undefined || rawConflict.set === undefined ? rawConflict : { ...rawConflict, set: scopeLookups(rawConflict.set, policy) };

  const gate = writeGate(table, 'insert', policy);
  if (gate === undefined) return { values, conflict };

  for (const r of gate.rules) {
    // A `match` on an INSERT writes the column, and a set has no single value
    // to write. It throws rather than picks or ignores: a reach over several
    // rows for reading must not let a caller choose which of them to write as.
    if ('match' in r && isSetMatch(r)) {
      throw new VexScopeError(
        table,
        `Scope rule for "${table}" is set-valued ("${r.match}" in "${r.in}") and cannot pin an INSERT — a write's subject must be a single value. Use a scalar match, or carry the subject in a $lookup whose own read rules bound it.`,
      );
    }
    values = { ...values, ['set' in r ? r.set : r.match]: { $scope: r.to } };
  }

  if (conflict?.set !== undefined) {
    if (gate.rule.write === undefined && gate.rule.update === undefined) {
      throw new VexScopeError(table, `onConflict on "${table}" declares DO UPDATE, but this principal has no update grant.`);
    }
    for (const r of [...(gate.rule.write ?? []), ...(gate.rule.update ?? [])]) {
      if ('set' in r) {
        conflict = { ...conflict, set: { ...(conflict.set ?? {}), [r.set]: { $scope: r.to } } };
      } else if (!conflict.target.includes(r.match)) {
        const boundary = boundaryOf(table, r);
        conflict = { ...conflict, where: conflict.where === undefined ? boundary : { and: [conflict.where, boundary] } };
      }
    }
  }

  return { values, conflict };
};

const scopeMutation = (m: CoreMutation, policy: ScopePolicy): ResolvedMutation => {
  if (m.op === 'insert') {
    const { values, conflict } = scopeInsertParts(m.table, m.values, m.onConflict, policy);
    return { op: 'insert', table: m.table, values, ...(conflict === undefined ? {} : { onConflict: conflict }) };
  }
  if (m.op === 'insertEach') {
    const { values, conflict } = scopeInsertParts(m.table, m.values, m.onConflict, policy);
    return { op: 'insertEach', table: m.table, items: m.items, values, ...(conflict === undefined ? {} : { onConflict: conflict }) };
  }
  if (m.op === 'update') {
    let set: Record<string, MutationValue> = scopeLookups(m.set, policy);
    let where: Filter = m.where;
    const gate = writeGate(m.table, 'update', policy);
    if (gate !== undefined) {
      for (const r of gate.rules) {
        if ('set' in r) set = { ...set, [r.set]: { $scope: r.to } };
        // A set-valued match is safe here, unlike on insert: it only narrows
        // which existing rows may be touched.
        else where = { and: [where, boundaryOf(m.table, r)] };
      }
    }
    return { op: 'update', table: m.table, set, where };
  }
  let where: Filter = m.where;
  const gate = writeGate(m.table, 'delete', policy);
  if (gate !== undefined) {
    for (const r of gate.rules) {
      if ('match' in r) where = { and: [where, boundaryOf(m.table, r)] };
    }
  }
  return { op: 'delete', table: m.table, where };
};

type Compiled = { sql: string; slots: ParamSlot[]; returned: ReadonlyMap<number, string> };
type WriteContext = CompilationContext & { returned: Map<number, string> };

const newCtx = (): WriteContext => ({
  resolvedPaths: new Map(),
  aliasMap: new Map(),
  paramSlots: [],
  paramCounter: { value: 0 },
  returned: new Map(),
});

// A single-table statement needs no aliases, so each path maps to itself. Only
// for a filter assertFilterColumns has already held to the table's real columns.
const indexFilterFields = (filter: Filter, aliasMap: Map<string, string>): void => {
  for (const path of filterColumns(filter)) aliasMap.set(path, path);
};

// A `$returned` slot is declared like a `$context` one, but the run loop binds
// it from the earlier statement's row after the caller's values are resolved,
// so nothing a request sends can stand in for it.
const compileValue = (v: MutationValue, ctx: WriteContext): string => {
  if (isLookup(v)) {
    indexFilterFields(v.$lookup.where, ctx.aliasMap);
    const where = compileFilter(v.$lookup.where, ctx);
    return `(SELECT ${v.$lookup.field} FROM ${v.$lookup.from} WHERE ${where})`;
  }
  if (isReturned(v)) {
    ctx.paramCounter.value += 1;
    ctx.returned.set(ctx.paramSlots.length, v.$returned);
    ctx.paramSlots.push({ key: v.$returned, kind: 'context', type: 'string' });
    return `$${ctx.paramCounter.value}`;
  }
  return compileFieldOrValue(v, ctx);
};

const compileColumnValue = (table: string, column: string, v: MutationValue, ctx: WriteContext, schema: DatabaseSchema): string => {
  const before = ctx.paramSlots.length;
  const sql = compileValue(v, ctx);
  const json = findEntity(table, schema)?.fields.find((f) => f.name === column)?.normalizedType === 'json';
  if (json && typeof v === 'object' && v !== null && ('$context' in v || '$returned' in v)) {
    const slot = ctx.paramSlots[before];
    if (slot !== undefined) ctx.paramSlots[before] = { ...slot, encode: 'json' };
  }
  return sql;
};

const compileConflict = (m: { table: string; onConflict?: ResolvedOnConflict }, ctx: WriteContext, schema: DatabaseSchema): string => {
  const c = m.onConflict;
  if (c === undefined) return '';
  if (c.set === undefined) return ` ON CONFLICT (${c.target.join(', ')}) DO NOTHING`;
  const sets = Object.entries(c.set).map(([col, v]) => `${col} = ${compileColumnValue(m.table, col, v, ctx, schema)}`);
  let where = '';
  if (c.where !== undefined) {
    indexFilterFields(c.where, ctx.aliasMap);
    where = ` WHERE ${compileFilter(c.where, ctx)}`;
  }
  return ` ON CONFLICT (${c.target.join(', ')}) DO UPDATE SET ${sets.join(', ')}${where}`;
};

const ITEM_CAST: Record<string, string> = {
  number: 'numeric',
  boolean: 'boolean',
  date: 'date',
  timestamp: 'timestamptz',
  uuid: 'uuid',
};


const compileMutation = (m: ResolvedMutation, schema: DatabaseSchema): Compiled => {
  const ctx = newCtx();
  if (m.op === 'insert') {
    const entries = Object.entries(m.values);
    const cols = entries.map(([c]) => c);
    const vals = entries.map(([c, v]) => compileColumnValue(m.table, c, v, ctx, schema));
    return { sql: `INSERT INTO ${m.table} (${cols.join(', ')}) VALUES (${vals.join(', ')})${compileConflict(m, ctx, schema)} RETURNING *`, slots: ctx.paramSlots, returned: ctx.returned };
  }
  if (m.op === 'insertEach') {
    const entity = findEntity(m.table, schema);
    const entries = Object.entries(m.values);
    const cols = entries.map(([c]) => c);
    const exprs = entries.map(([col, v]) => {
      if (isItemRef(v)) {
        const nt = entity?.fields.find((f) => f.name === col)?.normalizedType ?? 'string';
        if (nt === 'json') return `(item.value->${quoteLiteral(v.$item)})`;
        const cast = ITEM_CAST[nt];
        const raw = `(item.value->>${quoteLiteral(v.$item)})`;
        return cast === undefined ? raw : `${raw}::${cast}`;
      }
      return isReturned(v) ? compileColumnValue(m.table, col, v, ctx, schema) : compileValue(v, ctx);
    });
    ctx.paramCounter.value += 1;
    ctx.paramSlots.push({ key: m.items.$context, kind: 'context', type: 'json' });
    const source = `jsonb_array_elements($${ctx.paramCounter.value}::jsonb) AS item`;
    return {
      sql: `INSERT INTO ${m.table} (${cols.join(', ')}) SELECT ${exprs.join(', ')} FROM ${source}${compileConflict(m, ctx, schema)} RETURNING *`,
      slots: ctx.paramSlots,
      returned: ctx.returned,
    };
  }
  if (m.op === 'update') {
    const sets = Object.entries(m.set).map(([c, v]) => `${c} = ${compileColumnValue(m.table, c, v, ctx, schema)}`);
    indexFilterFields(m.where, ctx.aliasMap);
    const where = compileFilter(m.where, ctx);
    return { sql: `UPDATE ${m.table} SET ${sets.join(', ')} WHERE ${where} RETURNING *`, slots: ctx.paramSlots, returned: ctx.returned };
  }
  indexFilterFields(m.where, ctx.aliasMap);
  const where = compileFilter(m.where, ctx);
  return { sql: `DELETE FROM ${m.table} WHERE ${where} RETURNING *`, slots: ctx.paramSlots, returned: ctx.returned };
};

const SUGAR: { [K in Mutation['op']]?: (m: Extract<Mutation, { op: K }>, context: Record<string, unknown>) => CoreMutation } = {
  upsert: (m, context) => {
    const keyed = context[m.key] !== undefined && context[m.key] !== '';
    return keyed
      ? { op: 'update', table: m.table, set: m.columns, where: { eq: [`${m.table}.${m.key}`, { $context: m.key }] } }
      : { op: 'insert', table: m.table, values: { ...m.columns, ...m.insert } };
  },
};

const desugarMutation = (m: Mutation, context: Record<string, unknown>): CoreMutation => {
  const rewrite = SUGAR[m.op] as ((m: Mutation, c: Record<string, unknown>) => CoreMutation) | undefined;
  return rewrite === undefined ? (m as CoreMutation) : rewrite(m, context);
};

export const mutationMisfits = (def: MutationDefinition, schema: DatabaseSchema): string[] => {
  const reasons: string[] = [];
  const list = Array.isArray(def) ? def : [def];
  for (const [at, entry] of list.entries()) {
    const asked = [
      // keyed, an upsert is an update; unkeyed, an insert
      ...(entry.op === 'upsert' ? [{ [entry.key]: 0 }, {}] : [{}]).map((context) => () => assertWritableColumns(desugarMutation(entry, context), schema)),
      () => assertReturnedColumns(returnedIn(list, at).refs, schema),
    ];
    for (const ask of asked) {
      try {
        ask();
      } catch (error) {
        reasons.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  return reasons;
};

export type MutationContext = {
  context: Record<string, unknown>;
  scope: ScopeValues;
  policy: ScopePolicy;
  schema: DatabaseSchema;
};

export type WriteResult = { table: string; op: 'insert' | 'update' | 'delete'; rows: Row[] };

export const executeWrites = async (client: MutationClient, def: MutationDefinition, mctx: MutationContext): Promise<WriteResult[]> => {
  const parsed = MutationDefinitionSchema.parse(def);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const cores = entries.map((entry) => desugarMutation(entry, mctx.context));
  const compiled = cores.map((core, at) => {
    const missing = requiredContextKeys(core).filter((k) => mctx.context[k] === undefined);
    if (missing.length > 0) {
      throw new VexError('missing_context', `Mutation is missing context: ${missing.join(', ')}.`, {
        expected: collectMutationContext(parsed, mctx.schema),
      });
    }
    // The seed lint refuses these too, but a definition can reach here without
    // being seeded.
    const returned = returnedIn(cores, at);
    if (returned.issues.length > 0) throw new VexError('invalid_dsl', `${returned.issues.join('; ')}.`);
    const m = scopeMutation(core, mctx.policy);
    assertWritableColumns(m, mctx.schema);
    assertReturnedColumns(returned.refs, mctx.schema);
    const statement = compileMutation(m, mctx.schema);
    // A `set` rule with no scope value would stamp NULL: a row owned by nobody.
    requireScope({ paramSlots: statement.slots }, mctx.scope);
    const reads = [...statement.returned].map(([slot, ref]) => {
      const source = returned.refs.get(ref);
      if (source === undefined) throw new VexError('invalid_dsl', `"${ref}" names no earlier statement of the batch.`);
      return { slot, ref, source };
    });
    return { ...statement, reads, table: m.table, op: (m.op === 'insertEach' ? 'insert' : m.op) as WriteResult['op'] };
  });

  const runAll = async (q: MutationTx): Promise<WriteResult[]> => {
    const results: WriteResult[] = [];
    for (const c of compiled) {
      const params = await resolveParams(c.slots, mctx.context, mctx.scope);
      for (const read of c.reads) {
        const rows = results[read.source.statement]?.rows ?? [];
        const row = rows[0];
        if (rows.length !== 1 || row === undefined) {
          throw new VexError(
            'execution_error',
            `"${read.ref}" needs exactly one row from statement ${read.source.statement + 1} of the batch, which wrote ${rows.length}. Nothing was written.`,
            { returned: read.ref, rows: rows.length },
          );
        }
        // A client may hand rows back under other keys; binding `undefined`
        // would then write NULL silently.
        if (!(read.source.column in row)) {
          throw new VexError('execution_error', `"${read.ref}": the row statement ${read.source.statement + 1} returned has no "${read.source.column}" key. Nothing was written.`, { returned: read.ref });
        }
        params[read.slot] = row[read.source.column];
      }
      // Bound as a JSON string: a driver would otherwise send a JS array as a
      // postgres ARRAY literal, which `::jsonb` refuses.
      const bound = params.map((value, i) => {
        if (c.slots[i]?.encode === 'json') return value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
        if (c.slots[i]?.type !== 'json') return value;
        if (!Array.isArray(value)) {
          throw new VexError('invalid_request', `"${c.slots[i]?.key ?? ''}" must be an array of objects (one inserted row per element).`);
        }
        return JSON.stringify(value);
      });
      const res = await q.query(c.sql, bound as unknown[]);
      results.push({ table: c.table, op: c.op, rows: res.rows as Row[] });
    }
    return results;
  };

  if (compiled.length === 1) return runAll(client);
  if (client.transaction === undefined) {
    throw new VexError('execution_error', 'Batch mutations require a transactional client.');
  }
  return client.transaction((tx) => runAll(tx));
};

export const executeMutation = async (client: MutationClient, def: MutationDefinition, mctx: MutationContext): Promise<Row[]> =>
  (await executeWrites(client, def, mctx)).flatMap((w) => w.rows);
