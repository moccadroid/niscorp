import { compileFilter, compileFieldOrValue } from '../adapters/postgres/operators.js';
import type { CompilationContext } from '../adapters/postgres/operators.js';
import type { ParamSlot, Row } from '../adapters/adapter.types.js';
import type { Filter } from '../schemas/filter.schema.js';
import type { DatabaseSchema } from '../schemas/database.schema.js';
import type { ScopePolicy, ScopeValues, ScopeMatch, ScopeRule } from '../scope/scope.types.js';
import { isSetMatch } from '../scope/scope.types.js';
import { VexScopeError } from '../scope/apply.js';
import { VexError } from '../errors.js';
import { resolveParams } from '../utils/context.js';
import { MutationDefinitionSchema } from './schema.js';
import type { Mutation, MutationDefinition, CoreMutation, ResolvedMutation, ResolvedOnConflict, MutationValue, LookupValue, ItemRef } from './schema.js';
import { collectMutationContext, requiredContextKeys } from './signature.js';

// ═══════════════════════════════════════════════════════════════
// Mutation engine — the write pipeline. Validate (closed grammar, bounded
// WHERE) → desugar → require context → scope (RLS + identity stamp) → check
// columns → compile → execute. Every gate runs before a single statement
// does. Reuses the read pipeline's own machinery for SQL and params
// (compileFilter / compileFieldOrValue / resolveParams), so values bind as
// SQL parameters exactly as they do for reads — never inlined.
// ═══════════════════════════════════════════════════════════════

// The database the writes run against — structural, so PGlite, a pg Pool
// wrapper, or a test double all fit without vex importing any driver.
export type MutationTx = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};
export type MutationClient = MutationTx & {
  transaction?: <T>(fn: (tx: MutationTx) => Promise<T>) => Promise<T>;
};

// ─── Value guards ──────────────────────────────────────────────
const isLookup = (v: unknown): v is LookupValue =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && '$lookup' in v;
const isItemRef = (v: unknown): v is ItemRef =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && '$item' in v;

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

// ─── Schema validation (anti-hallucination) ────────────────────
// The engine already introspected for reads; reject an unknown table or a
// written column not in it. A misauthored `contats` / `naem` fails closed,
// before any SQL runs.
const findEntity = (table: string, schema: DatabaseSchema) =>
  schema.entities.find((e) => e.table === table || e.name === table);

// An ON CONFLICT whose target names no unique constraint never arrests
// anything — the insert would simply throw on the real constraint, or worse,
// never conflict at all. The schema knows the unique column sets (PK +
// introspected unique indexes), so a mismatched target is an AUTHORING error,
// caught before any SQL runs, with the real options in the message.
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

const assertWritableColumns = (m: ResolvedMutation, schema: DatabaseSchema): void => {
  const entity = findEntity(m.table, schema);
  if (entity === undefined) throw new VexError('invalid_dsl', `Unknown table "${m.table}".`);
  const known = new Set(entity.fields.map((f) => f.name));
  const cols = m.op === 'insert' || m.op === 'insertEach' ? Object.keys(m.values) : m.op === 'update' ? Object.keys(m.set) : [];
  for (const c of cols) {
    if (!known.has(c)) throw new VexError('invalid_dsl', `Unknown column "${m.table}.${c}".`);
  }
  // A lookup reads a real table and column, or fails closed like any other
  // misauthored name.
  for (const l of collectLookups(m)) {
    const le = findEntity(l.from, schema);
    if (le === undefined) throw new VexError('invalid_dsl', `Unknown table "${l.from}" in $lookup.`);
    if (!le.fields.some((f) => f.name === l.field)) throw new VexError('invalid_dsl', `Unknown column "${l.from}.${l.field}" in $lookup.`);
  }
  if ((m.op === 'insert' || m.op === 'insertEach') && m.onConflict !== undefined) {
    for (const c of [...m.onConflict.target, ...Object.keys(m.onConflict.set ?? {})]) {
      if (!known.has(c)) throw new VexError('invalid_dsl', `Unknown column "${m.table}.${c}" in onConflict.`);
    }
    assertConflictTarget(m.table, m.onConflict.target, entity);
  }
};

