import { describe, it, expect } from 'vitest';
import { createMemoryCache } from '../../src/cache/memory.js';
import { seedCache } from '../../src/cache/seed.js';
import type { SeedEntry, SeedMutation } from '../../src/cache/seed.js';

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

  it('is idempotent — an existing entry is left alone', async () => {
    const cache = createMemoryCache();
    await seedCache(cache, [read]);
    const first = await cache.get('demo/list');
    await seedCache(cache, [{ ...read, intent: 'CHANGED' }]);
    const second = await cache.get('demo/list');
    expect(second?.intent).toBe(first?.intent);
  });

  it('refuses an unkeyed update at seed time', async () => {
    const cache = createMemoryCache();
    const bad: SeedMutation = { fingerprint: 'demo/bad', intent: 'x', mutation: { op: 'update', table: 'things', set: { name: 'x' }, where: { eq: ['things.id', 'literal'] } } };
    await expect(seedCache(cache, [bad])).rejects.toThrow(/authoring lint/);
  });
});
