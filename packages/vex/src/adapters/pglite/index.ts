import type { PgPool } from '../postgres/introspect.js';

// ═══════════════════════════════════════════════════════════════
// PGlite → PgPool — the two-line shim every PGlite-backed app was
// hand-rolling. Structurally typed: anything with PGlite's query
// signature works, so this package takes NO dependency on
// @electric-sql/pglite.
//
// Date handling is the one real decision here. PGlite parses date/time
// columns into JS `Date`s, which stringify to locale noise AND can't be
// formatted by Prism's `$date` (it wants a string/number). So app/adapter
// pools pass RAW_DATE_PARSERS to get the raw wire strings back — while the
// vex cache calls `.getTime()` on its own timestamp columns, so it MUST
// keep `Date`s. Hence two pools over the same db: parsers for the adapter
// pool, none for the cache pool.
// ═══════════════════════════════════════════════════════════════

type PgliteQuery = (
  text: string,
  values?: unknown[],
  options?: { parsers?: Record<number, (value: string) => unknown> },
) => Promise<{ rows: Record<string, unknown>[]; fields?: Array<{ name: string; dataTypeID: number }> }>;

type PgliteLike = {
  query: PgliteQuery;
  // PGlite has this natively. Optional here only so the shim still accepts a
  // narrower object — a `db` that cannot transact yields a pool that says so
  // rather than one that pretends.
  transaction?: <T>(fn: (tx: { query: PgliteQuery }) => Promise<T>) => Promise<T>;
};

const RAW = (value: string): string => value;

// DATE (OID 1082) and TIMESTAMPTZ (1184) come back as raw wire strings.
export const RAW_DATE_PARSERS: Record<number, (value: string) => unknown> = { 1082: RAW, 1184: RAW };

export const createPglitePool = (db: PgliteLike, parsers?: Record<number, (value: string) => unknown>): PgPool => {
  const options = parsers !== undefined ? { parsers } : undefined;
  const pool: PgPool = { query: (text, values) => db.query(text, values, options) };

  // PASSED THROUGH, not reimplemented. Wrapping BEGIN/COMMIT by hand over a
  // single `query` would be wrong on a real pool — the statements could land
  // on different connections — and PGlite already pins the right one.
  //
  // Without this, every batch mutation in every app on this adapter threw.
  // Called ON `db`, not destructured off it. PGlite's `transaction` is a
  // class method that reaches for `this`; pulling it out of the object hands
  // it an undefined receiver and it dies inside the library on a property
  // nobody here has heard of.
  if (db.transaction !== undefined)
    pool.transaction = (fn) => db.transaction!((tx) => fn({ query: (text, values) => tx.query(text, values, options) }));

  return pool;
};
