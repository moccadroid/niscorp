import { z } from 'zod';
import { FactKindSchema, OpSchema } from '../../schemas';
import type { TableName, TideTables } from '../../types';

export const SQL_TABLE: Record<TableName, string> = {
  fact: 'tide_fact',
  run: 'tide_run',
  task: 'tide_work',
  state: 'tide_reflex_state',
};

// `as` is an SQL keyword: the one field whose column is named otherwise.
const COLUMN_OVERRIDES: Record<string, string> = { as: 'as_who' };

export const snake = (field: string): string => COLUMN_OVERRIDES[field] ?? field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const camel = (column: string): string => {
  for (const [field, mapped] of Object.entries(COLUMN_OVERRIDES)) if (mapped === column) return field;
  return column.replace(/_([a-z])/g, (_all, c: string) => c.toUpperCase());
};

const JSON_COLUMNS = new Set(['row', 'payload', 'stats', 'fact_ids', 'env', 'input', 'output']);
const BIGINT_COLUMNS = new Set([
  'at',
  'not_before',
  'delivered_at',
  'depth',
  'descendants',
  'due_at',
  'created_at',
  'settled_at',
  'claimed_until',
  'armed_at',
  'materialized_through',
  'attempt',
  'selected',
  'total',
  'done',
  'failed',
]);

export const toColumn = (column: string, value: unknown): unknown => {
  if (value === undefined) return null;
  if (JSON_COLUMNS.has(column)) return JSON.stringify(value);
  return value;
};

const fromColumn = (column: string, value: unknown): unknown => {
  if (value === null) return undefined;
  if (JSON_COLUMNS.has(column)) return typeof value === 'string' ? JSON.parse(value) : value;
  // `bigint` comes back as a string on some drivers and a number on others.
  // Tide compares these with `<`, so the difference is not cosmetic.
  if (BIGINT_COLUMNS.has(column)) return Number(value);
  return value;
};

const FactRowSchema = z.object({
  id: z.string(),
  kind: FactKindSchema,
  entity: z.string().optional(),
  op: OpSchema.optional(),
  row: z.record(z.string(), z.unknown()).optional(),
  name: z.string().optional(),
  payload: z.unknown().optional(),
  reflex: z.string().optional(),
  runId: z.string().optional(),
  occurrence: z.string().optional(),
  stats: z.object({ total: z.number(), done: z.number(), failed: z.number() }).optional(),
  target: z.string().optional(),
  by: z.string().optional(),
  at: z.number(),
  notBefore: z.number().optional(),
  dedupeKey: z.string().optional(),
  cause: z.string().optional(),
  depth: z.number(),
  deliveredAt: z.number().optional(),
  parked: z.string().optional(),
  released: z.boolean().optional(),
  as: z.string().optional(),
  root: z.string().optional(),
  descendants: z.number().optional(),
});

const RunRowSchema = z.object({
  id: z.string(),
  reflexId: z.string(),
  version: z.string(),
  as: z.string().optional(),
  cause: z.string(),
  occurrence: z.string().optional(),
  factIds: z.array(z.string()).optional(),
  state: z.enum(['pending', 'fanned', 'settled', 'skipped']),
  depth: z.number(),
  selected: z.number().optional(),
  total: z.number(),
  done: z.number(),
  failed: z.number(),
  dueAt: z.number(),
  createdAt: z.number(),
  settledAt: z.number().optional(),
  drained: z.boolean().optional(),
  note: z.string().optional(),
});

const TaskRowSchema = z.object({
  id: z.string(),
  runId: z.string(),
  reflexId: z.string(),
  unit: z.string(),
  cause: z.string(),
  env: z.record(z.string(), z.unknown()),
  depth: z.number(),
  state: z.enum(['pending', 'claimed', 'retrying', 'done', 'failed']),
  attempt: z.number(),
  token: z.string().optional(),
  claimedUntil: z.number(),
  notBefore: z.number(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  createdAt: z.number(),
  settledAt: z.number().optional(),
});

const StateRowSchema = z.object({
  reflexId: z.string(),
  armedAt: z.number(),
  materializedThrough: z.number().optional(),
});

const ROW_SCHEMAS: { [T in TableName]: z.ZodType<TideTables[T]> } = {
  fact: FactRowSchema,
  run: RunRowSchema,
  task: TaskRowSchema,
  state: StateRowSchema,
};

export const rowToEntity = <T extends TableName>(table: T, row: Record<string, unknown>): TideTables[T] => {
  const entity: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    const mapped = fromColumn(column, value);
    if (mapped !== undefined) entity[camel(column)] = mapped;
  }
  const read = ROW_SCHEMAS[table].safeParse(entity);
  if (!read.success) {
    const misfits = read.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`tide store: a row of ${SQL_TABLE[table]} does not read as a ${table} (${misfits})`);
  }
  return read.data;
};
