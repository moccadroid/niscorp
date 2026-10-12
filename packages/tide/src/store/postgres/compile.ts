import { z } from 'zod';
import type { Comparison, Order } from '../../types';
import { snake, toColumn } from './rows';

export type Fields = Readonly<Record<string, unknown>>;
type Ordering = readonly { by: string; dir?: 'asc' | 'desc' }[];

const COMPARATORS = [
  ['eq', '='],
  ['ne', '<>'],
  ['lt', '<'],
  ['lte', '<='],
  ['gt', '>'],
  ['gte', '>='],
] as const;

const ComparisonSchema = z.object({
  eq: z.unknown().optional(),
  ne: z.unknown().optional(),
  lt: z.unknown().optional(),
  lte: z.unknown().optional(),
  gt: z.unknown().optional(),
  gte: z.unknown().optional(),
  in: z.array(z.unknown()).readonly().optional(),
  notIn: z.array(z.unknown()).readonly().optional(),
  isNull: z.boolean().optional(),
}) satisfies z.ZodType<Comparison<unknown>>;

const comparisonOn = (field: string, test: object): Comparison<unknown> => {
  const read = ComparisonSchema.safeParse(test);
  if (read.success) return read.data;
  const misfits = read.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`tide store: what "${field}" is compared with does not read as a comparison (${misfits})`);
};

type Bind = { sql: string; params: unknown[] };

export const compileWhere = (where: Fields | undefined, start: number, alias = ''): Bind => {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const prefix = alias === '' ? '' : `${alias}.`;
  const slot = (value: unknown): string => {
    params.push(value);
    return `$${start + params.length - 1}`;
  };

  for (const [field, test] of Object.entries(where ?? {})) {
    const column = `${prefix}${snake(field)}`;
    const bare = snake(field);
    if (test === null || typeof test !== 'object' || Array.isArray(test)) {
      // An equality on `undefined` means IS NULL, which is what the engine
      // means when it filters on a column it just cleared.
      clauses.push(test === undefined ? `${column} IS NULL` : `${column} = ${slot(toColumn(bare, test))}`);
      continue;
    }

    const comparison = comparisonOn(field, test);
    for (const [op, symbol] of COMPARATORS) {
      const operand = comparison[op];
      if (operand === undefined) continue;
      // `ne` must be true for a NULL column: a run that has never been
      // drained is not drained, and plain SQL `<>` answers NULL there.
      clauses.push(op === 'ne' ? `(${column} IS NULL OR ${column} <> ${slot(toColumn(bare, operand))})` : `${column} ${symbol} ${slot(toColumn(bare, operand))}`);
    }
    if (comparison.in !== undefined) clauses.push(`${column} = ANY(${slot(comparison.in.map((value) => toColumn(bare, value)))})`);
    if (comparison.notIn !== undefined) clauses.push(`NOT (${column} = ANY(${slot(comparison.notIn.map((value) => toColumn(bare, value)))}))`);
    if (comparison.isNull !== undefined) clauses.push(comparison.isNull ? `${column} IS NULL` : `${column} IS NOT NULL`);
  }

  return { sql: clauses.length === 0 ? 'TRUE' : clauses.join(' AND '), params };
};

export const compileOrder = (order: Ordering | undefined, alias = ''): string => {
  if (order === undefined || order.length === 0) return '';
  const prefix = alias === '' ? '' : `${alias}.`;
  return ` ORDER BY ${order.map((key) => `${prefix}${snake(key.by)} ${key.dir === 'desc' ? 'DESC' : 'ASC'}`).join(', ')}`;
};

export const sortRows = <R>(rows: readonly R[], order: Order<R> | undefined): R[] => {
  if (order === undefined || order.length === 0) return [...rows];
  return [...rows].sort((left, right) => {
    for (const key of order) {
      const a: unknown = left[key.by];
      const b: unknown = right[key.by];
      const compared = typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
      if (compared !== 0) return compared * (key.dir === 'desc' ? -1 : 1);
    }
    return 0;
  });
};

export const compileSet = (set: Fields, start: number): Bind => {
  const assignments: string[] = [];
  const params: unknown[] = [];
  for (const [field, value] of Object.entries(set)) {
    const column = snake(field);
    if (value !== null && typeof value === 'object' && 'inc' in value) {
      // Column arithmetic, so two settling tasks cannot lose an increment
      // between a read and a write.
      assignments.push(`${column} = coalesce(${column}, 0) + ${Number(value.inc)}`);
      continue;
    }
    params.push(toColumn(column, value));
    assignments.push(`${column} = $${start + params.length - 1}`);
  }
  return { sql: assignments.join(', '), params };
};
