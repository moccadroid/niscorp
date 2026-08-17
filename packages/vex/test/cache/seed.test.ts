import { describe, it, expect } from 'vitest';
import { createMemoryCache } from '../../src/cache/memory.js';
import { seedCache } from '../../src/cache/seed.js';
import type { SeedEntry, SeedMutation } from '../../src/cache/seed.js';
import type { CacheBackend, CacheEntry, OkCacheEntry, MutationCacheEntry } from '../../src/cache/cache.types.js';

const read: SeedEntry = {
  fingerprint: 'demo/list',
  intent: 'list things',
  shape: [{ name: '' }],
  dsl: { from: ['things'], fields: ['things.name'] },
};
const write: SeedMutation = {
  fingerprint: 'demo/rename',
  intent: 'rename a thing',
  mutation: { op: 'update', table: 'things', set: { name: { $context: 'name' } }, where: { eq: ['things.id', { $context: 'id' }] } },
};

// ───────────────────────────────────────────────────────────────
// A jsonb-shaped memory cache.
//
// The postgres backend stores dsl/shape/prism_ir as jsonb, and jsonb does
// not preserve object key order — a durable row comes back with the
// store's key order, not the author's. This wrapper models exactly that
// (and counts writes), so these tests hold seedCache to a canonical
// compare: an unfaithful one would see every row as "changed" and the
// write counter would catch it.
// ───────────────────────────────────────────────────────────────

const reorderKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(reorderKeys);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort().reverse()) out[key] = reorderKeys(source[key]);
    return out;
  }
  return value;
};

const jsonbLikeCache = (): { cache: CacheBackend; writes: () => number } => {
  const inner = createMemoryCache();
  let writes = 0;
  const cache: CacheBackend = {
    ...inner,
    get: async (key) => {
      const entry = await inner.get(key);
      return entry === undefined ? undefined : (reorderKeys(entry) as CacheEntry);
    },
    set: async (key, entry) => {
      writes += 1;
      await inner.set(key, entry);
    },
  };
  return { cache, writes: () => writes };
};

describe('seedCache', () => {
  it('stores protected rows: reads with identity IR, mutations linted', async () => {
    const cache = createMemoryCache();
    await seedCache(cache, [read, write]);
    const r = await cache.get('demo/list');
    expect(r?.kind).toBe('ok');
    expect(r?.protected).toBe(true);
    expect((r as { prismIr?: unknown }).prismIr).toBeDefined();
    const m = await cache.get('demo/rename');
    expect(m?.kind).toBe('mutation');
    expect(m?.protected).toBe(true);
  });

  it('leaves an unchanged entry untouched, even through jsonb key reordering', async () => {
    const { cache, writes } = jsonbLikeCache();
    await seedCache(cache, [read, write]);
    const landed = writes();
    // Reseeding the same authored set writes nothing: the compare survives
    // reordered keys, and the IR is matched by core fingerprint even though
    // a fresh compile stamps a fresh createdAt.
    await seedCache(cache, [read, write]);
    expect(writes()).toBe(landed);
  });

  it('refreshes a row whose authored definition changed', async () => {
    const cache = createMemoryCache();
    await seedCache(cache, [read]);
    const edited: SeedEntry = { ...read, shape: [{ name: '', slug: '' }], dsl: { from: ['things'], fields: ['things.name', 'things.slug'] } };
    await seedCache(cache, [edited]);
    const row = (await cache.get('demo/list')) as OkCacheEntry;
    expect(row.dsl).toEqual(edited.dsl);
    expect(row.shape).toEqual(edited.shape);
    expect(row.protected).toBe(true);
  });

  it('refreshes the compiled IR when only the mapping changed', async () => {
    const cache = createMemoryCache();
    await seedCache(cache, [read]);
    const before = ((await cache.get('demo/list')) as OkCacheEntry).prismIr;
    await seedCache(cache, [{ ...read, mapping: { $const: 42 } }]);
    const after = ((await cache.get('demo/list')) as OkCacheEntry).prismIr;
    expect(after?.meta.fingerprint).not.toBe(before?.meta.fingerprint);
  });

  it('refreshes an edited mutation', async () => {
    const cache = createMemoryCache();
    await seedCache(cache, [write]);
    const edited: SeedMutation = {
      ...write,
      mutation: { op: 'update', table: 'things', set: { name: { $context: 'name' }, note: { $context: 'note' } }, where: { eq: ['things.id', { $context: 'id' }] } },
    };
    await seedCache(cache, [edited]);
    const row = (await cache.get('demo/rename')) as MutationCacheEntry;
    expect(row.mutation).toEqual(edited.mutation);
    expect(row.protected).toBe(true);
  });

  it('reclaims a drifted row: unprotected or regenerated content converges to authored', async () => {
    const cache = createMemoryCache();
    // A runtime-regenerated row squatting on the authored name, unprotected.
    await cache.set('demo/list', { kind: 'ok', dsl: { from: ['other'] }, createdAt: 1 });
    await seedCache(cache, [read]);
    const row = (await cache.get('demo/list')) as OkCacheEntry;
    expect(row.dsl).toEqual(read.dsl);
    expect(row.protected).toBe(true);
  });

  it('refuses an unkeyed update at seed time', async () => {
    const cache = createMemoryCache();
    const bad: SeedMutation = { fingerprint: 'demo/bad', intent: 'x', mutation: { op: 'update', table: 'things', set: { name: 'x' }, where: { eq: ['things.id', 'literal'] } } };
    await expect(seedCache(cache, [bad])).rejects.toThrow(/authoring lint/);
  });

  it('lints an EDIT to an already-landed mutation — a bad edit fails the boot, not just the first one', async () => {
    const cache = createMemoryCache();
    await seedCache(cache, [write]);
    const bad: SeedMutation = { ...write, mutation: { op: 'update', table: 'things', set: { name: 'x' }, where: { eq: ['things.id', 'literal'] } } };
    await expect(seedCache(cache, [bad])).rejects.toThrow(/authoring lint/);
  });
});
