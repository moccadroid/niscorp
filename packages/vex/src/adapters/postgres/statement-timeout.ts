import type { PgPool } from './introspect.js';

// ═══════════════════════════════════════════════════════════════
// HOW LONG ONE READ MAY RUN, enforced where it is cheapest.
//
// The engine asks for a ceiling (`config.statementTimeoutMs`); the database
// is what has to enforce it — a client that stops waiting leaves the query
// running on the server (measured: `query_timeout` gave up at 200ms and the
// sleep was still active in pg_stat_activity). Postgres enforces
// `statement_timeout` two ways, and they cost very differently (Postgres 17,
// 500 reads each):
//
//   · on the connection (the pool's own `statement_timeout`, a role or a
//     database default) — 0.36ms a read, the same as none;
//   · per statement (`SET LOCAL` in a transaction) — 1.37ms a read, 3.4×,
//     and more across a network.
//
// So the adapter asks the database once what its connections already
// enforce. At or under the ceiling: reads run plain. Otherwise each read is
// wrapped. A pool that cannot enforce it at all (PGlite: single-threaded, the
// timer never fires — a 2s sleep ran 2.9s under a 200ms limit) says so, and
// reads run unbounded with one warning.
// ═══════════════════════════════════════════════════════════════

export type TimeoutEnforcement = 'connection' | 'statement' | 'unenforced';

// `SHOW statement_timeout` answers in Postgres units: '0', '250ms', '5s',
// '1min', '2h', '1d'; a bare number is milliseconds.
const UNIT_MS: Record<string, number> = { '': 1, ms: 1, s: 1000, min: 60_000, h: 3_600_000, d: 86_400_000 };

export const parseTimeout = (shown: string): number | undefined => {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|min|h|d)?\s*$/.exec(shown);
  if (match === null) return undefined;
  const unit = UNIT_MS[match[2] ?? ''];
  return unit === undefined ? undefined : Number(match[1]) * unit;
};

export const enforcementFor = async (pool: PgPool, ceilingMs: number): Promise<TimeoutEnforcement> => {
  if (pool.statementTimeouts === false) return 'unenforced';
  const shown = await pool.query('SHOW statement_timeout');
  const current = parseTimeout(String(shown.rows[0]?.['statement_timeout'] ?? ''));
  if (current !== undefined && current > 0 && current <= ceilingMs) return 'connection';
  return pool.transaction === undefined ? 'unenforced' : 'statement';
};
