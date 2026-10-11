import type { Comparison, Order } from '../../types';
import { snake, toColumn } from './rows';

// ── the WHERE compiler ──────────────────────────────────────────

// What a store is asked with, as the compilers read it: fields by name. A
// `Where`, an `Order` and a `Mutation` over any one table are each one of
// these, so a compiler takes the table's own and asks for no cast.
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

// Anything that is an object and not a list is a comparison: `{ gt: 3 }`,
// `{ in: [...] }`. Every other value is what the column must equal.
const isComparison = (test: unknown): test is Comparison<unknown> => test !== null && typeof test === 'object' && !Array.isArray(test);

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
    if (!isComparison(test)) {
      // An equality on `undefined` means IS NULL, which is what the engine
      // means when it filters on a column it just cleared.
      clauses.push(test === undefined ? `${column} IS NULL` : `${column} = ${slot(toColumn(bare, test))}`);
      continue;
    }

    const comparison = test;
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

// The same comparison SQL made, applied to what came back. Kept beside the
// compiler so the two cannot drift.
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
