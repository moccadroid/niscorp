import { describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import { checksumOf, type Sequence } from '@niscorp/strata';
import { readLedger } from '@niscorp/strata/postgres';
import { MOSS_SEQUENCE } from '../src/integrations';
import { SESSIONS_SEQUENCE } from '../src/sessions';
import { TIDE_SEQUENCE } from '../src/tide';
import { createServer } from '../src/server';

// ═══════════════════════════════════════════════════════════════
// HISTORY, PINNED. Every deployed database has run these migrations and
// recorded their checksums. Edit one and each of those databases refuses to
// boot (strata: EDITED) — so the edit has to be caught HERE, in CI, not there.
//
// Red here means an applied migration changed. Do not re-pin the checksum:
// put the change back, and append a new migration to the sequence instead.
// (Rewording a full-line `--` comment is fine — strata hashes without them.)
// ═══════════════════════════════════════════════════════════════

const PINNED: ReadonlyArray<[Sequence, number, string]> = [
  [MOSS_SEQUENCE, 1, '1c21031de558301ea60804cce1ed1e5c636aa8644fcdedc1ef96f5bebb558880'],
  [SESSIONS_SEQUENCE, 1, '83a62e0217940bfe62136052c18f730947355d20e481d9aceb76463251b33700'],
  [TIDE_SEQUENCE, 1, '41f565e0faf179237fb6b92ca50f6266677871a4965e61bc3494a1d59d9c541b'],
];

describe('baselines — applied migrations are history', () => {
  it.each(PINNED.map(([sequence, n, checksum]) => [`${sequence.id}/${n}`, sequence, n, checksum] as const))(
    '%s is unchanged',
    async (_ref, sequence, n, checksum) => {
      const migration = sequence.migrations[n - 1];
      expect(migration).toBeDefined();
      if (migration !== undefined) expect(await checksumOf(migration)).toBe(checksum);
    },
  );
});

describe('boot — every owner through one ledger', () => {
  const app = { charter: {}, actions: {} };
  const quietly = <T>(run: () => Promise<T>): Promise<T> => {
    // 'dev-open' announces itself on every boot; that line is not this test.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    return run().finally(() => warn.mockRestore());
  };

  it('a fresh database is migrated once and recorded; the next boot finds nothing to do', async () => {
    const pool = createPglitePool(new PGlite());
    await quietly(() => createServer(app, { pool, db: pool, session: 'sessions' }));
    const ledger = await readLedger(pool);
    expect(ledger.map((r) => `${r.sequence}/${r.n}`)).toEqual(['nisc.moss/1', 'nisc.moss.sessions/1', 'nisc.vex.cache/1']);

    await quietly(() => createServer(app, { pool, db: pool, session: 'sessions', migrations: 'verify' }));
    expect((await readLedger(pool)).length).toBe(3);
  });

  it("migrations: 'verify' refuses a database nobody migrated — and creates nothing", async () => {
    const pool = createPglitePool(new PGlite());
    const error = await quietly(() => createServer(app, { pool, db: pool, session: 'dev-open', migrations: 'verify' })).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'PENDING' });
    expect(String(error)).toContain('nisc.moss/1');
    const { rows } = await pool.query(`SELECT to_regclass('integrations') IS NULL AS absent`);
    expect(rows[0]?.['absent']).toBe(true);
  });

  it('a deployment from before the ledger converges: an older integrations table gains its later columns, rows kept', async () => {
    const pool = createPglitePool(new PGlite());
    await pool.query(`CREATE TABLE integrations (id text PRIMARY KEY, url text NOT NULL, key_hash text, status text NOT NULL DEFAULT 'pending')`);
    await pool.query(`INSERT INTO integrations (id, url) VALUES ('acme', 'https://acme.example')`);
    await quietly(() => createServer(app, { pool, db: pool, session: 'dev-open' }));
    const { rows } = await pool.query(`SELECT id, reach, assistants, phrasebook FROM integrations`);
    expect(rows).toEqual([{ id: 'acme', reach: [], assistants: [], phrasebook: {} }]);
  });
});