// ─── Scope — applied by the ENGINE, never authored in the DSL ──
// The same `ScopePolicy` reads use, its write-phase rules applied AFTER the
// entry is parsed — so identity/tenant binding can't be touched by a stored
// or injected mutation. `write` is the UMBRELLA phase (grants + rules for
// insert/update/delete); the specific phases refine it — an op is allowed
// iff its specific phase or `write` exists, and its rules are the umbrella's
// plus the specific's. Mechanics: a `set` writes its column from scope on
// each column-writing op (insert values, update set) — delete writes no
// columns, so it is structurally exempt, not special-cased. A `match` pins
// its column on insert and ANDs a filter into update/delete WHERE (the RLS
// boundary). No applicable phase (or unlisted table) falls to `default`:
// deny throws, allow leaves the mutation ungoverned.
// A `$lookup` READS its table, so the read-phase rules of THAT table apply —
// a mutation entry is never a read-scope bypass. Match rules AND into the
// lookup's WHERE; a table the principal cannot read refuses the whole write.
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

// ONE SPELLING of the RLS boundary, for every place a match rule becomes a
// WHERE — a `$lookup`'s filter, an ON CONFLICT DO UPDATE, an UPDATE and a
// DELETE. Four copies of `{ eq: [...] }` is four places a new match shape has
// to be remembered, and the one that was forgotten would be the hole.
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
    // A scoped lookup is still a lookup — the transform is type-preserving.
    out[k] = { $lookup: { ...v.$lookup, where } } as V;
  }
  return out;
};

// The gate every write passes: throws when denied, returns `undefined` when
// the table is ungoverned (public / default allow), else the entity rule and
// the applicable phase rules (umbrella + specific).
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

// The shared insert-shaped half: lookups scoped, insert rules applied to the
// values, and the ON CONFLICT half gated and governed as the UPDATE it is.
// `set` rules stamp identity into the DO UPDATE SET; `match` rules whose
// column the conflict target already pins are inherently satisfied (the
// inserted, scope-pinned value must equal the existing row's for a conflict
// to arise at all); any other `match` becomes a WHERE on the DO UPDATE half —
// the RLS boundary again.
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
    // A WRITE'S SUBJECT IS ONE VALUE, AND THIS IS WHERE THAT IS ENFORCED.
    //
    // A `match` on an INSERT does not filter — there is no row yet — it WRITES
    // the column, which is what makes "insert outside your boundary"
    // unsayable rather than merely refused. A set has no single value to
    // write, so there is no honest thing to do with one here.
    //
    // Throwing rather than picking, ignoring, or compiling a guard: a reach
    // that covers several rows for READING must not silently become a reach
    // that lets a caller CHOOSE which of them to write as. A write's subject
    // comes from scope (one value) or through a `$lookup` whose own read
    // rules the engine applies — never from a set the caller indexes into.
    if ('match' in r && isSetMatch(r)) {
      throw new VexScopeError(
        table,
        `Scope rule for "${table}" is set-valued ("${r.match}" in "${r.in}") and cannot pin an INSERT — a write's subject must be a single value. Use a scalar match, or carry the subject in a $lookup whose own read rules bound it.`,
      );
    }
    // A `set` writes identity; a scalar `match` pins the RLS boundary — on an
    // INSERT both land in the values.
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
        // The column is written from scope on insert AND update alike.
        if ('set' in r) set = { ...set, [r.set]: { $scope: r.to } };
        // RLS boundary on update — AND the scope filter into WHERE. A set is
        // safe HERE, unlike on insert: the rows already exist and this only
        // narrows which of them may be touched.
        else where = { and: [where, boundaryOf(m.table, r)] };
      }
    }
    return { op: 'update', table: m.table, set, where };
  }
  // delete — writes no columns, so `set` rules are structurally exempt.
  let where: Filter = m.where;
  const gate = writeGate(m.table, 'delete', policy);
  if (gate !== undefined) {
    for (const r of gate.rules) {
      if ('match' in r) where = { and: [where, boundaryOf(m.table, r)] };
    }
  }
  return { op: 'delete', table: m.table, where };
};

