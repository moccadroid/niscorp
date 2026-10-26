import type { PgPool } from '../postgres/introspect.js';
import type { TypeParsers } from '../postgres/date-parsers.js';

export { RAW_DATE_PARSERS } from '../postgres/date-parsers.js';

type PgliteQuery = (
  text: string,
  values?: unknown[],
  options?: { parsers?: TypeParsers },
) => Promise<{ rows: Record<string, unknown>[]; fields?: Array<{ name: string; dataTypeID: number }> }>;

type PgliteLike = {
  query: PgliteQuery;
  transaction?: <T>(fn: (tx: { query: PgliteQuery }) => Promise<T>) => Promise<T>;
};

export const createPglitePool = (db: PgliteLike, parsers?: TypeParsers): PgPool => {
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
