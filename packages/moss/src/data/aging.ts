import type { PgPool } from '@niscorp/vex';

// Raw, and the one place moss deletes what the artifactory holds: vex keeps every
// statement of its own to one principal's rows, and what nobody has used for long
// enough is unused whoever's it is. What is published for everybody never ages.
const UNUSED_VERSIONS = /* sql */ `DELETE FROM artifacts a
WHERE a.principal <> '*'
  AND (SELECT max(coalesce(b.last_used_at, b.created_at)) FROM artifacts b WHERE b.principal = a.principal AND b.kind = a.kind AND b.id = a.id) < now() - ($1::bigint * interval '1 millisecond')
RETURNING a.save`;

const EMPTY_SAVES = /* sql */ `DELETE FROM artifact_saves s WHERE NOT EXISTS (SELECT 1 FROM artifacts a WHERE a.save = s.id) RETURNING s.id`;

export const sweepUnused = async (pool: PgPool, unusedMs: number): Promise<{ versions: number; saves: number }> => {
  const versions = (await pool.query(UNUSED_VERSIONS, [unusedMs])).rows.length;
  const saves = (await pool.query(EMPTY_SAVES)).rows.length;
  return { versions, saves };
};

export const AGING_EVERY_MS = 3_600_000;

// Sweeps once as the server comes up and then every hour.
export const startAging = (pool: PgPool, unusedMs: number, everyMs = AGING_EVERY_MS): (() => void) => {
  const sweep = async (): Promise<void> => {
    try {
      const swept = await sweepUnused(pool, unusedMs);
      if (swept.versions > 0) console.log(`[moss] aging: ${swept.versions} version(s) of what was generated and unused for ${unusedMs} ms deleted, and ${swept.saves} save(s) left empty`);
    } catch (error) {
      console.error('[moss] aging: the sweep failed, and is tried again at the next:', error);
    }
  };
  void sweep();
  const timer = setInterval(() => void sweep(), everyMs);
  return () => clearInterval(timer);
};
