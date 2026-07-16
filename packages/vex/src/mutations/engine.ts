import { compileFilter, compileFieldOrValue } from '../adapters/postgres/operators.js';
import type { CompilationContext } from '../adapters/postgres/operators.js';
import type { ParamSlot, Row } from '../adapters/adapter.types.js';
import type { Filter } from '../schemas/filter.schema.js';
import type { DatabaseSchema } from '../schemas/database.schema.js';
import type { ScopePolicy, ScopeValues } from '../scope/scope.types.js';
import { VexScopeError } from '../scope/apply.js';
import { VexError } from '../errors.js';
import { resolveParams } from '../utils/context.js';
import { MutationDefinitionSchema } from './schema.js';
import type { Mutation, MutationDefinition, CoreMutation, ResolvedMutation } from './schema.js';
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

// ─── Schema validation (anti-hallucination) ────────────────────
// The engine already introspected for reads; reject an unknown table or a
// written column not in it. A misauthored `contats` / `naem` fails closed,
// before any SQL runs.
const findEntity = (table: string, schema: DatabaseSchema) =>
  schema.entities.find((e) => e.table === table || e.name === table);

const assertWritableColumns = (m: ResolvedMutation, schema: DatabaseSchema): void => {
  const entity = findEntity(m.table, schema);
  if (entity === undefined) throw new VexError('invalid_dsl', `Unknown table "${m.table}".`);
  const known = new Set(entity.fields.map((f) => f.name));
  const cols = m.op === 'insert' ? Object.keys(m.values) : m.op === 'update' ? Object.keys(m.set) : [];
  for (const c of cols) {
    if (!known.has(c)) throw new VexError('invalid_dsl', `Unknown column "${m.table}.${c}".`);
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
const scopeMutation = (m: CoreMutation, policy: ScopePolicy): ResolvedMutation => {
  const rule = policy.entities[m.table];
  if (rule === undefined) {
    if (policy.default === 'deny') throw new VexScopeError(m.table, `Writes to "${m.table}" are not allowed by scope policy (default: deny).`);
    return m;
  }
  if ('public' in rule) return m;
  if ('deny' in rule) throw new VexScopeError(m.table, `Writes to "${m.table}" are denied by scope policy.`);
  const specific = m.op === 'insert' ? rule.insert : m.op === 'update' ? rule.update : rule.delete;
  if (rule.write === undefined && specific === undefined) {
    if (policy.default === 'deny') throw new VexScopeError(m.table, `"${m.op}" on "${m.table}" is not allowed by scope policy (default: deny).`);
    return m;
  }

  let scoped: ResolvedMutation = m;
  for (const r of [...(rule.write ?? []), ...(specific ?? [])]) {
    if ('set' in r) {
      // The column is written from scope on insert AND update alike.
      if (scoped.op === 'insert') scoped = { ...scoped, values: { ...scoped.values, [r.set]: { $scope: r.to } } };
      else if (scoped.op === 'update') scoped = { ...scoped, set: { ...scoped.set, [r.set]: { $scope: r.to } } };
    } else if (scoped.op === 'insert') {
      // RLS boundary on insert — pin the column to the scope value.
      scoped = { ...scoped, values: { ...scoped.values, [r.match]: { $scope: r.to } } };
    } else {
      // RLS boundary on update/delete — AND the scope filter into WHERE.
      scoped = { ...scoped, where: { and: [scoped.where, { eq: [`${m.table}.${r.match}`, { $scope: r.to }] }] } };
    }
  }
  return scoped;
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

const compileMutation = (m: ResolvedMutation): Compiled => {
  const ctx = newCtx();
  if (m.op === 'insert') {
    const entries = Object.entries(m.values);
    const cols = entries.map(([c]) => c);
    const vals = entries.map(([, v]) => compileFieldOrValue(v, ctx));
    return { sql: `INSERT INTO ${m.table} (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING *`, slots: ctx.paramSlots };
  }
  if (m.op === 'update') {
    const sets = Object.entries(m.set).map(([c, v]) => `${c} = ${compileFieldOrValue(v, ctx)}`);
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

export const executeMutation = async (client: MutationClient, def: MutationDefinition, mctx: MutationContext): Promise<Row[]> => {
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
    return compileMutation(m);
  });

  const runAll = async (q: MutationTx): Promise<Row[]> => {
    const rows: Row[] = [];
    for (const c of compiled) {
      const params = await resolveParams(c.slots, mctx.context, mctx.scope);
      const res = await q.query(c.sql, params as unknown[]);
      rows.push(...(res.rows as Row[]));
    }
    return rows;
  };

  // A batch runs atomically; a single write needs no transaction.
  if (compiled.length === 1) return runAll(client);
  if (client.transaction === undefined) {
    throw new VexError('execution_error', 'Batch mutations require a transactional client.');
  }
  return client.transaction((tx) => runAll(tx));
};
