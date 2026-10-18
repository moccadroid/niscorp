import { describe, it, expect, vi } from 'vitest';
import { migrate } from '@niscorp/strata/postgres';
import { createPglitePool } from '@niscorp/vex/pglite';
import type { PgPool } from '@niscorp/vex';
import { MOSS_SEQUENCE } from '../src/data';
import { startAging, sweepUnused } from '../src/data/aging';
import { pristineDatabases } from './pristine-database';

const freshDatabase = pristineDatabases();

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Row = { save: string; kind: string; id: string; principal: string; createdAgoMs: number; usedAgoMs?: number };

const saved = async (pool: PgPool, rows: readonly Row[]): Promise<void> => {
  for (const row of rows) {
    await pool.query(`INSERT INTO artifact_saves (id, created_by, principal, created_at) VALUES ($1, $2, $2, now() - ($3::bigint * interval '1 millisecond')) ON CONFLICT (id) DO NOTHING`, [
      row.save,
      row.principal,
      row.createdAgoMs,
    ]);
    await pool.query(
      `INSERT INTO artifacts (save, kind, id, principal, body, created_at, last_used_at) VALUES ($1, $2, $3, $4, '{}'::jsonb, now() - ($5::bigint * interval '1 millisecond'), CASE WHEN $6::bigint IS NULL THEN NULL ELSE now() - ($6::bigint * interval '1 millisecond') END)`,
      [row.save, row.kind, row.id, row.principal, row.createdAgoMs, row.usedAgoMs ?? null],
    );
  }
};

const left = async (pool: PgPool): Promise<string[]> =>
  (await pool.query(`SELECT principal, kind, id FROM artifacts ORDER BY principal, kind, id`)).rows.map((row) => `${String(row['principal'])}/${String(row['kind'])}/${String(row['id'])}`);

describe('aging — what a person generated and nobody has used for long enough is deleted', () => {
  it('deletes every version of an artifact unused for longer than the limit, and keeps one used, one young, and everything published', async () => {
    const pool = createPglitePool(freshDatabase());
    await migrate(pool, [MOSS_SEQUENCE]);
    await saved(pool, [
      { save: '00000000-0000-4000-8000-000000000001', kind: 'action', id: 'generated.old', principal: 'ada', createdAgoMs: 40 * DAY },
      { save: '00000000-0000-4000-8000-000000000002', kind: 'action', id: 'generated.old', principal: 'ada', createdAgoMs: 35 * DAY },
      { save: '00000000-0000-4000-8000-000000000003', kind: 'layout', id: 'a-layout', principal: 'ada', createdAgoMs: 40 * DAY, usedAgoMs: 2 * DAY },
      { save: '00000000-0000-4000-8000-000000000004', kind: 'action', id: 'generated.young', principal: 'ben', createdAgoMs: 3 * DAY },
      { save: '00000000-0000-4000-8000-000000000005', kind: 'layout', id: 'everybodys', principal: '*', createdAgoMs: 400 * DAY },
      { save: '00000000-0000-4000-8000-000000000006', kind: 'read', id: 'fp_0123456789abcdef', principal: 'ben', createdAgoMs: 60 * DAY },
    ]);

    const swept = await sweepUnused(pool, 30 * DAY);

    expect(swept).toEqual({ versions: 3, saves: 3 });
    expect(await left(pool)).toEqual(['*/layout/everybodys', 'ada/layout/a-layout', 'ben/action/generated.young']);
    expect((await pool.query(`SELECT id FROM artifact_saves ORDER BY id`)).rows.map((row) => String(row['id']))).toEqual([
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000005',
    ]);
  });

  it('an artifact used once within the limit is kept whole, its older versions too', async () => {
    const pool = createPglitePool(freshDatabase());
    await migrate(pool, [MOSS_SEQUENCE]);
    await saved(pool, [
      { save: '00000000-0000-4000-8000-000000000011', kind: 'action', id: 'generated.kept', principal: 'ada', createdAgoMs: 90 * DAY },
      { save: '00000000-0000-4000-8000-000000000012', kind: 'action', id: 'generated.kept', principal: 'ada', createdAgoMs: 80 * DAY, usedAgoMs: HOUR },
    ]);

    expect(await sweepUnused(pool, 30 * DAY)).toEqual({ versions: 0, saves: 0 });
    expect(await left(pool)).toEqual(['ada/action/generated.kept', 'ada/action/generated.kept']);
  });

  it('started, the sweep runs at once and then on its own clock, and stops when told', async () => {
    vi.useFakeTimers();
    try {
      let swept = 0;
      const pool: PgPool = { query: async (text: string) => (text.startsWith('DELETE FROM artifacts') && (swept += 1), { rows: [] }) };
      const stop = startAging(pool, DAY, HOUR);
      await vi.advanceTimersByTimeAsync(0);
      expect(swept).toBe(1);
      await vi.advanceTimersByTimeAsync(3 * HOUR);
      expect(swept).toBe(4);
      stop();
      await vi.advanceTimersByTimeAsync(3 * HOUR);
      expect(swept).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
