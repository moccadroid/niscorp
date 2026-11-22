import { it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { seedCache } from '../../src/cache/seed.js';
import { handleQuery } from '../../src/handler.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

const db = new PGlite();
const policy: ScopePolicy = { default: 'deny', entities: { tasks: { read: [{ match: 'tenant_id', to: 'tenantId' }] } } };
const engine = createQueryEngine({ adapter: createPostgresAdapter({ pool: createPglitePool(db) }), scope: policy });

beforeAll(async () => {
  await db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, tenant_id TEXT, n INTEGER);
    INSERT INTO tasks VALUES ('t1', 'tenant-A-secret', 1);`);
  await engine.introspect();
  await seedCache(engine.cache, [
    { fingerprint: 'tasks/share', shape: [{ r: 0 }], dsl: { from: ['tasks'], compute: { r: { divide: ['tasks.n', { $context: 'parts' }] } } } },
  ]);
});

afterAll(() => engine.rows.stop());
afterEach(() => vi.restoreAllMocks());

it("an unexpected error's log line carries its code and SQL, never the statement's bound values", async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const out = await handleQuery({ engine, locked: true }, { fingerprint: 'tasks/share', context: { parts: 0 } }, { tenantId: 'tenant-A-secret' });
  expect(out).toMatchObject({ status: 500, body: { error: '22012' } });
  const line = logged.mock.calls.map((call) => call.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' ')).join('\n');
  expect(line).toContain('22012');
  expect(line).toContain('SELECT');
  expect(line).not.toContain('tenant-A-secret');
});
