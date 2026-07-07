import { z } from 'zod';
import type { PGlite, Transaction } from '@electric-sql/pglite';
import {
  FilterSchema,
  compileFilter,
  compileFieldOrValue,
  resolveParams,
  VexError,
  VexScopeError,
} from '@niscorp/vex';
import type {
  CompilationContext,
  Filter,
  FieldOrValue,
  ParamSlot,
  Row,
  DatabaseSchema,
  ScopePolicy,
  ScopeValues,
} from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════
// Relay mutation engine — the WRITE sibling of Vex's read pipeline.
//
// Vex is read-only by design; writes are dangerous (how do you safeguard a
// GENERATED mutation against hallucination?), so they are prototyped HERE,
// isolated, before any move toward a first-class Vex primitive. The shape
// mirrors a query and REUSES Vex's own machinery: `where` is a Vex `Filter`,
// values/matches are `{ $context }` / `{ $scope }` refs, and the SQL + the
// parameter binding go through Vex's `compileFilter` / `compileFieldOrValue` /
// `resolveParams`. The only genuinely new parts are the INSERT/UPDATE/DELETE
// skeleton (Vex has no SELECT equivalent) and the safety gate. All
// mutation-specific code lives in this one file.
// ═══════════════════════════════════════════════════════════

// ─── DSL ───────────────────────────────────────────────────
// A value an AUTHORED mutation may set: a literal, or a `{ $context }` ref to
// the caller's (client) data. NOT `$scope` — identity/tenant is never authorable
// in the DSL; the engine injects it post-parse (see scopeMutation), so a
// generated or injected mutation cannot place, omit, or redirect it. NOT a field
// path either — a write sets values, it does not read columns.
const ValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({ $context: z.string() }).strict(),
]);

const Columns = z
  .record(z.string(), ValueSchema)
  .refine((r) => Object.keys(r).length > 0, { message: 'a write must set at least one column' });

// `where` is a real Vex `Filter` — so `$context`/`$scope` and scope injection
// behave exactly as they do for reads. It is REQUIRED for update/delete: a
// write with no WHERE touches every row, so we refuse it at the schema.
const InsertSchema = z.object({ op: z.literal('insert'), table: z.string(), values: Columns }).strict();
const UpdateSchema = z.object({ op: z.literal('update'), table: z.string(), set: Columns, where: FilterSchema }).strict();
const DeleteSchema = z.object({ op: z.literal('delete'), table: z.string(), where: FilterSchema }).strict();

// ── Sugar ──────────────────────────────────────────────────
// A sugar op is a write convenience that rewrites to the core ops above before
// anything runs (see `desugarMutation`). `upsert` is insert-or-update keyed on
// `key`: present in the call's context → update that row, absent → insert.
const UpsertSchema = z
  .object({
    op: z.literal('upsert'),
    table: z.string(),
    columns: Columns, // set on BOTH branches (update SET, and part of the insert)
    insert: Columns.optional(), // extra columns set ONLY on insert — immutable-on-create (e.g. a FK)
    key: z.string(),
  })
  .strict()
  .describe('Sugar: insert-or-update by `key` (e.g. "id"). Desugars to update (SET columns WHERE key) when the key is present, else insert (columns + `insert`-only).');

export const MutationSchema = z.discriminatedUnion('op', [InsertSchema, UpdateSchema, DeleteSchema, UpsertSchema]);
export type Mutation = z.infer<typeof MutationSchema>;
// The three core ops a sugar desugars TO — what the pipeline (scope/validate/
// compile) actually handles. `upsert` never reaches them.
type CoreMutation = Exclude<Mutation, { op: 'upsert' }>;

// One write, or a batch run together in a single transaction.
export const MutationDefinitionSchema = z.union([MutationSchema, MutationSchema.array().min(1)]);
export type MutationDefinition = z.infer<typeof MutationDefinitionSchema>;

// After `scopeMutation` the engine may have injected `{ $scope }` refs that the
// authored grammar forbids — so the resolved form's columns widen to the full
// `FieldOrValue`. Authored (`Mutation`) → resolved is a pure widening.
type ResolvedMutation =
  | { op: 'insert'; table: string; values: Record<string, FieldOrValue> }
  | { op: 'update'; table: string; set: Record<string, FieldOrValue>; where: Filter }
  | { op: 'delete'; table: string; where: Filter };

// ─── Schema validation (anti-hallucination) ────────────────
// The engine already introspected for reads; reject an unknown table or a
// written column not in it. A hallucinated `contats` / `naem` fails closed,
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

