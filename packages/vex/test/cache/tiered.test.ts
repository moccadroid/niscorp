import { describe, it, expect, vi } from 'vitest';
import { createTieredCache } from '../../src/cache/tiered.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import type { CacheEntry, OkCacheEntry } from '../../src/cache/cache.types.js';

const okEntry = (overrides: Partial<OkCacheEntry> = {}): OkCacheEntry => ({
  kind: 'ok',
  dsl: { from: ['users'], fields: ['users.id'] },
  createdAt: Date.now(),
  ...overrides,
});

describe('createTieredCache', () => {
  it('set writes through to both tiers', async () => {
    const l1 = createMemoryCache();
    const l2 = createMemoryCache();
    const cache = createTieredCache({ l1, l2 });

    await cache.set('k1', okEntry());

    expect(await l1.get('k1')).toBeDefined();
    expect(await l2.get('k1')).toBeDefined();
  });

  it('get serves from L1 without consulting L2', async () => {
    const l1 = createMemoryCache();
    const l2 = createMemoryCache();
    const l2get = vi.spyOn(l2, 'get');
    const cache = createTieredCache({ l1, l2 });

    await cache.set('k1', okEntry());
    l2get.mockClear();

    const result = await cache.get('k1');
    expect(result).toBeDefined();
    expect(l2get).not.toHaveBeenCalled();
  });

  it('promotes from L2 into L1 on an L1 miss', async () => {
    const l1 = createMemoryCache();
    const l2 = createMemoryCache();
    const cache = createTieredCache({ l1, l2 });

    // Seed only L2.
    await l2.set('k1', okEntry());
    expect(await l1.get('k1')).toBeUndefined();

    const result = await cache.get('k1');
    expect(result).toBeDefined();
    // Now present in L1.
    expect(await l1.get('k1')).toBeDefined();
  });

  it("warmup 'full' (default) loads all of L2 into L1", async () => {
    const l1 = createMemoryCache();
    const l2 = createMemoryCache();
    await l2.set('a', okEntry());
    await l2.set('b', okEntry());

    const cache = createTieredCache({ l1, l2 });
    await cache.init();

    const keys = await cache.keys();
    expect(keys).toHaveLength(2);
    expect(keys).toContain('a');
    expect(keys).toContain('b');
    expect(await l1.get('a')).toBeDefined();
  });

  it("warmup 'lazy' preloads nothing but fills on demand", async () => {
    const l1 = createMemoryCache();
    const l2 = createMemoryCache();
    await l2.set('a', okEntry());

    const cache = createTieredCache({ l1, l2, warmup: 'lazy' });
    await cache.init();

    // Nothing preloaded.
    expect(await l1.get('a')).toBeUndefined();
    // But a get pulls it from L2 and promotes.
    expect(await cache.get('a')).toBeDefined();
    expect(await l1.get('a')).toBeDefined();
  });

  it("warmup 'partial' preloads only the listed fingerprints", async () => {
    const l1 = createMemoryCache();
    const l2 = createMemoryCache();
    await l2.set('deals/table', okEntry());
    await l2.set('home/pipeline', okEntry());

    const cache = createTieredCache({ l1, l2, warmup: { mode: 'partial', fingerprints: ['deals/table'] } });
    await cache.init();

    expect(await l1.get('deals/table')).toBeDefined();
    expect(await l1.get('home/pipeline')).toBeUndefined();
  });

  it('evicts invalid L2 entries from BOTH tiers on promote and reports via onError', async () => {
    const l1 = createMemoryCache();
    const l2 = createMemoryCache();
    const onError = vi.fn();

    // Inject a corrupt entry straight into L2 (bypassing validation).
    const corrupt = { kind: 'ok', dsl: { nope: 1 }, createdAt: Date.now() } as unknown as CacheEntry;
    await l2.set('bad', corrupt);

    const cache = createTieredCache({ l1, l2, onError });
    await cache.init();

    expect(onError).toHaveBeenCalledOnce();
    expect(await l1.get('bad')).toBeUndefined();
    expect(await l2.get('bad')).toBeUndefined(); // evicted from L2, not just skipped
  });

  it('delete and clear affect both tiers', async () => {
    const l1 = createMemoryCache();
    const l2 = createMemoryCache();
    const cache = createTieredCache({ l1, l2 });

    await cache.set('a', okEntry());
    await cache.set('b', okEntry());

    await cache.delete('a');
    expect(await l1.get('a')).toBeUndefined();
    expect(await l2.get('a')).toBeUndefined();

    await cache.clear();
    expect(await l1.keys()).toEqual([]);
    expect(await l2.keys()).toEqual([]);
  });

  it('returns undefined when neither tier has the key', async () => {
    const cache = createTieredCache({ l1: createMemoryCache(), l2: createMemoryCache() });
    expect(await cache.get('missing')).toBeUndefined();
  });
});
