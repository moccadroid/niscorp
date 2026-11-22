import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import { seedCache } from '../../src/cache/seed.js';
import { handleDiscovery, handleQuery } from '../../src/handler.js';
import { vex as vexHono } from '../../src/adapters/hono/index.js';
import type { QueryEngine } from '../../src/types.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';

const DDL = `
  CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT);
  CREATE TABLE secrets (id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes (id));
  INSERT INTO notes VALUES ('n1', 'first');
  INSERT INTO secrets VALUES ('s1', 'n1');
`;

const notesOnly: ScopePolicy = { default: 'deny', entities: { notes: { public: true } } };

const db = new PGlite();
const cache = createMemoryCache();
let engine: QueryEngine;

beforeAll(async () => {
  await db.exec(DDL);
  await seedCache(cache, [
    { fingerprint: 'notes', shape: [{ id: '' }], dsl: { from: ['notes'], fields: ['notes.id'] } },
    {
      fingerprint: 'notes/with-a-secret',
      shape: [{ id: '' }],
      dsl: { from: ['notes'], fields: ['notes.id'], filter: { exists: { from: ['secrets'], filter: { eq: ['secrets.note_id', 'notes.id'] } } } },
    },
    {
      fingerprint: 'notes/search',
      shape: [{ id: '' }],
      dsl: { from: ['notes'], fields: ['notes.id'], filter: { optional: { key: 'q', then: { ilike: ['notes.title', { $context: 'q' }] } } } },
    },
    {
      fingerprint: 'notes/search-with-a-secret',
      shape: [{ id: '' }],
      dsl: {
        from: ['notes'],
        fields: ['notes.id'],
        filter: { optional: { key: 'secret', then: { exists: { from: ['secrets'], filter: { eq: ['secrets.note_id', 'notes.id'] } } } } },
      },
    },
    {
      fingerprint: 'notes/never-runs',
      shape: [{ id: '' }],
      dsl: { from: ['notes'], fields: ['notes.id'], filter: { exists: { from: ['notes'], filter: { optional: { key: 'q', then: { eq: ['notes.title', { $context: 'q' }] } } } } } },
    },
  ]);
  engine = createQueryEngine({ adapter: createPostgresAdapter({ pool: createPglitePool(db) }), cache });
  await engine.introspect();
});

afterAll(async () => {
  engine.rows.stop();
  await db.close();
});

describe('discovery lists only the entries a caller can run', () => {
  it('leaves out an entry whose exists reads a table the caller cannot read, in an optional condition too', async () => {
    const listed = (await handleDiscovery({ engine, scopePolicy: notesOnly })).fingerprints.map((f) => f.fingerprint);
    expect(listed).toEqual(['notes', 'notes/search']);
  });

  it('leaves out an entry no caller can run, and still lists the others', async () => {
    const listed = (await handleDiscovery({ engine, scopePolicy: { default: 'allow', entities: {} } })).fingerprints.map((f) => f.fingerprint);
    expect(listed).toEqual(['notes', 'notes/with-a-secret', 'notes/search', 'notes/search-with-a-secret']);
  });

  it('...which that caller is refused when it asks', async () => {
    const refused = await handleQuery({ engine, scopePolicy: notesOnly }, { fingerprint: 'notes/with-a-secret', context: {} }, {});
    expect(refused.body).toMatchObject({ error: 'scope_denied' });
  });
});

describe("a handler with no policy of its own lists under the engine's", () => {
  const withPolicy = (): QueryEngine => createQueryEngine({ adapter: createPostgresAdapter({ pool: createPglitePool(db) }), cache, scope: notesOnly });

  it('lists only the tables and entries that policy lets run', async () => {
    const restricted = withPolicy();
    await restricted.introspect();
    const listed = await handleDiscovery({ engine: restricted });
    expect(listed.entities.map((e) => e.name)).toEqual(['notes']);
    expect(listed.fingerprints.map((f) => f.fingerprint)).toEqual(['notes', 'notes/search']);
    restricted.rows.stop();
  });

  it('an engine with no policy lists everything', async () => {
    const listed = await handleDiscovery({ engine });
    expect(listed.entities.map((e) => e.name).sort()).toEqual(['notes', 'secrets']);
  });

  it('Hono without getPolicy lists under the engine policy', async () => {
    const restricted = withPolicy();
    await restricted.introspect();
    const body = (await (await vexHono({ engine: restricted, manageFingerprints: false }).request('/')).json()) as { entities: { name: string }[] };
    expect(body.entities.map((e) => e.name)).toEqual(['notes']);
    restricted.rows.stop();
  });

  it('lists a write by the policy the write runs under', async () => {
    const own = createMemoryCache();
    const readOnly: ScopePolicy = { default: 'deny', entities: { notes: { read: [] } } };
    const writes: ScopePolicy = { default: 'deny', entities: { notes: { read: [], write: [] } } };
    await seedCache(own, [
      { fingerprint: 'notes', shape: [{ id: '' }], dsl: { from: ['notes'], fields: ['notes.id'] } },
      { fingerprint: 'notes/rename', mutation: { op: 'update', table: 'notes', set: { title: { $context: 'title' } }, where: { eq: ['notes.id', { $context: 'id' }] } } },
    ]);
    const restricted = createQueryEngine({ adapter: createPostgresAdapter({ pool: createPglitePool(db) }), cache: own, scope: readOnly });
    await restricted.introspect();
    const config = { engine: restricted, locked: true, mutations: { client: db, policy: writes } };
    expect((await handleDiscovery(config)).fingerprints.map((f) => f.fingerprint)).toEqual(['notes', 'notes/rename']);
    expect(await handleQuery(config, { fingerprint: 'notes/rename', context: { id: 'n1', title: 'renamed' } }, {})).toMatchObject({ status: 200 });
    expect((await handleDiscovery({ engine: restricted })).fingerprints.map((f) => f.fingerprint)).toEqual(['notes']);
    restricted.rows.stop();
  });
});
