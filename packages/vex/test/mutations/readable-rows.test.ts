import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { seedCache } from '../../src/cache/seed.js';
import { handleQuery } from '../../src/handler.js';
import type { WriteEvent } from '../../src/handler.js';
import { vex as vexHono } from '../../src/adapters/hono/index.js';
import { vex as vexExpress } from '../../src/adapters/express/index.js';
import type { MutationClient } from '../../src/mutations/engine.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

const db = new PGlite();
const pool = createPglitePool(db);
const engine = createQueryEngine({ adapter: createPostgresAdapter({ pool }) });

const statements: { sql: string; params: unknown[] }[] = [];
const recording: MutationClient = {
  query: async (sql, params = []) => {
    statements.push({ sql, params });
    return pool.query(sql, params);
  },
};

beforeAll(async () => {
  await db.exec(`
    CREATE TABLE tasks (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, owner_id TEXT, title TEXT, salary INT);
    INSERT INTO tasks VALUES ('t1', 'A', 'u1', 'mine', 100), ('t2', 'A', 'u2', 'theirs', 900), ('t3', 'A', 'u2', 'gone', 1);
  `);
  await engine.introspect();
  await seedCache(engine.cache, [
    { fingerprint: 'tasks/rename', mutation: { op: 'update', table: 'tasks', set: { title: { $context: 'title' } }, where: { eq: ['tasks.id', { $context: 'id' }] } } },
    { fingerprint: 'tasks/drop', mutation: { op: 'delete', table: 'tasks', where: { eq: ['tasks.id', { $context: 'id' }] } } },
    { fingerprint: 'tasks/add', mutation: { op: 'insert', table: 'tasks', values: { id: { $context: 'id' }, owner_id: { $context: 'ownerId' }, title: { $context: 'title' } } } },
  ]);
});

const desk: ScopePolicy = {
  default: 'deny',
  entities: {
    tasks: {
      read: [{ match: 'owner_id', to: 'userId' }],
      update: [{ match: 'tenant_id', to: 'tenantId' }],
      delete: [{ match: 'tenant_id', to: 'tenantId' }],
      insert: [{ set: 'tenant_id', to: 'tenantId' }],
    },
  },
};

const run = (fingerprint: string, context: Record<string, unknown>, scope: Record<string, unknown>, policy: ScopePolicy = desk) =>
  handleQuery({ engine, locked: true, mutations: { client: pool, policy, answerReadableRows: true } }, { fingerprint, context }, scope);

describe('a write with answerReadableRows answers only the rows the caller may read', () => {
  it('writes a row the caller may not read, and answers nothing of it', async () => {
    const out = await run('tasks/rename', { id: 't2', title: 'renamed' }, { userId: 'u1', tenantId: 'A' });
    expect(out).toEqual({ status: 200, body: { result: [] } });
    expect((await db.query("SELECT title FROM tasks WHERE id = 't2'")).rows).toEqual([{ title: 'renamed' }]);
  });

  it('answers a row the caller may read in full', async () => {
    const out = await run('tasks/rename', { id: 't1', title: 'still mine' }, { userId: 'u1', tenantId: 'A' });
    expect(out.body).toEqual({ result: { id: 't1', tenant_id: 'A', owner_id: 'u1', title: 'still mine', salary: 100 } });
  });

  it('answers nothing of a deleted row the caller may not read', async () => {
    const out = await run('tasks/drop', { id: 't3' }, { userId: 'u1', tenantId: 'A' });
    expect(out).toEqual({ status: 200, body: { result: [] } });
    expect((await db.query("SELECT id FROM tasks WHERE id = 't3'")).rows).toEqual([]);
  });

  it('hides the row when the host left out the scope value a read rule needs, and still writes', async () => {
    const out = await run('tasks/rename', { id: 't1', title: 'service' }, { tenantId: 'A' });
    expect(out).toEqual({ status: 200, body: { result: [] } });
    expect((await db.query("SELECT title FROM tasks WHERE id = 't1'")).rows).toEqual([{ title: 'service' }]);
  });

  it('answers the row a plain insert created', async () => {
    const out = await run('tasks/add', { id: 't4', ownerId: 'u2', title: 'new' }, { userId: 'u1', tenantId: 'A' });
    expect(out.body).toMatchObject({ result: { id: 't4', owner_id: 'u2' } });
  });

  it('answers every row under a policy with no read rules', async () => {
    const out = await run('tasks/rename', { id: 't2', title: 'open' }, {}, { default: 'allow', entities: {} });
    expect(out.body).toMatchObject({ result: { id: 't2', owner_id: 'u2', salary: 900 } });
  });
});

describe('without answerReadableRows', () => {
  it('runs the statement, with the parameters, and answers the rows, as before', async () => {
    statements.length = 0;
    const seen: WriteEvent[] = [];
    const out = await handleQuery(
      { engine, locked: true, mutations: { client: recording, policy: desk, onWrite: (event) => seen.push(event) } },
      { fingerprint: 'tasks/rename', context: { id: 't2', title: 'as today' } },
      { userId: 'u1', tenantId: 'A' },
    );
    expect(statements).toEqual([{ sql: 'UPDATE tasks SET title = $1 WHERE (tasks.id = $2 AND tasks.tenant_id = $3) RETURNING *', params: ['as today', 't2', 'A'] }]);
    expect(out.body).toMatchObject({ result: { id: 't2', owner_id: 'u2', title: 'as today' } });
    expect(seen.map((event) => event.writes)).toEqual([[{ table: 'tasks', op: 'update', rows: [expect.objectContaining({ id: 't2' })] }]]);
  });
});

describe('the adapters pass answerReadableRows on', () => {
  const scope = { userId: 'u1', tenantId: 'A' };
  const body = JSON.stringify({ fingerprint: 'tasks/rename', context: { id: 't2', title: 'adapter' } });

  it('through Hono', async () => {
    const app = vexHono({ engine, locked: true, getScope: () => scope, mutations: { client: pool, policy: desk, answerReadableRows: true } });
    const res = await app.request('/', { method: 'POST', body, headers: { 'content-type': 'application/json' } });
    expect(await res.json()).toEqual({ result: [] });
  });

  it('through Express', async () => {
    const handler = vexExpress({ engine, locked: true, getScope: () => scope, mutations: { client: pool, policy: desk, answerReadableRows: true } });
    let answered: unknown;
    const res = { status: () => res, json: (sent: unknown) => (answered = sent) };
    await handler({ method: 'POST', body: JSON.parse(body), query: {} }, res);
    expect(answered).toEqual({ result: [] });
  });
});
