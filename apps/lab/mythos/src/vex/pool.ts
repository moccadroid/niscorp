import type { PGlite } from '@electric-sql/pglite';
import type { PgPool } from '@niscorp/vex';

// PGlite parses date/time columns into JS `Date`s, which stringify to locale
// strings and can't be formatted by Prism's `$date` (it wants a string or a
// number). App queries therefore run through a pool that returns the raw wire
// strings for DATE (OID 1082) and TIMESTAMPTZ (1184) — mappings format them.
//
// The Vex cache calls `.getTime()` on its own timestamp columns, so it MUST
// keep `Date`s. Hence two pools over the same db: pass the parsers for the
// app/adapter pool, omit them for the cache pool.
const RAW = (value: string): string => value;
export const RAW_DATE_PARSERS: Record<number, (value: string) => unknown> = { 1082: RAW, 1184: RAW };

export const createPglitePool = (
  db: PGlite,
  parsers?: Record<number, (value: string) => unknown>,
): PgPool => ({
  query: (text, values) => db.query(text, values, parsers !== undefined ? { parsers } : undefined),
});
