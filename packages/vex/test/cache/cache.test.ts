import { describe, it, expect } from 'vitest';
import { normalizeShape, mintFingerprint, computeSchemaFingerprint, computeRequestHash } from '../../src/cache/hash.js';
import type { DatabaseSchema } from '../../src/schemas/database.schema.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import type { CacheEntry, OkCacheEntry } from '../../src/cache/cache.types.js';

// ───────────────────────────────────────────────────────────────
// normalizeShape
// ───────────────────────────────────────────────────────────────

describe('normalizeShape', () => {
  it('normalizes strings to "string"', () => {
    expect(normalizeShape('hello')).toBe('string');
  });

  it('normalizes numbers to "number"', () => {
    expect(normalizeShape(42)).toBe('number');
  });

  it('normalizes booleans to "boolean"', () => {
    expect(normalizeShape(true)).toBe('boolean');
  });

  it('normalizes null to "null"', () => {
    expect(normalizeShape(null)).toBe('null');
  });

  it('normalizes undefined to "unknown"', () => {
    expect(normalizeShape(undefined)).toBe('unknown');
  });

  it('sorts object keys and normalizes values', () => {
    const result = normalizeShape({ b: 0, a: '' });
    expect(result).toEqual({ a: 'string', b: 'number' });
  });

  it('collapses arrays to first element', () => {
    const result = normalizeShape([1, 2, 3]);
    expect(result).toEqual(['number']);
  });

  it('normalizes empty arrays to []', () => {
    expect(normalizeShape([])).toEqual([]);
  });

  it('normalizes nested objects recursively', () => {
    const result = normalizeShape({
      user: { name: 'John', age: 30 },
      active: true,
    });
    expect(result).toEqual({
      active: 'boolean',
      user: { age: 'number', name: 'string' },
    });
  });

  it('normalizes { b: 0, a: "" } to { a: "string", b: "number" }', () => {
    const result = normalizeShape({ b: 0, a: '' });
    expect(result).toEqual({ a: 'string', b: 'number' });
  });

  it('normalizes arrays of objects', () => {
    const result = normalizeShape([{ id: 1, name: 'test' }]);
    expect(result).toEqual([{ id: 'number', name: 'string' }]);
  });
});

// ───────────────────────────────────────────────────────────────
// mintFingerprint — shape hashes are no longer keys; identity is a
// minted pin or a caller-chosen name.
// ───────────────────────────────────────────────────────────────

describe('mintFingerprint', () => {
  it('mints fp_-prefixed identifiers', () => {
    expect(mintFingerprint()).toMatch(/^fp_[a-f0-9]{16}$/);
  });

  it('mints unique identifiers', () => {
    const minted = new Set(Array.from({ length: 100 }, () => mintFingerprint()));
    expect(minted.size).toBe(100);
  });
});

// ───────────────────────────────────────────────────────────────
// computeSchemaFingerprint
// ───────────────────────────────────────────────────────────────

describe('computeSchemaFingerprint', () => {
  const field = (name: string, over: Record<string, unknown> = {}) => ({
    name,
    type: 'text',
    normalizedType: 'string' as const,
    nullable: false,
    primaryKey: false,
    ...over,
  });

  const schema = (rowCount: number, fieldOrder: string[]): DatabaseSchema => ({
    entities: [
      {
        name: 'users',
        table: 'users',
        fields: fieldOrder.map((n) => field(n, n === 'id' ? { primaryKey: true } : {})),
        relations: [],
        indexes: [],
        rowCount,
      },
    ],
  });

  it('is stable across drifting rowCount and field ordering', () => {
    const a = computeSchemaFingerprint(schema(100, ['id', 'name', 'email']));
    const b = computeSchemaFingerprint(schema(999, ['email', 'id', 'name']));
    expect(a).toBe(b);
  });

  it('changes when a column is added or removed (real DDL drift)', () => {
    const a = computeSchemaFingerprint(schema(100, ['id', 'name', 'email']));
    const b = computeSchemaFingerprint(schema(100, ['id', 'name']));
    expect(a).not.toBe(b);
  });

  it('changes when a column type changes', () => {
    const base: DatabaseSchema = {
      entities: [{ name: 'users', table: 'users', fields: [field('age', { normalizedType: 'number' })], relations: [], indexes: [] }],
    };
    const changed: DatabaseSchema = {
      entities: [{ name: 'users', table: 'users', fields: [field('age', { normalizedType: 'string' })], relations: [], indexes: [] }],
    };
    expect(computeSchemaFingerprint(base)).not.toBe(computeSchemaFingerprint(changed));
  });
});

