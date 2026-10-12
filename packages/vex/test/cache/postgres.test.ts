import { describe, it, expect, vi } from 'vitest';
import { createPostgresCache } from '../../src/cache/postgres.js';
import type { PgPool } from '../../src/cache/postgres.js';
import type { CacheEntry, OkCacheEntry } from '../../src/cache/cache.types.js';
import type { CompiledIr } from '@niscorp/prism';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { checksumOf } from '@niscorp/strata';

type DbRow = {
  key: string;
  kind: string;
  intent: string | null;
  shape: unknown;
  dsl: unknown;
  prism_ir: unknown;
  reason: string | null;
  created_at: Date;
  expires_at: Date | null;
  schema_fingerprint: string | null;
  reach: string | null;
  refresh?: string | null;
};

const makeFakePool = () => {
  const rows = new Map<string, DbRow>();
  const notExpired = (r: DbRow) => r.expires_at === null || r.expires_at.getTime() > Date.now();

  const query: PgPool['query'] = async (text: string, values?: unknown[]) => {
      const sql = text.trim();
      const v = values ?? [];

      if (sql.includes('strata_ledger') || sql.includes('pg_advisory_xact_lock') || sql.startsWith('ALTER TABLE')) {
        return { rows: [] };
      }
      if (sql.startsWith('CREATE SCHEMA') || sql.startsWith('CREATE TABLE')) {
        return { rows: [] };
      }
      if (sql.startsWith('INSERT INTO')) {
        // Positional, in the parameter order of the INSERT in `postgres.ts`: a
        // column inserted in the middle shifts every field after it.
        const [key, kind, intent, shape, dsl, prismIr, reach, reason, createdAt, expiresAt, fingerprint, , , , refresh] = v;
        rows.set(key as string, {
          key: key as string,
          kind: kind as string,
          intent: (intent as string | null) ?? null,
          shape: shape === null ? null : JSON.parse(shape as string),
          dsl: dsl === null ? null : JSON.parse(dsl as string),
          prism_ir: prismIr === null ? null : JSON.parse(prismIr as string),
          reason: (reason as string | null) ?? null,
          created_at: createdAt as Date,
          expires_at: (expiresAt as Date | null) ?? null,
          schema_fingerprint: (fingerprint as string | null) ?? null,
          reach: (reach as string | null) ?? null,
          refresh: (refresh as string | null) ?? null,
        });
        return { rows: [] };
      }
      if (sql.startsWith('DELETE FROM')) {
        if (sql.includes('WHERE key')) rows.delete(v[0] as string);
        else rows.clear();
        return { rows: [] };
      }
      if (sql.startsWith('SELECT key FROM')) {
        return { rows: [...rows.values()].filter(notExpired).map((r) => ({ key: r.key })) };
      }
      if (sql.startsWith('SELECT')) {
        if (sql.includes('WHERE key = $1')) {
          const row = rows.get(v[0] as string);
          return { rows: row && notExpired(row) ? [{ ...row }] : [] };
        }
        return { rows: [...rows.values()].filter(notExpired).map((r) => ({ ...r })) };
      }
      return { rows: [] };
  };
  const pool: PgPool = { query, transaction: (fn) => fn({ query }) };

  return { pool, rows };
};

const okEntry = (overrides: Partial<OkCacheEntry> = {}): OkCacheEntry => ({
  kind: 'ok',
  dsl: { from: ['users'], fields: ['users.id'] },
  createdAt: Date.now(),
  ...overrides,
});

