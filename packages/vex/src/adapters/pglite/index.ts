import type { PgPool } from '../postgres/introspect.js';

type PgliteQuery = (
  text: string,
  values?: unknown[],
  options?: { parsers?: Record<number, (value: string) => unknown> },
) => Promise<{ rows: Record<string, unknown>[]; fields?: Array<{ name: string; dataTypeID: number }> }>;

type PgliteLike = {
  query: PgliteQuery;
  transaction?: <T>(fn: (tx: { query: PgliteQuery }) => Promise<T>) => Promise<T>;
};

const RAW = (value: string): string => value;

// OIDs: DATE is 1082, TIMESTAMPTZ is 1184. Not for a pool handed to the vex
// cache, which reads its timestamp columns as Dates.
export const RAW_DATE_PARSERS: Record<number, (value: string) => unknown> = { 1082: RAW, 1184: RAW };

export const createPglitePool = (db: PgliteLike, parsers?: Record<number, (value: string) => unknown>): PgPool => {
  const options = parsers !== undefined ? { parsers } : undefined;
  // PGlite runs Postgres on one thread, where `statement_timeout`'s timer
  // never fires.
  const pool: PgPool = { query: (text, values) => db.query(text, values, options), statementTimeouts: false };

  // Called on `db`, not destructured off it: PGlite's `transaction` is a class
  // method that needs its receiver.
  if (db.transaction !== undefined)
    pool.transaction = (fn) => db.transaction!((tx) => fn({ query: (text, values) => tx.query(text, values, options) }));

  return pool;
};
