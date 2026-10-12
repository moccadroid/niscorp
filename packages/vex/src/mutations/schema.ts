import { z } from 'zod';
import { FilterSchema } from '../schemas/filter.schema.js';
import { FieldPathSchema } from '../schemas/identifier.schema.js';
import type { Filter } from '../schemas/filter.schema.js';
import type { FieldOrValue } from '../schemas/value.schema.js';

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

// The value passes through the driver: exact for a key, but a timestamp read
// back as a JS Date keeps only its milliseconds.
const ReturnedSchema = z
  .object({
    $returned: FieldPathSchema.describe(
      '`table.column`: `table` is written by exactly one earlier statement of this batch; `column` is a column of that table, including one the database generated.',
    ),
  })
  .strict()
  .describe(
    'A column of the one row an earlier statement of this batch (an insert, update, upsert or delete) returned — how a later row gets an id the database generated. That statement must return exactly one row; none (its `where` matched no row, or scope kept the row back) or several fails the whole batch and nothing is written. Allowed only as the value of a column a statement sets; never inside a `where`, a `$lookup` or `items`, and never naming an `insertEach` or an `insert` whose `onConflict` has no `set`.',
  );

// No `$scope`: the engine injects it after the parse, so a stored or injected
// mutation cannot place, omit or redirect it.
const ValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({ $context: z.string() }).strict(),
  LookupSchema,
  ReturnedSchema,
]);

const Columns = z
  .record(z.string(), ValueSchema)
  .refine((r) => Object.keys(r).length > 0, { message: 'a write must set at least one column' });

const OnConflictSchema = z
  .object({
    target: z.array(z.string()).min(1).describe('Conflict columns — must match a unique index or the primary key'),
    set: Columns.optional().describe('DO UPDATE SET when the row already exists; omitted → DO NOTHING (no row returned on conflict)'),
  })
  .strict();

const InsertSchema = z.object({ op: z.literal('insert'), table: z.string(), values: Columns, onConflict: OnConflictSchema.optional() }).strict();
const UpdateSchema = z.object({ op: z.literal('update'), table: z.string(), set: Columns, where: FilterSchema }).strict();
const DeleteSchema = z.object({ op: z.literal('delete'), table: z.string(), where: FilterSchema }).strict();

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

const UpsertSchema = z
  .object({
    op: z.literal('upsert'),
    table: z.string(),
    columns: Columns,
    insert: Columns.optional(),
    key: z.string(),
  })
  .strict()
  .describe('Sugar: insert-or-update by `key` (e.g. "id"). Desugars to update (SET columns WHERE key) when the key is present, else insert (columns + `insert`-only).');

export const MutationSchema = z.discriminatedUnion('op', [InsertSchema, InsertEachSchema, UpdateSchema, DeleteSchema, UpsertSchema]);
export type Mutation = z.infer<typeof MutationSchema>;

export type CoreMutation = Exclude<Mutation, { op: 'upsert' }>;

export const MutationDefinitionSchema = z.union([MutationSchema, MutationSchema.array().min(1)]);
export type MutationDefinition = z.infer<typeof MutationDefinitionSchema>;

export type LookupValue = { $lookup: { from: string; field: string; where: Filter } };
export type ReturnedRef = { $returned: string };
export type ItemRef = { $item: string };
export type MutationValue = FieldOrValue | LookupValue | ReturnedRef;

export type ResolvedOnConflict = { target: string[]; set?: Record<string, MutationValue>; where?: Filter };
export type ResolvedMutation =
  | { op: 'insert'; table: string; values: Record<string, MutationValue>; onConflict?: ResolvedOnConflict }
  | { op: 'insertEach'; table: string; items: { $context: string }; values: Record<string, MutationValue | ItemRef>; onConflict?: ResolvedOnConflict }
  | { op: 'update'; table: string; set: Record<string, MutationValue>; where: Filter }
  | { op: 'delete'; table: string; where: Filter };
