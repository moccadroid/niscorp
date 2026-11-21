import { describe, it, expect, beforeAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { seedCache } from '../../src/cache/seed.js';
import { handleQuery } from '../../src/handler.js';
import { createScopePolicy, mergeScopePolicies } from '../../src/scope/grants.js';

const db = new PGlite();
const engine = createQueryEngine({ adapter: createPostgresAdapter({ pool: createPglitePool(db) }) });
const behaviors = { tasks: { default: { read: [{ match: 'tenant_id', to: 'tenantId' }] }, personal: { read: [{ match: 'tenant_id', to: 'tenantId' }, { match: 'owner_id', to: 'userId' }] } } };
const grants = new Set(['tasks.read']);
const merged = mergeScopePolicies([createScopePolicy(grants, behaviors, 'personal'), createScopePolicy(grants, behaviors)]);
const atReach = (reach: string) => createScopePolicy(grants, behaviors, reach);
const scope = { tenantId: 'A', userId: 'u1' };

beforeAll(async () => {
  await db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, tenant_id TEXT, owner_id TEXT, title TEXT);
    INSERT INTO tasks VALUES ('t1','A','u1','mine'), ('t2','A','u2','theirs'), ('t3','B','u3','other tenant');`);
  await engine.introspect();
  const entry = { reach: 'personal', dsl: { from: ['tasks'], fields: ['tasks.title'], sort: [{ field: 'tasks.title', dir: 'asc' as const }] }, shape: [{ title: '' }] };
  await seedCache(engine.cache, [{ fingerprint: 'tasks/mine', ...entry }, { fingerprint: 'tasks/mine-too', ...entry }]);
});

describe("engine.execute serves an entry's reach", () => {
  it('narrows a replay to the reach when given policyForReach', async () => {
    const out = await engine.execute({ fingerprint: 'tasks/mine', context: {} }, { scope, scopePolicy: merged, policyForReach: atReach });
    expect(out.result).toEqual([{ title: 'mine' }]);
  });

  it('refuses when the principal has no such reach', async () => {
    await expect(engine.execute({ fingerprint: 'tasks/mine', context: {} }, { scope, scopePolicy: merged, policyForReach: () => undefined })).rejects.toMatchObject({ code: 'scope_denied' });
  });

  it('without policyForReach answers as before, and says so once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = await engine.execute({ fingerprint: 'tasks/mine', context: {} }, { scope, scopePolicy: merged });
    await engine.execute({ fingerprint: 'tasks/mine', context: {} }, { scope, scopePolicy: merged });
    expect(first.result).toEqual([{ title: 'mine' }, { title: 'theirs' }]);
    expect(warn.mock.calls.filter(([m]) => String(m).includes('tasks/mine'))).toHaveLength(1);
    warn.mockRestore();
  });

  it('the handler path is unchanged and does not warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await handleQuery({ engine, scopePolicy: merged, policyForReach: atReach }, { fingerprint: 'tasks/mine-too', context: {} }, scope);
    expect(out.body).toMatchObject({ result: [{ title: 'mine' }] });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
