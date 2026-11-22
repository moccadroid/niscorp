import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
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
const scope = { tenantId: 'tenant-A-secret' };
const ask = (fingerprint: string, context: Record<string, unknown>, from = scope) => handleQuery({ engine, locked: true }, { fingerprint, context }, from);

beforeAll(async () => {
  await db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, tenant_id TEXT, title TEXT, n INTEGER);
    INSERT INTO tasks VALUES ('t1', 'tenant-A-secret', 'one', 1);`);
  await engine.introspect();
  await seedCache(engine.cache, [
    { fingerprint: 'tasks/byIds', shape: [{ title: '' }], dsl: { from: ['tasks'], fields: ['tasks.title'], filter: { in: ['tasks.id', { $context: 'ids' }] } } },
    { fingerprint: 'tasks/above', shape: [{ title: '' }], dsl: { from: ['tasks'], fields: ['tasks.title'], filter: { gt: ['tasks.n', { $context: 'min' }] } } },
    { fingerprint: 'tasks/share', shape: [{ r: 0 }], dsl: { from: ['tasks'], compute: { r: { divide: ['tasks.n', { $context: 'parts' }] } } } },
  ]);
});

afterAll(() => engine.rows.stop());
afterEach(() => vi.restoreAllMocks());

describe("a caller's value that does not fit its column", () => {
  it('is a 400 naming the context key', async () => {
    expect(await ask('tasks/byIds', { ids: 't1' })).toMatchObject({ status: 400, body: { error: 'invalid_request', details: { key: 'ids', code: '22P02' } } });
    expect(await ask('tasks/above', { min: 'abc' })).toMatchObject({ status: 400, body: { error: 'invalid_request', details: { key: 'min' } } });
  });

  it('a value Postgres accepts as text still runs', async () => {
    expect(await ask('tasks/above', { min: '0' })).toMatchObject({ status: 200, body: { result: [{ title: 'one' }] } });
  });

  it("an error the caller's value did not cause stays a 500, and its log line has no bound values", async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await ask('tasks/share', { parts: 0 })).toMatchObject({ status: 500, body: { error: '22012' } });
    const line = logged.mock.calls.map((call) => call.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' ')).join('\n');
    expect(line).toContain('22012');
    expect(line).not.toContain('tenant-A-secret');
  });

  it("the host's wrongly typed scope value stays a 500", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const typed = { default: 'deny', entities: { tasks: { read: [{ match: 'n', to: 'level' }] } } } satisfies ScopePolicy;
    const out = await handleQuery({ engine, locked: true, scopePolicy: typed }, { fingerprint: 'tasks/above', context: { min: 0 } }, { level: 'high' });
    expect(out).toMatchObject({ status: 500, body: { error: '22P02' } });
  });
});