// ─── Compile (reuses the read pipeline's SQL + param machinery) ─
// Only the INSERT/UPDATE/DELETE skeleton is assembled here; vex's
// `compileFieldOrValue` / `compileFilter` fill the fragments and accumulate
// the param slots, which `resolveParams` then binds. One catch: for a
// comparison, vex quotes an unmapped `entity.field` as a STRING LITERAL (it
// can't know it's a column). A single-table write has no resolver to build
// the alias map, so we seed it ourselves — identity-mapping each `where`
// field path to itself, which a single-table UPDATE/DELETE qualifies fine.
type Compiled = { sql: string; slots: ParamSlot[] };

const newCtx = (): CompilationContext => ({
  resolvedPaths: new Map(),
  aliasMap: new Map(),
  paramSlots: [],
  paramCounter: { value: 0 },
});

const indexFilterFields = (filter: Filter, aliasMap: Map<string, string>): void => {
  for (const [op, val] of Object.entries(filter)) {
    if (op === 'and' || op === 'or') (val as Filter[]).forEach((f) => indexFilterFields(f, aliasMap));
    else if (op === 'not') indexFilterFields(val as Filter, aliasMap);
    else if (op === 'isNull' || op === 'isNotNull') {
      if (typeof val === 'string' && val.includes('.')) aliasMap.set(val, val);
    } else if (Array.isArray(val)) {
      const field = val[0];
      if (typeof field === 'string' && field.includes('.')) aliasMap.set(field, field);
    }
  }
};

// A value that may be a `$lookup` compiles to a scalar subquery INLINE, into
// the parent's own parameter counter and slot list — the same no-renumbering
// rule EXISTS follows on the read side.
const compileValue = (v: MutationValue, ctx: CompilationContext): string => {
  if (isLookup(v)) {
    indexFilterFields(v.$lookup.where, ctx.aliasMap);
    const where = compileFilter(v.$lookup.where, ctx);
    return `(SELECT ${v.$lookup.field} FROM ${v.$lookup.from} WHERE ${where})`;
  }
  return compileFieldOrValue(v, ctx);
};

const compileConflict = (m: { table: string; onConflict?: ResolvedOnConflict }, ctx: CompilationContext): string => {
  const c = m.onConflict;
  if (c === undefined) return '';
  if (c.set === undefined) return ` ON CONFLICT (${c.target.join(', ')}) DO NOTHING`;
  const sets = Object.entries(c.set).map(([col, v]) => `${col} = ${compileValue(v, ctx)}`);
  let where = '';
  if (c.where !== undefined) {
    indexFilterFields(c.where, ctx.aliasMap);
    where = ` WHERE ${compileFilter(c.where, ctx)}`;
  }
  return ` ON CONFLICT (${c.target.join(', ')}) DO UPDATE SET ${sets.join(', ')}${where}`;
};

// jsonb `->>` yields text; the cast restores the column's type so the INSERT
// binds like any other. `json` columns keep `->` (stays jsonb, no cast).
const ITEM_CAST: Record<string, string> = {
  number: 'numeric',
  boolean: 'boolean',
  date: 'date',
  timestamp: 'timestamptz',
  uuid: 'uuid',
};

