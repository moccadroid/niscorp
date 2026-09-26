import { describe, it, expect, vi, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import { seedCache } from '../../src/cache/seed.js';
import { isTouchDue, TOUCH_EVERY_MS } from '../../src/cache/util.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { handleQuery } from '../../src/handler.js';
import type { CacheBackend, CacheEntry } from '../../src/cache/cache.types.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

// ═══════════════════════════════════════════════════════════════
// THE lastUsedAt STAMP, AT MOST ONCE PER TOUCH_EVERY_MS. A stamp rewrites the
// entry; one on every replay made every read a write. What the stamp is for —
// the sweep, discovery's "last used" — needs it to the minute, not the read.
// ═══════════════════════════════════════════════════════════════

const policy: ScopePolicy = { default: 'allow', entities: {} };

const makeWorld = async () => {
  const db = new PGlite();
  await db.exec(`CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL); INSERT INTO notes VALUES ('n1', 'hello');`);
  const memory = createMemoryCache();
  // Every write the cache takes after seeding, by key.
  const stamps: string[] = [];
  let counting = false;
  const cache: CacheBackend = {
    ...memory,
    set: async (key: string, entry: CacheEntry) => {
      if (counting) stamps.push(key);
      return memory.set(key, entry);
    },
  };
  await seedCache(cache, [
    { fingerprint: 'notes/all', shape: [{ body: '' }], dsl: { from: ['notes'], fields: ['notes.body'] } },
    { fingerprint: 'notes/edit', mutation: { op: 'update', table: 'notes', set: { body: { $context: 'body' } }, where: { eq: ['notes.id', { $context: 'id' }] } } },
  ]);
  const engine = createQueryEngine({ adapter: createPostgresAdapter({ pool: createPglitePool(db) }), cache });
  await engine.introspect();
  counting = true;
  const replay = async (fingerprint: string, context: Record<string, unknown> = {}): Promise<void> => {
    const res = await handleQuery({ engine, locked: true, scopePolicy: policy, mutations: { client: db, policy } }, { fingerprint, context }, {});
    expect(res.status).toBe(200);
  };
  const lastUsedAt = async (key: string): Promise<number | undefined> => (await memory.get(key))?.lastUsedAt;
  return { replay, stamps: (key: string) => stamps.filter((k) => k === key).length, lastUsedAt, stop: () => engine.rows.stop() };
};

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.restoreAllMocks());

describe('isTouchDue', () => {
  it('is due for an entry never stamped, and once the interval has passed', () => {
    const entry: CacheEntry = { kind: 'ok', dsl: { from: ['notes'] }, createdAt: 0 };
    expect(isTouchDue(entry, 1_000)).toBe(true);
    expect(isTouchDue({ ...entry, lastUsedAt: 1_000 }, 1_000 + TOUCH_EVERY_MS - 1)).toBe(false);
    expect(isTouchDue({ ...entry, lastUsedAt: 1_000 }, 1_000 + TOUCH_EVERY_MS)).toBe(true);
  });
});

describe('replays stamp lastUsedAt at most once per interval', () => {
  it('a read replayed three times is stamped once — and again after the interval', async () => {
    const world = await makeWorld();
    try {
      for (let i = 0; i < 3; i += 1) await world.replay('notes/all');
      await settle();
      expect(world.stamps('notes/all')).toBe(1);
      const first = await world.lastUsedAt('notes/all');
      expect(first).toBeDefined();

      const later = (first ?? 0) + TOUCH_EVERY_MS;
      vi.spyOn(Date, 'now').mockReturnValue(later);
      await world.replay('notes/all');
      await settle();
      expect(world.stamps('notes/all')).toBe(2);
      expect(await world.lastUsedAt('notes/all')).toBe(later);
    } finally {
      world.stop();
    }
  });

  it('a write replayed three times is stamped once', async () => {
    const world = await makeWorld();
    try {
      for (let i = 0; i < 3; i += 1) await world.replay('notes/edit', { id: 'n1', body: `take ${i}` });
      await settle();
      expect(world.stamps('notes/edit')).toBe(1);
      expect(await world.lastUsedAt('notes/edit')).toBeDefined();
    } finally {
      world.stop();
    }
  });
});
