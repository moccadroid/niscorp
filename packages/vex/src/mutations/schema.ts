import { z } from 'zod';
import { FilterSchema } from '../schemas/filter.schema.js';
import type { Filter } from '../schemas/filter.schema.js';
import type { FieldOrValue } from '../schemas/value.schema.js';

// ═══════════════════════════════════════════════════════════════
// Mutation grammar — the WRITE sibling of the query DSL.
//
// Closed on purpose. A mutation is authored data (a cache entry seeded by a
// developer), never generated and never client-supplied: the wire replays a
// fingerprint, and the def the fingerprint names lives server-side. The
// grammar rejects the dangerous shapes at parse: `$scope` is unauthorable
// (identity/tenant is engine-injected — see scopeMutation), and update/delete
// REQUIRE a `where` (a write with no WHERE touches every row).
// ═══════════════════════════════════════════════════════════════

// A scalar subquery in value position: read ONE value from another table at
// write time — `(SELECT field FROM from WHERE ...)`. This is how a statement
// references a row it cannot otherwise name (e.g. a person found by email).
// The lookup READS, so the read-phase scope rules of `from` are applied to its
// WHERE by the engine — a write entry is never a read-scope bypass. The WHERE
// should hit a unique key: more than one matching row is a runtime error
// (deliberately — silently picking an arbitrary row would be worse).
const LookupSchema = z
  .object({
    $lookup: z
      .object({
        from: z.string().describe('Table the value is read from'),
        field: z.string().describe('Column the subquery returns'),
        where: FilterSchema.describe('Bounds the lookup — should match at most one row'),
      })
      .strict(),
  })
  .strict()
  .describe('Scalar subquery: reads one value from another table at write time; read scope rules apply');

// A value an AUTHORED mutation may set: a literal, a `{ $context }` ref to
// the caller's runtime values, or a `{ $lookup }` scalar subquery. NOT
// `$scope` — the engine injects it post-parse, so a stored or injected
// mutation cannot place, omit, or redirect it. NOT a field path either — a
// write sets values, it does not read columns.
const ValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({ $context: z.string() }).strict(),
  LookupSchema,
]);

const Columns = z
  .record(z.string(), ValueSchema)
  .refine((r) => Object.keys(r).length > 0, { message: 'a write must set at least one column' });

// ── ON CONFLICT ────────────────────────────────────────────────
// The DB-arbitrated sibling of the `upsert` sugar below. `upsert` branches on
// what the CALLER sent (key present → update); `onConflict` branches on what
// the DATABASE holds (row exists → update/nothing), atomically. `target` must
// name a unique constraint — validated against the introspected schema, so an
// ON CONFLICT that arrests nothing is an authoring error, not a runtime
// surprise. `set` present → DO UPDATE SET (RETURNING yields the row on both
// paths — re-setting one inserted value as a no-op "touch" is the idiom for
// create-or-fetch). `set` absent → DO NOTHING, which returns NO row on
// conflict; callers can read that absence as "already existed".
const OnConflictSchema = z
  .object({
    target: z.array(z.string()).min(1).describe('Conflict columns — must match a unique index or the primary key'),
    set: Columns.optional().describe('DO UPDATE SET when the row already exists; omitted → DO NOTHING (no row returned on conflict)'),
  })
  .strict();

// `where` is a real vex `Filter` — `$context`/`$scope` and scope injection
// behave exactly as they do for reads.
const InsertSchema = z.object({ op: z.literal('insert'), table: z.string(), values: Columns, onConflict: OnConflictSchema.optional() }).strict();
const UpdateSchema = z.object({ op: z.literal('update'), table: z.string(), set: Columns, where: FilterSchema }).strict();
const DeleteSchema = z.object({ op: z.literal('delete'), table: z.string(), where: FilterSchema }).strict();

// ── insertEach ─────────────────────────────────────────────────
// One INSERT for a caller-sized list — `INSERT ... SELECT ... FROM
// jsonb_array_elements($items)`. `items` names a context key holding an array
// of objects; a `{ $item }` value reads a key from the current element (cast
// to the column's type from the schema); every other value (literal,
// `$context`, `$lookup`, engine-injected `$scope`) is constant across rows.
// This is how "one template row per ticked weekday" stays a single authored
// statement instead of a code loop.
const ItemRefSchema = z
  .object({ $item: z.string() })
  .strict()
  .describe('insertEach only: a key read from the current element of `items`');

const EachColumns = z
  .record(z.string(), z.union([ValueSchema, ItemRefSchema]))
  .refine((r) => Object.keys(r).length > 0, { message: 'a write must set at least one column' });

const InsertEachSchema = z
  .object({
    op: z.literal('insertEach'),
    table: z.string(),
    items: z.object({ $context: z.string() }).strict().describe('Context key holding an array of objects — one inserted row per element'),
    values: EachColumns,
    onConflict: OnConflictSchema.optional(),
  })
  .strict();

// ── Sugar ──────────────────────────────────────────────────────
// A sugar op rewrites to the core ops above before anything runs (see
// desugarMutation). `upsert` is insert-or-update keyed on `key`: present in
// the call's context → update that row, absent/empty → insert.
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

export const MutationSchema = z.discriminatedUnion('op', [InsertSchema, InsertEachSchema, UpdateSchema, DeleteSchema, UpsertSchema]);
export type Mutation = z.infer<typeof MutationSchema>;

// The core ops a sugar desugars TO — what the pipeline (scope/validate/
// compile) actually handles. `upsert` never reaches them.
export type CoreMutation = Exclude<Mutation, { op: 'upsert' }>;

// One write, or a batch run together in a single transaction.
export const MutationDefinitionSchema = z.union([MutationSchema, MutationSchema.array().min(1)]);
export type MutationDefinition = z.infer<typeof MutationDefinitionSchema>;

// The value shapes as the ENGINE sees them (authored + injected).
export type LookupValue = { $lookup: { from: string; field: string; where: Filter } };
export type ItemRef = { $item: string };
export type MutationValue = FieldOrValue | LookupValue;

// After scopeMutation the engine may have injected `{ $scope }` refs that the
// authored grammar forbids — so the resolved form's columns widen to the full
// `MutationValue`. It may also have widened `onConflict` with a `where` (the
// RLS filter on the DO UPDATE half — `match` rules land there when the
// conflict target does not already pin them). Authored (`Mutation`) →
// resolved is a pure widening.
export type ResolvedOnConflict = { target: string[]; set?: Record<string, MutationValue>; where?: Filter };
export type ResolvedMutation =
  | { op: 'insert'; table: string; values: Record<string, MutationValue>; onConflict?: ResolvedOnConflict }
  | { op: 'insertEach'; table: string; items: { $context: string }; values: Record<string, MutationValue | ItemRef>; onConflict?: ResolvedOnConflict }
  | { op: 'update'; table: string; set: Record<string, MutationValue>; where: Filter }
  | { op: 'delete'; table: string; where: Filter };