describe('createPostgresCache', () => {
  it('set + get round-trips an ok entry', async () => {
    const { pool } = makeFakePool();
    const cache = createPostgresCache({ pool });
    await cache.init();

    await cache.set('k1', okEntry());
    const result = await cache.get('k1');

    expect(result?.kind).toBe('ok');
    expect((result as OkCacheEntry).dsl).toEqual({ from: ['users'], fields: ['users.id'] });
  });

  it('round-trips a prismIr (CompiledIr) through jsonb', async () => {
    const { pool } = makeFakePool();
    const cache = createPostgresCache({ pool });
    await cache.init();

    const ir = {
      irVersion: 1,
      compiler: { name: 'prism', version: '0.1.0' },
      meta: { createdAt: '2026-01-01', fingerprint: 'abc', stats: {} },
      tables: { paths: ['$.result'], strings: [] },
      core: { __const: { id: 1 } },
    } as unknown as CompiledIr;

    await cache.set('k1', okEntry({ prismIr: ir }));
    const result = (await cache.get('k1')) as OkCacheEntry;

    expect(result.prismIr).toEqual(ir);
  });

  it('round-trips a declared reach', async () => {
    const { pool } = makeFakePool();
    const cache = createPostgresCache({ pool });
    await cache.init();
    await cache.set('mine', okEntry({ reach: 'personal' }));
    const got = await cache.get('mine');
    expect(got?.kind).toBe('ok');
    expect(got?.kind === 'ok' ? got.reach : undefined).toBe('personal');
  });

  it('round-trips a refresh mode', async () => {
    const { pool } = makeFakePool();
    const cache = createPostgresCache({ pool });
    await cache.init();
    await cache.set('roster', okEntry({ refresh: 'reactive' }));
    const got = await cache.get('roster');
    expect(got?.kind === 'ok' ? got.refresh : undefined).toBe('reactive');
    await cache.set('plain', okEntry());
    const plain = await cache.get('plain');
    expect(plain?.kind === 'ok' ? plain.refresh : 'set').toBeUndefined();
  });

  it('leaves an entry that declares none without one', async () => {
    const { pool } = makeFakePool();
    const cache = createPostgresCache({ pool });
    await cache.init();
    await cache.set('theirs', okEntry());
    const got = await cache.get('theirs');
    expect(got?.kind === 'ok' ? got.reach : 'set').toBeUndefined();
  });

  it('round-trips the schema fingerprint', async () => {
    const { pool } = makeFakePool();
    const cache = createPostgresCache({ pool });
    await cache.init();

    await cache.set('k1', okEntry({ schemaFingerprint: 'fp-abc' }));
    const result = await cache.get('k1');

    expect(result?.schemaFingerprint).toBe('fp-abc');
  });

  it('round-trips intent and shape metadata', async () => {
    const { pool } = makeFakePool();
    const cache = createPostgresCache({ pool });
    await cache.init();

    await cache.set('k1', okEntry({ intent: 'top customers', shape: [{ id: '', name: '' }] }));
    const result = await cache.get('k1');

    expect(result?.intent).toBe('top customers');
    expect(result?.shape).toEqual([{ id: '', name: '' }]);
  });

  it('round-trips an unsatisfiable entry', async () => {
    const { pool } = makeFakePool();
    const cache = createPostgresCache({ pool });
    await cache.init();

    const entry: CacheEntry = {
      kind: 'unsatisfiable',
      reason: 'no such field',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    };
    await cache.set('bad', entry);
    const result = await cache.get('bad');

    expect(result?.kind).toBe('unsatisfiable');
    expect((result as { reason: string }).reason).toBe('no such field');
  });

  it('treats an expired entry as a miss and excludes it from keys', async () => {
    const { pool } = makeFakePool();
    const cache = createPostgresCache({ pool });
    await cache.init();

    await cache.set('stale', okEntry({ expiresAt: Date.now() - 1 }));
    expect(await cache.get('stale')).toBeUndefined();
    expect(await cache.keys()).not.toContain('stale');
  });

  it('delete and clear remove entries', async () => {
    const { pool } = makeFakePool();
    const cache = createPostgresCache({ pool });
    await cache.init();

    await cache.set('a', okEntry());
    await cache.set('b', okEntry());
    await cache.delete('a');
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBeDefined();

    await cache.clear();
    expect(await cache.keys()).toEqual([]);
  });

  it('entries() returns all live entries', async () => {
    const { pool } = makeFakePool();
    const cache = createPostgresCache({ pool });
    await cache.init();

    await cache.set('a', okEntry({ intent: 'first' }));
    await cache.set('b', okEntry({ intent: 'second' }));
    const all = await cache.entries();

    expect(all).toHaveLength(2);
    expect(all.map((e) => e.key).sort()).toEqual(['a', 'b']);
  });

  it('rejects an invalid write: logs via onError and does not persist', async () => {
    const { pool, rows } = makeFakePool();
    const onError = vi.fn();
    const cache = createPostgresCache({ pool, onError });
    await cache.init();

    const bad = { kind: 'ok', dsl: { nonsense: true }, createdAt: Date.now() } as unknown as CacheEntry;
    await cache.set('bad', bad);

    expect(onError).toHaveBeenCalledOnce();
    expect(rows.has('bad')).toBe(false);
  });

  it('throws on invalid write when no onError handler is given', async () => {
    const { pool } = makeFakePool();
    const cache = createPostgresCache({ pool });
    await cache.init();

    const bad = { kind: 'ok', dsl: { nonsense: true }, createdAt: Date.now() } as unknown as CacheEntry;
    await expect(cache.set('bad', bad)).rejects.toThrow();
  });

  it('evicts an invalid row on read (validate-on-read) and reports it', async () => {
    const { pool, rows } = makeFakePool();
    const onError = vi.fn();
    const cache = createPostgresCache({ pool, onError });
    await cache.init();

    // Corrupt in its `dsl` only: a row missing a column would be evicted for
    // the wrong reason.
    rows.set('corrupt', {
      key: 'corrupt',
      kind: 'ok',
      intent: null,
      shape: null,
      dsl: { nonsense: true },
      prism_ir: null,
      reach: null,
      reason: null,
      created_at: new Date(),
      expires_at: null,
      schema_fingerprint: null,
    });

    expect(await cache.get('corrupt')).toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
    expect(rows.has('corrupt')).toBe(false);
  });

  it('rejects invalid schema/table identifiers', () => {
    const { pool } = makeFakePool();
    expect(() => createPostgresCache({ pool, table: 'vex; DROP TABLE users' })).toThrow();
    expect(() => createPostgresCache({ pool, schema: '1bad' })).toThrow();
  });
});

