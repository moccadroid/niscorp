import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { seedCache } from '../../src/cache/seed.js';
import { handleQuery } from '../../src/handler.js';
import { vex as vexHono } from '../../src/adapters/hono/index.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

const db = new PGlite();
const pool = createPglitePool(db);
const engine = createQueryEngine({ adapter: createPostgresAdapter({ pool }) });

beforeAll(async () => {
  await db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE tasks (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), tenant_id TEXT NOT NULL, title TEXT);
    INSERT INTO projects VALUES ('pA'), ('pB');
    INSERT INTO tasks VALUES ('t1', 'pA', 'A', 'one'), ('t2', 'pA', 'A', 'two');
  `);
  await engine.introspect();
  await seedCache(engine.cache, [
    { fingerprint: 'tasks/move', mutation: { op: 'update', table: 'tasks', set: { project_id: { $context: 'projectId' } }, where: { eq: ['tasks.id', { $context: 'id' }] } } },
    { fingerprint: 'tasks/save', mutation: { op: 'upsert', table: 'tasks', key: 'id', columns: { project_id: { $context: 'projectId' }, title: { $context: 'title' } } } },
    { fingerprint: 'tasks/claim', mutation: { op: 'insert', table: 'tasks', values: { id: { $context: 'id' }, project_id: { $context: 'projectId' }, title: { $context: 'title' } }, onConflict: { target: ['id'], set: { project_id: { $context: 'projectId' } } } } },
    {
      fingerprint: 'tasks/renameThenMove',
      mutation: [
        { op: 'update', table: 'tasks', set: { title: { $context: 'title' } }, where: { eq: ['tasks.id', { $context: 'id' }] } },
        { op: 'update', table: 'tasks', set: { project_id: { $context: 'projectId' } }, where: { eq: ['tasks.id', { $context: 'id' }] } },
      ],
    },
  ]);
});

const byProject: ScopePolicy = {
  default: 'deny',
  entities: { tasks: { read: [], update: [{ match: 'project_id', in: 'projectIds' }], insert: [{ set: 'tenant_id', to: 'tenantId' }] } },
};

const run = (fingerprint: string, context: Record<string, unknown>, scope: Record<string, unknown>, checkMovedRows?: boolean) =>
  handleQuery(
    { engine, locked: true, mutations: { client: pool, policy: byProject, ...(checkMovedRows !== undefined ? { checkMovedRows } : {}) } },
    { fingerprint, context },
    scope,
  );

const projectOf = async (id: string) => (await db.query<{ project_id: string }>('SELECT project_id FROM tasks WHERE id = $1', [id])).rows[0]?.project_id;

describe('an update that would move a row out of the caller update rule', () => {
  it('is refused by default, naming the rule and the column, and writes nothing', async () => {
    const out = await run('tasks/move', { id: 't1', projectId: 'pB' }, { projectIds: ['pA'] });
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ error: 'scope_denied' });
    expect((out.body as { message: string }).message).toContain('"tasks.project_id"');
    expect((out.body as { message: string }).message).toContain('"projectIds"');
    expect(await projectOf('t1')).toBe('pA');
  });

  it('goes through when the new value is one the rule allows', async () => {
    const out = await run('tasks/move', { id: 't1', projectId: 'pB' }, { projectIds: ['pA', 'pB'] });
    expect(out.body).toMatchObject({ result: { id: 't1', project_id: 'pB' } });
    await db.query("UPDATE tasks SET project_id = 'pA' WHERE id = 't1'");
  });

  it('is refused on the update branch of an upsert', async () => {
    const out = await run('tasks/save', { id: 't1', projectId: 'pB', title: 'moved' }, { projectIds: ['pA'], tenantId: 'A' });
    expect(out.body).toMatchObject({ error: 'scope_denied' });
    expect(await projectOf('t1')).toBe('pA');
  });

  it('refuses the whole batch, so an earlier statement of it is not kept', async () => {
    const out = await run('tasks/renameThenMove', { id: 't2', title: 'renamed', projectId: 'pB' }, { projectIds: ['pA'] });
    expect(out.body).toMatchObject({ error: 'scope_denied' });
    expect((await db.query("SELECT title, project_id FROM tasks WHERE id = 't2'")).rows).toEqual([{ title: 'two', project_id: 'pA' }]);
  });

  it('leaves the existing row of an ON CONFLICT update where it is', async () => {
    const out = await run('tasks/claim', { id: 't1', projectId: 'pB', title: 'x' }, { projectIds: ['pA'], tenantId: 'A' });
    expect(out.body).toEqual({ result: [] });
    expect(await projectOf('t1')).toBe('pA');
  });

  it('moves the row as before with checkMovedRows: false', async () => {
    await db.query("UPDATE tasks SET project_id = 'pA' WHERE id = 't1'");
    const out = await run('tasks/move', { id: 't1', projectId: 'pB' }, { projectIds: ['pA'] }, false);
    expect(out.body).toMatchObject({ result: { id: 't1', project_id: 'pB' } });
    await db.query("UPDATE tasks SET project_id = 'pA' WHERE id = 't1'");
  });
});

describe('the check on integer and uuid columns, through the Hono adapter', () => {
  const typed = new PGlite();
  const typedPool = createPglitePool(typed);
  const typedEngine = createQueryEngine({ adapter: createPostgresAdapter({ pool: typedPool }) });
  const JOB = '00000000-0000-0000-0000-000000000001';
  const TEAM1 = 'aaaaaaaa-0000-0000-0000-000000000001';
  const TEAM2 = 'bbbbbbbb-0000-0000-0000-000000000002';
  const policy: ScopePolicy = {
    default: 'deny',
    entities: { jobs: { read: [], update: [{ match: 'org_id', in: 'orgIds' }, { match: 'team', to: 'teamId' }] } },
  };
  const app = vexHono({
    engine: typedEngine,
    locked: true,
    getScope: () => ({ orgIds: [1, 2], teamId: TEAM1 }),
    mutations: { client: typedPool, policy },
  });
  const post = async (fingerprint: string, context: Record<string, unknown>) =>
    (await app.request('/', { method: 'POST', body: JSON.stringify({ fingerprint, context }), headers: { 'content-type': 'application/json' } })).json();

  beforeAll(async () => {
    await typed.exec(`CREATE TABLE jobs (id UUID PRIMARY KEY, org_id INT NOT NULL, team UUID NOT NULL, title TEXT);
      INSERT INTO jobs VALUES ('${JOB}', 1, '${TEAM1}', 'j');`);
    await typedEngine.introspect();
    await seedCache(typedEngine.cache, [
      { fingerprint: 'jobs/org', mutation: { op: 'update', table: 'jobs', set: { org_id: { $context: 'org' } }, where: { eq: ['jobs.id', { $context: 'id' }] } } },
      { fingerprint: 'jobs/team', mutation: { op: 'update', table: 'jobs', set: { team: { $context: 'team' } }, where: { eq: ['jobs.id', { $context: 'id' }] } } },
    ]);
  });

  it('moves an integer column to a value the rule allows, and refuses one it does not', async () => {
    expect(await post('jobs/org', { id: JOB, org: 2 })).toMatchObject({ result: { org_id: 2 } });
    expect(await post('jobs/org', { id: JOB, org: 3 })).toMatchObject({ error: 'scope_denied' });
  });

  it('lets a uuid column be set to its own value, and refuses another team', async () => {
    expect(await post('jobs/team', { id: JOB, team: TEAM1 })).toMatchObject({ result: { team: TEAM1 } });
    expect(await post('jobs/team', { id: JOB, team: TEAM2 })).toMatchObject({ error: 'scope_denied' });
  });
});