// ─── Scope — applied by the ENGINE, never authored in the DSL ───────────────
// The same `ScopePolicy` object reads use (vex/scope.ts), its `write` rules
// applied here AFTER the entry is parsed — so identity/tenant binding can't be
// touched by a generated or injected mutation. A `set` stamps a column on insert
// (identity safety). A `match` pins its column on insert and ANDs a filter into
// update/delete WHERE (RLS boundary). Absent `write` (or unlisted table) falls
// to `default`: deny throws, allow leaves the mutation ungoverned.
const scopeMutation = (m: CoreMutation, policy: ScopePolicy): ResolvedMutation => {
  const rule = policy.entities[m.table];
  if (rule === undefined) {
    if (policy.default === 'deny') throw new VexScopeError(m.table, `Writes to "${m.table}" are not allowed by scope policy (default: deny).`);
    return m;
  }
  if ('public' in rule) return m;
  if ('deny' in rule) throw new VexScopeError(m.table, `Writes to "${m.table}" are denied by scope policy.`);
  if (rule.write === undefined) {
    if (policy.default === 'deny') throw new VexScopeError(m.table, `Writes to "${m.table}" are not allowed by scope policy (default: deny).`);
    return m;
  }

  let scoped: ResolvedMutation = m;
  for (const r of rule.write) {
    if ('set' in r) {
      // Identity stamp — insert only.
      if (scoped.op === 'insert') scoped = { ...scoped, values: { ...scoped.values, [r.set]: { $scope: r.to } } };
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

// ─── Compile (reuses Vex's SQL + param machinery) ──────────
// We only assemble the INSERT/UPDATE/DELETE skeleton; Vex's `compileFieldOrValue`
// / `compileFilter` fill the fragments and accumulate the param slots, which
// `resolveParams` then binds. One catch: for a comparison (`eq`, …) Vex quotes an
// unmapped `entity.field` as a STRING LITERAL (it can't know it's a column). A
// single-table write has no resolver to build the alias map, so we seed it
// ourselves — identity-mapping each `where` field path to itself, which a
// single-table UPDATE/DELETE qualifies fine (`UPDATE deals … WHERE deals.id =`).
type Compiled = { sql: string; slots: ParamSlot[] };

const newCtx = (): CompilationContext => ({
  resolvedPaths: new Map(),
  aliasMap: new Map(),
  paramSlots: [],
  paramCounter: { value: 0 },
});

// Index the `where`'s field positions so the compiler emits them as columns, not
// quoted strings. Only left/field operands are columns; values are `{ $context }`
// / `{ $scope }` objects, so they're untouched.
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

// ─── Desugar (sugar → core) ────────────────────────────────
// The write-side analogue of prism's desugar(): rewrite each sugar op to a core
// insert/update/delete BEFORE scope/validate/compile, so those stages only ever
// see the three primitives. Each SUGAR entry is one sugar op — adding `archive`/
// `touch` later is one more entry; the core pipeline never changes. Mutations are
// flat, so this is a per-op dispatch, not Prism's recursive walk.
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

// ─── Execute ───────────────────────────────────────────────
export type MutationContext = {
  context: Record<string, unknown>; // dynamic values for `$context` refs (the action's data)
  scope: ScopeValues; // server-injected values for `$scope` refs (identity / tenant)
  policy: ScopePolicy;
  schema: DatabaseSchema;
};

export const executeMutation = async (db: PGlite, def: MutationDefinition, mctx: MutationContext): Promise<Row[]> => {
  // Validate (closed grammar, bounded WHERE) → scope (RLS) → check columns →
  // compile. All gates run before a single statement executes.
  const parsed = MutationDefinitionSchema.parse(def);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const compiled = entries.map((entry) => {
    const m = scopeMutation(desugarMutation(entry, mctx.context), mctx.policy);
    assertWritableColumns(m, mctx.schema);
    return compileMutation(m);
  });

  const runAll = async (q: PGlite | Transaction): Promise<Row[]> => {
    const rows: Row[] = [];
    for (const c of compiled) {
      const params = await resolveParams(c.slots, mctx.context, mctx.scope);
      const res = await q.query(c.sql, params);
      rows.push(...(res.rows as Row[]));
    }
    return rows;
  };

  // A batch runs atomically; a single write needs no transaction.
  return compiled.length === 1 ? runAll(db) : db.transaction((tx) => runAll(tx));
};
