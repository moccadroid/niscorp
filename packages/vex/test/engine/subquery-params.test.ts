import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import { seedCache } from '../../src/cache/seed.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import type { Query } from '../../src/schemas/query.schema.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

const counted = (table: string, column: string, key: string): Query => ({
  from: [table],
  aggregate: { n: { count: '*' } },
  filter: { eq: [`${table}.${column}`, { $context: key }] },
});

const bothCounts: Query = {
  from: [
    { as: 'c', query: counted('customers', 'city', 'city') },
    { as: 'o', query: counted('orders', 'status', 'status') },
  ],
  fields: [
    { field: 'c.n', as: 'customers' },
    { field: 'o.n', as: 'orders' },
  ],
};

const ownRows: Query = {
  from: [
    { as: 'c', query: { from: ['customers'], aggregate: { n: { count: '*' } } } },
    { as: 'o', query: { from: ['orders'], aggregate: { n: { count: '*' } } } },
  ],
  fields: [
    { field: 'c.n', as: 'customers' },
    { field: 'o.n', as: 'orders' },
  ],
};

const policy: ScopePolicy = {
  default: 'deny',
  entities: {
    customers: { read: [{ match: 'city', to: 'city' }] },
    orders: { read: [{ match: 'owner', to: 'userId' }] },
  },
};

describe('subqueries — each binds its own parameters', () => {
  const db = new PGlite();
  const adapter = createPostgresAdapter({ pool: createPglitePool(db) });
  const shape = { customers: 0, orders: 0 };

  beforeAll(async () => {
    await db.exec(`
      CREATE TABLE customers (id TEXT PRIMARY KEY, city TEXT NOT NULL);
      CREATE TABLE orders (id TEXT PRIMARY KEY, status TEXT NOT NULL, owner TEXT NOT NULL);
      INSERT INTO customers VALUES ('c1', 'Vienna'), ('c2', 'Vienna'), ('c3', 'Graz');
      INSERT INTO orders VALUES ('o1', 'open', 'u1'), ('o2', 'paid', 'u1'), ('o3', 'paid', 'u1'), ('o4', 'paid', 'u2');
    `);
  });
  afterAll(async () => {
    await db.close();
  });

  it('two subqueries filtered by two context values answer each by its own', async () => {
    const cache = createMemoryCache();
    const engine = createQueryEngine({ adapter, cache });
    await engine.introspect();
    await seedCache(cache, [{ fingerprint: 'counts/both', shape, dsl: bothCounts }]);
    const answer = await engine.execute({ fingerprint: 'counts/both', context: { city: 'Vienna', status: 'paid' } });
    expect(answer.result).toEqual({ customers: 2, orders: 3 });
    engine.rows.stop();
  });

  it('two subqueries over scoped tables are each held to their own scope value', async () => {
    const cache = createMemoryCache();
    const engine = createQueryEngine({ adapter, cache, scope: policy });
    await engine.introspect();
    await seedCache(cache, [{ fingerprint: 'counts/mine', shape, dsl: ownRows }]);
    const answer = await engine.execute({ fingerprint: 'counts/mine', context: {} }, { scope: { city: 'Graz', userId: 'u1' } });
    expect(answer.result).toEqual({ customers: 1, orders: 3 });
    engine.rows.stop();
  });
});
