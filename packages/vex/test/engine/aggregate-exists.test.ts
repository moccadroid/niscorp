import { it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import type { Query } from '../../src/schemas/query.schema.js';

const db = new PGlite();
const adapter = createPostgresAdapter({ pool: createPglitePool(db) });
const dsl: Query = {
  from: ['tasks'],
  aggregate: { n: { sum: { case: { when: [{ condition: { exists: { from: ['secrets'], filter: { eq: ['secrets.val', 'b-secret'] } } }, then: 1 }], else: 0 } } } },
};

beforeAll(async () => {
  await db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, tenant_id TEXT); CREATE TABLE secrets (id TEXT PRIMARY KEY, tenant_id TEXT, val TEXT);
    INSERT INTO tasks VALUES ('t1','A'), ('t2','A'); INSERT INTO secrets VALUES ('s1','A','a-secret'), ('s2','B','b-secret');`);
});

it("an exists inside an aggregate's case runs, with the row rules inside it", async () => {
  const engine = createQueryEngine({
    adapter,
    scope: { default: 'deny', entities: { tasks: { read: [{ match: 'tenant_id', to: 'tenantId' }] }, secrets: { read: [{ match: 'tenant_id', to: 'tenantId' }] } } },
    generateDsl: async () => dsl,
  });
  await engine.introspect();
  expect(engine.compile(dsl).sql).toContain("EXISTS (SELECT 1 FROM secrets AS s1 WHERE (s1.val = 'b-secret' AND s1.tenant_id = $1))");
  expect((await engine.execute({ intent: 'count', shape: [{}], context: {} }, { scope: { tenantId: 'A' } })).result).toEqual([{ n: 0 }]);
});

it('a table the policy denies is refused there too', async () => {
  const engine = createQueryEngine({ adapter, scope: { default: 'deny', entities: { tasks: { read: [] } } }, generateDsl: async () => dsl });
  await engine.introspect();
  await expect(engine.execute({ intent: 'count', shape: [{}], context: {} }, { scope: {} })).rejects.toMatchObject({ code: 'scope_denied' });
});
