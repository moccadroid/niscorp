import type { PGlite } from '@electric-sql/pglite';
import type { Row, TransformFn } from '../src/index';
import type { TidePool } from '../src/store/postgres';

// A five-op stand-in for the `transform` seam. Tide doesn't know Prism —
// that is the whole point of the seam — so the tests don't import it either.
// Under moss this is `evaluate` from @niscorp/prism; here it is enough of an
// evaluator to prove templates are handed over and handed back.
export const testTransform: TransformFn = (config: unknown, source: Row): unknown => {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;

    const record: Record<string, unknown> = { ...(node as Record<string, unknown>) };

    if ('$ref' in record && typeof record.$ref === 'string') {
      const path = record.$ref.replace(/^\$\.?/, '');
      if (path === '') return source;
      return path.split('.').reduce<unknown>((value, key) => {
        if (value === null || typeof value !== 'object') return undefined;
        return (value as Record<string, unknown>)[key];
      }, source);
    }
    if ('$eq' in record && Array.isArray(record.$eq)) {
      const [left, right] = record.$eq.map(walk);
      return left === right;
    }
    if ('$not' in record) return !walk(record.$not);
    if ('$length' in record) {
      const value = walk(record.$length);
      return Array.isArray(value) ? value.length : 0;
    }
    if ('$throw' in record) throw new Error(String(record.$throw));

    return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, walk(value)]));
  };
  return walk(config);
};

export const rowsOf = (rows: readonly Row[]) => () => rows;

// A clock a test drives by hand. Tide reads no wall clock, so "advance
// time" is arithmetic, not a sleep.
export const clockFrom = (start: number) => {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
      return current;
    },
  };
};

export const utc = (iso: string): number => Date.parse(iso);

// A PGlite as the pool the Postgres store runs on: a statement, and a
// transaction. Both are called ON the database, never taken off it — they are
// methods that reach for `this`.
export const pglitePool = (db: PGlite): TidePool => ({
  query: (text, values) => db.query(text, values),
  transaction: (fn) => db.transaction((tx) => fn({ query: (text, values) => tx.query(text, values) })),
});