const escapeItemKey = (s: string): string => s.replace(/'/g, "''");

const compileMutation = (m: ResolvedMutation, schema: DatabaseSchema): Compiled => {
  const ctx = newCtx();
  if (m.op === 'insert') {
    const entries = Object.entries(m.values);
    const cols = entries.map(([c]) => c);
    const vals = entries.map(([, v]) => compileValue(v, ctx));
    return { sql: `INSERT INTO ${m.table} (${cols.join(', ')}) VALUES (${vals.join(', ')})${compileConflict(m, ctx)} RETURNING *`, slots: ctx.paramSlots };
  }
  if (m.op === 'insertEach') {
    const entity = findEntity(m.table, schema);
    const entries = Object.entries(m.values);
    const cols = entries.map(([c]) => c);
    const exprs = entries.map(([col, v]) => {
      if (isItemRef(v)) {
        const nt = entity?.fields.find((f) => f.name === col)?.normalizedType ?? 'string';
        if (nt === 'json') return `(item.value->'${escapeItemKey(v.$item)}')`;
        const cast = ITEM_CAST[nt];
        const raw = `(item.value->>'${escapeItemKey(v.$item)}')`;
        return cast === undefined ? raw : `${raw}::${cast}`;
      }
      return compileValue(v, ctx);
    });
    ctx.paramCounter.value += 1;
    ctx.paramSlots.push({ key: m.items.$context, kind: 'context', type: 'json' });
    const source = `jsonb_array_elements($${ctx.paramCounter.value}::jsonb) AS item`;
    return {
      sql: `INSERT INTO ${m.table} (${cols.join(', ')}) SELECT ${exprs.join(', ')} FROM ${source}${compileConflict(m, ctx)} RETURNING *`,
      slots: ctx.paramSlots,
    };
  }
  if (m.op === 'update') {
    const sets = Object.entries(m.set).map(([c, v]) => `${c} = ${compileValue(v, ctx)}`);
    indexFilterFields(m.where, ctx.aliasMap);
    const where = compileFilter(m.where, ctx);
    return { sql: `UPDATE ${m.table} SET ${sets.join(', ')} WHERE ${where} RETURNING *`, slots: ctx.paramSlots };
  }
  indexFilterFields(m.where, ctx.aliasMap);
  const where = compileFilter(m.where, ctx);
  return { sql: `DELETE FROM ${m.table} WHERE ${where} RETURNING *`, slots: ctx.paramSlots };
};

// ─── Desugar (sugar → core) ────────────────────────────────────
// Rewrite each sugar op to a core insert/update/delete BEFORE context/scope/
// validate/compile, so those stages only ever see the three primitives.
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

// ─── Execute ───────────────────────────────────────────────────
export type MutationContext = {
  context: Record<string, unknown>; // dynamic values for `$context` refs (the caller's data)
  scope: ScopeValues; // server-injected values for `$scope` refs (identity / tenant)
  policy: ScopePolicy;
  schema: DatabaseSchema;
};

// One executed statement, named by what it did: the table, the op that
// actually ran (post-desugar — an upsert reports the branch it took, an
// insertEach reports 'insert' because that is what it is), and the rows the
// database returned. This is the grain a write observer needs: a two-
// statement mutation is two writes, each with its own rows.
export type WriteResult = { table: string; op: 'insert' | 'update' | 'delete'; rows: Row[] };

export const executeWrites = async (client: MutationClient, def: MutationDefinition, mctx: MutationContext): Promise<WriteResult[]> => {
  const parsed = MutationDefinitionSchema.parse(def);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const compiled = entries.map((entry) => {
    const core = desugarMutation(entry, mctx.context);
    // A write never executes with holes: every `$context` the (desugared)
    // statement binds must be present. The error teaches the WHOLE contract.
    const missing = requiredContextKeys(core).filter((k) => mctx.context[k] === undefined);
    if (missing.length > 0) {
      throw new VexError('missing_context', `Mutation is missing context: ${missing.join(', ')}.`, {
        expected: collectMutationContext(parsed, mctx.schema),
      });
    }
    const m = scopeMutation(core, mctx.policy);
    assertWritableColumns(m, mctx.schema);
    return { ...compileMutation(m, mctx.schema), table: m.table, op: (m.op === 'insertEach' ? 'insert' : m.op) as WriteResult['op'] };
  });

  const runAll = async (q: MutationTx): Promise<WriteResult[]> => {
    const results: WriteResult[] = [];
    for (const c of compiled) {
      const params = await resolveParams(c.slots, mctx.context, mctx.scope);
      // A `json` slot (insertEach items) is bound as a JSON string — drivers
      // would otherwise turn a JS array into a postgres ARRAY literal, which
      // `::jsonb` refuses. Anything but an array fails loudly here.
      const bound = params.map((value, i) => {
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

  // A batch runs atomically; a single write needs no transaction.
  if (compiled.length === 1) return runAll(client);
  if (client.transaction === undefined) {
    throw new VexError('execution_error', 'Batch mutations require a transactional client.');
  }
  return client.transaction((tx) => runAll(tx));
};

// The rows alone, statement order preserved — the shape every existing
// caller wants when it does not care which statement returned what.
export const executeMutation = async (client: MutationClient, def: MutationDefinition, mctx: MutationContext): Promise<Row[]> =>
  (await executeWrites(client, def, mctx)).flatMap((w) => w.rows);
