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

type PgliteLike = {
  query: (
    text: string,
    values?: unknown[],
    options?: { parsers?: Record<number, (value: string) => unknown> },
  ) => Promise<{ rows: Record<string, unknown>[]; fields?: Array<{ name: string; dataTypeID: number }> }>;
};

const RAW = (value: string): string => value;

// DATE (OID 1082) and TIMESTAMPTZ (1184) come back as raw wire strings.
export const RAW_DATE_PARSERS: Record<number, (value: string) => unknown> = { 1082: RAW, 1184: RAW };

export const createPglitePool = (db: PgliteLike, parsers?: Record<number, (value: string) => unknown>): PgPool => ({
  query: (text, values) => db.query(text, values, parsers !== undefined ? { parsers } : undefined),
});
