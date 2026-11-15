import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import { seedCache } from '../../src/cache/seed.js';
import type { QueryEngine } from '../../src/types.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

// Each person may name a manager. Bea and Bia, in tenant B, name Ann, in tenant A.
const DDL = `
  CREATE TABLE people (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, manager_id TEXT REFERENCES people (id));
  INSERT INTO people VALUES ('ann', 'A', 'Ann', NULL), ('amy', 'A', 'Amy', 'ann'), ('bea', 'B', 'Bea', 'ann'), ('bia', 'B', 'Bia', 'ann'), ('bob', 'B', 'Bob', 'bea');
`;

const byTenant: ScopePolicy = { default: 'deny', entities: { people: { read: [{ match: 'tenant_id', to: 'tenantId' }] } } };

const db = new PGlite();
let engine: QueryEngine;

beforeAll(async () => {
  await db.exec(DDL);
  const cache = createMemoryCache();
  await seedCache(cache, [
    { fingerprint: 'people/pairs', shape: [{ n: 0 }], dsl: { from: ['people', 'people'], aggregate: { n: { count: '*' } } } },
    { fingerprint: 'people/managers', shape: [{ name: '' }], dsl: { from: ['people', 'people'], fields: ['people.name'], sort: [{ field: 'people.name', dir: 'asc' }] } },
  ]);
  engine = createQueryEngine({ adapter: createPostgresAdapter({ pool: createPglitePool(db) }), cache, scope: byTenant });
  await engine.introspect();
});

afterAll(async () => {
  engine.rows.stop();
  await db.close();
});

describe('a table joined to itself under a row rule', () => {
  it('counts only the rows of the caller tenant, through either copy', async () => {
    const response = await engine.execute({ fingerprint: 'people/pairs', context: {} }, { scope: { tenantId: 'A' } });
    expect(response.result).toEqual([{ n: 2 }]);
  });

  it('never answers a row of another tenant through the first copy', async () => {
    const response = await engine.execute({ fingerprint: 'people/managers', context: {} }, { scope: { tenantId: 'A' } });
    expect(response.result).toEqual([{ name: 'Ann' }, { name: null }]);
  });
});
