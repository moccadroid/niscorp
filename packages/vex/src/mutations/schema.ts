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

// A value an AUTHORED mutation may set: a literal, or a `{ $context }` ref to
// the caller's runtime values. NOT `$scope` — the engine injects it post-parse,
// so a stored or injected mutation cannot place, omit, or redirect it. NOT a
// field path either — a write sets values, it does not read columns.
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

// `where` is a real vex `Filter` — `$context`/`$scope` and scope injection
// behave exactly as they do for reads.
const InsertSchema = z.object({ op: z.literal('insert'), table: z.string(), values: Columns }).strict();
const UpdateSchema = z.object({ op: z.literal('update'), table: z.string(), set: Columns, where: FilterSchema }).strict();
const DeleteSchema = z.object({ op: z.literal('delete'), table: z.string(), where: FilterSchema }).strict();

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

export const MutationSchema = z.discriminatedUnion('op', [InsertSchema, UpdateSchema, DeleteSchema, UpsertSchema]);
export type Mutation = z.infer<typeof MutationSchema>;

// The three core ops a sugar desugars TO — what the pipeline (scope/validate/
// compile) actually handles. `upsert` never reaches them.
export type CoreMutation = Exclude<Mutation, { op: 'upsert' }>;

// One write, or a batch run together in a single transaction.
export const MutationDefinitionSchema = z.union([MutationSchema, MutationSchema.array().min(1)]);
export type MutationDefinition = z.infer<typeof MutationDefinitionSchema>;

// After scopeMutation the engine may have injected `{ $scope }` refs that the
// authored grammar forbids — so the resolved form's columns widen to the full
// `FieldOrValue`. Authored (`Mutation`) → resolved is a pure widening.
export type ResolvedMutation =
  | { op: 'insert'; table: string; values: Record<string, FieldOrValue> }
  | { op: 'update'; table: string; set: Record<string, FieldOrValue>; where: Filter }
  | { op: 'delete'; table: string; where: Filter };