describe('createPostgresCache — the table, through the ledger', () => {
  const columns = async (pool: PgPool): Promise<string[]> =>
    (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'vex_cache' ORDER BY ordinal_position`)).rows.map((r) =>
      String(r['column_name']),
    );

  it('init applies the table once and records it; a second init runs nothing', async () => {
    const pool = createPglitePool(new PGlite());
    const cache = createPostgresCache({ pool });
    await cache.init();
    await cache.init();
    const ledger = await pool.query('SELECT sequence, n FROM strata_ledger');
    expect(ledger.rows).toEqual([{ sequence: 'nisc.vex.cache', n: 1 }]);
    expect(await columns(pool)).toContain('refresh');
  });

  it('a table from before the later columns converges, and its rows survive', async () => {
    const pool = createPglitePool(new PGlite());
    await pool.query(`CREATE TABLE vex_cache (key text PRIMARY KEY, kind text NOT NULL DEFAULT 'ok', dsl jsonb, created_at timestamptz NOT NULL DEFAULT now())`);
    await pool.query(`INSERT INTO vex_cache (key) VALUES ('kept')`);
    await createPostgresCache({ pool }).init();
    expect(await columns(pool)).toEqual(expect.arrayContaining(['protected', 'last_used_at', 'request_hash', 'reach', 'refresh']));
    expect((await pool.query('SELECT key FROM vex_cache')).rows).toEqual([{ key: 'kept' }]);
  });

  // Every database with a vex cache has run and recorded this migration. Red
  // means it changed: put it back and append a new one.
  it('nisc.vex.cache/1 is unchanged', async () => {
    const migration = createPostgresCache({ pool: createPglitePool(new PGlite()) }).sequence.migrations[0];
    expect(migration).toBeDefined();
    if (migration !== undefined) expect(await checksumOf(migration)).toBe('c2c5ca08a6a53b1de69f70c4cc36ec8b3910aee5f1145b99deb30191d225bf24');
  });

  it('a cache under another name is its own sequence', () => {
    const pool = createPglitePool(new PGlite());
    expect(createPostgresCache({ pool }).sequence.id).toBe('nisc.vex.cache');
    expect(createPostgresCache({ pool, schema: 'ops', table: 'Query_Cache' }).sequence.id).toBe('nisc.vex.cache.ops-query-cache');
  });
});
