import type { PgPool } from './introspect.js';

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