// ───────────────────────────────────────────────────────────────
// computeRequestHash
// ───────────────────────────────────────────────────────────────

describe('computeRequestHash', () => {
  it('is identical for the same intent + shape (ignoring values)', () => {
    const a = computeRequestHash({ intent: 'top customers', shape: [{ id: '', n: 0 }] });
    const b = computeRequestHash({ intent: 'top customers', shape: [{ id: 'x', n: 5 }] });
    expect(a).toBe(b);
  });

  it('differs for different intents with the same shape', () => {
    const a = computeRequestHash({ intent: 'top customers', shape: [{ id: '' }] });
    const b = computeRequestHash({ intent: 'top products', shape: [{ id: '' }] });
    expect(a).not.toBe(b);
  });

  it('differs for the same intent with different shapes', () => {
    const a = computeRequestHash({ intent: 'q', shape: [{ id: '' }] });
    const b = computeRequestHash({ intent: 'q', shape: [{ id: '', name: '' }] });
    expect(a).not.toBe(b);
  });

  it('ignores context values but reflects context keys', () => {
    const a = computeRequestHash({ intent: 'q', shape: {}, context: { customerId: 'a' } });
    const b = computeRequestHash({ intent: 'q', shape: {}, context: { customerId: 'b' } });
    const c = computeRequestHash({ intent: 'q', shape: {}, context: { orgId: 'a' } });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

// ───────────────────────────────────────────────────────────────
// createMemoryCache
// ───────────────────────────────────────────────────────────────

describe('createMemoryCache', () => {
  // `cache.get` answers the UNION — an entry may be ok, unsatisfiable or a
  // mutation, and only the first has a `dsl`. A consumer has to establish which
  // it got before reading through it, so the tests do too.
  const okOf = (entry: CacheEntry | undefined): OkCacheEntry => {
    if (entry?.kind !== 'ok') throw new Error(`expected an ok entry, got ${entry?.kind ?? 'nothing'}`);
    return entry;
  };

  const makeEntry = (overrides: Partial<OkCacheEntry> = {}): OkCacheEntry => ({
    kind: 'ok',
    dsl: { from: ['users'], fields: ['users.id'] },
    createdAt: Date.now(),
    ...overrides,
  });

  it('get returns undefined for missing key', async () => {
    const cache = createMemoryCache();
    const result = await cache.get('nonexistent');
    expect(result).toBeUndefined();
  });

  it('set + get returns the entry', async () => {
    const cache = createMemoryCache();
    const entry = makeEntry();
    await cache.set('key1', entry);
    const result = await cache.get('key1');
    expect(result).toBeDefined();
    expect(okOf(result).dsl).toEqual(entry.dsl);
  });

  it('delete removes the entry', async () => {
    const cache = createMemoryCache();
    await cache.set('key1', makeEntry());
    await cache.delete('key1');
    const result = await cache.get('key1');
    expect(result).toBeUndefined();
  });

  it('clear removes all entries', async () => {
    const cache = createMemoryCache();
    await cache.set('key1', makeEntry());
    await cache.set('key2', makeEntry());
    await cache.clear();
    const keys = await cache.keys();
    expect(keys).toEqual([]);
  });

  it('keys returns all keys', async () => {
    const cache = createMemoryCache();
    await cache.set('alpha', makeEntry());
    await cache.set('beta', makeEntry());
    await cache.set('gamma', makeEntry());
    const keys = await cache.keys();
    expect(keys).toHaveLength(3);
    expect(keys).toContain('alpha');
    expect(keys).toContain('beta');
    expect(keys).toContain('gamma');
  });

  it('multiple entries work correctly', async () => {
    const cache = createMemoryCache();
    const entry1 = makeEntry({ dsl: { from: ['users'], fields: ['users.id'] } });
    const entry2 = makeEntry({ dsl: { from: ['orders'], fields: ['orders.id'] } });

    await cache.set('users-query', entry1);
    await cache.set('orders-query', entry2);

    const result1 = await cache.get('users-query');
    const result2 = await cache.get('orders-query');

    expect(okOf(result1).dsl.from).toEqual(['users']);
    expect(okOf(result2).dsl.from).toEqual(['orders']);
  });
});
