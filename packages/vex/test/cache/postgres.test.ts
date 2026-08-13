import { describe, it, expect, vi } from 'vitest';
import { createPostgresCache } from '../../src/cache/postgres.js';
import type { PgPool } from '../../src/cache/postgres.js';
import type { CacheEntry, OkCacheEntry } from '../../src/cache/cache.types.js';
import type { CompiledIr } from '@niscorp/prism';

// ───────────────────────────────────────────────────────────────
// Fake pg Pool
//
// Emulates just the queries createPostgresCache issues, backed by a Map
// of snake_case "rows". This exercises serialization, the kind
// discriminant, TTL filtering, and read/write validation — not real SQL
// (that's covered by the live integration path).
// ───────────────────────────────────────────────────────────────

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
};

const makeFakePool = () => {
  const rows = new Map<string, DbRow>();
  const notExpired = (r: DbRow) => r.expires_at === null || r.expires_at.getTime() > Date.now();

  const pool: PgPool = {
    query: async (text: string, values?: unknown[]) => {
      const sql = text.trim();
      const v = values ?? [];

      if (sql.startsWith('CREATE SCHEMA') || sql.startsWith('CREATE TABLE')) {
        return { rows: [] };
      }
      if (sql.startsWith('INSERT INTO')) {
        // POSITIONAL, so the order here is part of the contract with
        // `postgres.ts` — a column inserted in the middle silently shifts every
        // field after it, and the round-trips below are what catch that.
        const [key, kind, intent, shape, dsl, prismIr, reach, reason, createdAt, expiresAt, fingerprint] = v;
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
      // SELECT <cols> ... — either get (WHERE key = $1) or entries (no key param)
      if (sql.startsWith('SELECT')) {
        if (sql.includes('WHERE key = $1')) {
          const row = rows.get(v[0] as string);
          return { rows: row && notExpired(row) ? [{ ...row }] : [] };
        }
        return { rows: [...rows.values()].filter(notExpired).map((r) => ({ ...r })) };
      }
      return { rows: [] };
    },
  };

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
    // Dropping this on the way through would not throw — the read would just be
    // served at the caller's own, wider reach. Silence is the whole risk.
    await cache.set('mine', okEntry({ reach: 'personal' }));
    const got = await cache.get('mine');
    expect(got?.kind).toBe('ok');
    expect(got?.kind === 'ok' ? got.reach : undefined).toBe('personal');
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

    // Inject a corrupt row directly, bypassing write validation.
    //
    // Corrupt in its DSL, not in its SHAPE: this stands for a row the database
    // really holds, so it carries every column one has — `reach` included, which
    // the table grew after this fixture was written. What validate-on-read is
    // being asked to catch is the nonsense inside `dsl`, and a row missing a
    // column would be caught for the wrong reason.
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
    expect(rows.has('corrupt')).toBe(false); // evicted
  });

  it('rejects invalid schema/table identifiers', () => {
    const { pool } = makeFakePool();
    expect(() => createPostgresCache({ pool, table: 'vex; DROP TABLE users' })).toThrow();
    expect(() => createPostgresCache({ pool, schema: '1bad' })).toThrow();
  });
});
