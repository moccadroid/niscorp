import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import { seedCache } from '../../src/cache/seed.js';
import { computeSchemaFingerprint } from '../../src/cache/hash.js';
import { executeWrites } from '../../src/mutations/engine.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';
import type { Query } from '../../src/schemas/query.schema.js';

// The tables are only in `app`; the connection's search_path reads `public`.
const DDL = `
  CREATE SCHEMA app;
  CREATE TABLE app.projects (id TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE app.tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES app.projects(id), title TEXT NOT NULL);
  CREATE TABLE app.tags (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES app.tasks(id), label TEXT NOT NULL);
  INSERT INTO app.projects VALUES ('p1', 'garden');
  INSERT INTO app.tasks VALUES ('t1', 'p1', 'dig'), ('t2', 'p1', 'water');
  INSERT INTO app.tags VALUES ('g1', 't1', 'urgent');
`;

const open: ScopePolicy = { default: 'allow', entities: {} };
const tagged: Query = {
  from: ['tasks', 'projects'],
  fields: ['tasks.title', 'projects.name'],
  filter: { exists: { from: ['tags'], filter: { eq: ['tags.task_id', 'tasks.id'] } } },
};

const db = new PGlite();
const pool = createPglitePool(db);

const engineOver = async (qualifyTables: boolean) => {
  const cache = createMemoryCache();
  await seedCache(cache, [{ fingerprint: 'tasks/tagged', shape: [{ title: '', name: '' }], dsl: tagged }]);
  const engine = createQueryEngine({ adapter: createPostgresAdapter({ pool, schema: 'app', ...(qualifyTables ? { qualifyTables } : {}) }), cache });
  const schema = await engine.introspect();
  return { engine, schema };
};

beforeAll(async () => {
  await db.exec(DDL);
});

afterAll(async () => {
  await db.close();
});

describe('an adapter given a schema and qualifyTables', () => {
  it('reads through a join and an exists in that schema', async () => {
    const { engine } = await engineOver(true);
    expect((await engine.execute({ fingerprint: 'tasks/tagged', context: {} })).result).toEqual([{ title: 'dig', name: 'garden' }]);
    engine.rows.stop();
  });

  it('inserts, updates and deletes there, a $lookup included', async () => {
    const { engine, schema } = await engineOver(true);
    const write = (mutation: Parameters<typeof executeWrites>[1]) => executeWrites(pool, mutation, { context: {}, scope: {}, policy: open, schema });
    await write({
      op: 'insert',
      table: 'tasks',
      values: { id: 't3', title: 'prune', project_id: { $lookup: { from: 'projects', field: 'id', where: { eq: ['projects.name', 'garden'] } } } },
    });
    await write({ op: 'update', table: 'tasks', set: { title: 'prune hard' }, where: { eq: ['tasks.id', 't3'] } });
    expect((await db.query('SELECT project_id, title FROM app.tasks WHERE id = $1', ['t3'])).rows).toEqual([{ project_id: 'p1', title: 'prune hard' }]);
    await write({ op: 'delete', table: 'tasks', where: { eq: ['tasks.id', 't3'] } });
    expect((await db.query('SELECT id FROM app.tasks WHERE id = $1', ['t3'])).rows).toEqual([]);
    engine.rows.stop();
  });

  it('keeps the schema fingerprint of an adapter without it', async () => {
    const qualified = await engineOver(true);
    const bare = await engineOver(false);
    expect(qualified.schema.namespace).toBe('app');
    expect(bare.schema.namespace).toBeUndefined();
    expect(computeSchemaFingerprint(qualified.schema)).toBe(computeSchemaFingerprint(bare.schema));
    qualified.engine.rows.stop();
    bare.engine.rows.stop();
  });
});

describe('an adapter given a schema, without qualifyTables', () => {
  it('names tables bare in a read and a write, as before', async () => {
    const { engine, schema } = await engineOver(false);
    await expect(engine.execute({ fingerprint: 'tasks/tagged', context: {} })).rejects.toThrow('relation "tasks" does not exist');
    await expect(
      executeWrites(pool, { op: 'insert', table: 'projects', values: { id: 'p2', name: 'shed' } }, { context: {}, scope: {}, policy: open, schema }),
    ).rejects.toThrow('relation "projects" does not exist');
    engine.rows.stop();
  });
});
