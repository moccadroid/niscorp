import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPglitePool } from '@niscorp/vex/pglite';
import { computeSchemaFingerprint, createMemoryCache } from '@niscorp/vex';
import type { PgPool, SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Sequence } from '@niscorp/strata';
import { createDataLayer } from '../src/data/engine';
import { migrateTables } from '../src/data/migrate';
import { defineApp } from '../src/manifest';
import { manifestMisfits } from '../src/manifest/schema';
import { verifyManifest, candidateOf } from '../src/manifest/verify';
import type { NiscApp } from '../src/manifest';
import { createServer } from '../src/server';
import type { NiscRuntime } from '../src/runtime';
import { pristineDatabases } from './pristine-database';

const freshDatabase = pristineDatabases();

const sql = (text: string) => ({ kind: 'sql' as const, sql: text });

const TEACHERS = 'CREATE TABLE teachers (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL)';
const SESSIONS = 'CREATE TABLE class_sessions (id text PRIMARY KEY, teacher_id text NOT NULL REFERENCES teachers (id), starts_on date NOT NULL, notes text)';
const SEED = "INSERT INTO teachers VALUES ('t1', 'Ada', 'ada@example.com'); INSERT INTO class_sessions VALUES ('s1', 't1', '2026-12-01', 'staff only')";
const PUBLIC_SESSIONS = 'CREATE VIEW public_sessions AS SELECT s.id, s.starts_on, t.name AS teacher FROM class_sessions s JOIN teachers t ON t.id = s.teacher_id';

const TABLES = { description: 'teachers and their sessions', steps: [sql(TEACHERS), sql(SESSIONS)] };
const VIEW = { description: 'the sessions anybody may read', steps: [sql(PUBLIC_SESSIONS)] };
const DROP_VIEW = { description: 'no public sessions', steps: [sql('DROP VIEW public_sessions')] };
const REMADE_VIEW = { description: 'the public sessions, made again', steps: [sql('DROP VIEW public_sessions'), sql(PUBLIC_SESSIONS)] };

const tables = (...migrations: Sequence['migrations']): Sequence[] => [{ id: 'site.app', migrations }];

const SESSIONS_ON_THE_SITE: SeedEntry = { fingerprint: 'sessions/site', dsl: { from: ['public_sessions'], fields: ['public_sessions.id', 'public_sessions.teacher'] } };
const SESSIONS_FOR_STAFF: SeedEntry = { fingerprint: 'sessions/staff', dsl: { from: ['class_sessions'], fields: ['class_sessions.id', 'class_sessions.notes'] } };
const WRITE_TO_THE_VIEW: SeedMutation = { fingerprint: 'sessions/rename', mutation: { op: 'update', table: 'public_sessions', set: { teacher: { $context: 'teacher' } }, where: { eq: ['public_sessions.id', { $context: 'id' }] } } };

const site = (more: Partial<NiscApp> = {}): NiscApp =>
  defineApp({
    charter: { public: { actions: [], data: ['public_sessions.read'] }, staff: { actions: [], data: ['class_sessions.read', 'teachers.read'] } },
    actions: {},
    entries: [SESSIONS_ON_THE_SITE, SESSIONS_FOR_STAFF],
    views: ['public_sessions'],
    ...more,
  });

const database = () => {
  const db = freshDatabase();
  const pool = createPglitePool(db);
  const runtimeOf = (sequences: Sequence[], migrations?: 'apply'): NiscRuntime => ({ pool, db: pool, session: 'sessions', tables: sequences, ...(migrations === undefined ? {} : { migrations }) });
  return { pool, runtimeOf };
};

const run = async (pool: PgPool, ...statements: string[]): Promise<void> => {
  for (const statement of statements.flatMap((text) => text.split('; '))) await pool.query(statement);
};

const quietly = async <T>(go: () => Promise<T>): Promise<T> => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    return await go();
  } finally {
    warn.mockRestore();
  }
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('an app’s views, in the data universe', () => {
  it('a listed view is granted read and nothing else; the tables under it are said', async () => {
    const { pool } = database();
    await run(pool, TEACHERS, SESSIONS, PUBLIC_SESSIONS);
    const layer = await quietly(() => createDataLayer({ pool, cache: createMemoryCache(), views: ['public_sessions'] }));
    expect(layer.grants.filter((grant) => grant.startsWith('public_sessions.'))).toEqual(['public_sessions.read']);
    expect(layer.grants.filter((grant) => grant.startsWith('class_sessions.'))).toEqual(['class_sessions.read', 'class_sessions.write.insert', 'class_sessions.write.update', 'class_sessions.write.delete']);
    expect(layer.views).toEqual([{ name: 'public_sessions', reads: ['class_sessions', 'teachers'] }]);
  });

  it('an app that lists no views has the universe and the schema fingerprint it had before', async () => {
    const { pool: bare } = database();
    await run(bare, TEACHERS, SESSIONS);
    const { pool: viewed } = database();
    await run(viewed, TEACHERS, SESSIONS, PUBLIC_SESSIONS);
    const before = await quietly(() => createDataLayer({ pool: bare, cache: createMemoryCache() }));
    for (const views of [undefined, []]) {
      const layer = await quietly(() => createDataLayer({ pool: viewed, cache: createMemoryCache(), ...(views === undefined ? {} : { views }) }));
      expect(layer.grants).toEqual(before.grants);
      expect(layer.views).toEqual([]);
      expect(computeSchemaFingerprint(layer.schema)).toBe(computeSchemaFingerprint(before.schema));
    }
  });

  it('`views` is a list of names in the manifest, and absent is fine', () => {
    expect(manifestMisfits({ charter: { public: [] }, actions: {} })).toEqual([]);
    expect(manifestMisfits({ charter: { public: [] }, actions: {}, views: ['public_sessions'] })).toEqual([]);
    expect(manifestMisfits({ charter: { public: [] }, actions: {}, views: 'public_sessions' })).not.toEqual([]);
  });

  it('a write grant naming a view matches nothing, and the charter says so', () => {
    const grants = ['class_sessions.read', 'teachers.read', 'public_sessions.read'];
    const app = site({ charter: { public: { actions: [], data: ['public_sessions.read', 'public_sessions.write.insert'] } } });
    const report = verifyManifest(candidateOf(app, { actions: {}, entries: [] }, grants));
    expect(report.charter.warnings.map((warning) => warning.detail)).toContain('role "public" allows "public_sessions.write.insert" (data) which matches nothing');
  });
});

describe('a boot with views', () => {
  it('boots, serves the view to a role that is refused the tables under it, and says so', async () => {
    const { pool, runtimeOf } = database();
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const server = await quietly(() => createServer(site(), runtimeOf(tables(TABLES, VIEW), 'apply')));
    try {
      expect(said.mock.calls.map((call) => String(call[0]))).toEqual(
        expect.arrayContaining([
          '[moss] public reads public_sessions, a view over class_sessions, which it is not granted.',
          '[moss] public reads public_sessions, a view over teachers, which it is not granted.',
        ]),
      );
      expect(said.mock.calls.map((call) => String(call[0])).filter((line) => line.includes('staff reads'))).toEqual([]);
      await run(pool, SEED);
      const ask = (fingerprint: string) =>
        server.request('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint, context: {} }) });
      expect(await (await ask('sessions/site')).json()).toEqual({ result: [{ id: 's1', teacher: 'Ada' }], meta: expect.anything() });
      const refused = await ask('sessions/staff');
      expect(await refused.json()).toMatchObject({ error: 'scope_denied' });
    } finally {
      server.close();
    }
  });

  it('refuses a listed name the database has no view of', async () => {
    const { runtimeOf } = database();
    await expect(quietly(() => createServer(site({ views: ['nowhere'] }), runtimeOf(tables(TABLES, VIEW), 'apply')))).rejects.toThrow('"nowhere" is not in the database');
  });

  it('an app with no `views` boots on a database that has views, as it did before', async () => {
    const { runtimeOf } = database();
    const server = await quietly(() => createServer(defineApp({ charter: { public: [] }, actions: {}, entries: [SESSIONS_FOR_STAFF] }), runtimeOf(tables(TABLES, VIEW), 'apply')));
    try {
      expect(server.charterReport().warnings.map((warning) => warning.detail)).toEqual([]);
    } finally {
      server.close();
    }
  });
});

describe('nisc migrate, with views', () => {
  it('dropping a listed view is a removal: refused unless it is allowed', async () => {
    const { runtimeOf } = database();
    await migrateTables(runtimeOf(tables(TABLES, VIEW)), site());
    const refused = await migrateTables(runtimeOf(tables(TABLES, VIEW, DROP_VIEW)), site({ entries: [] })).catch((error: unknown) => error);
    expect(String(refused)).toContain('this run removes public_sessions');
    const allowed = await migrateTables(runtimeOf(tables(TABLES, VIEW, DROP_VIEW)), site({ entries: [] }), { allowRemoval: true });
    expect(allowed.removed).toEqual(['public_sessions']);
  });

  it('a view dropped and made again in one run is not a removal', async () => {
    const { runtimeOf } = database();
    await migrateTables(runtimeOf(tables(TABLES, VIEW)), site());
    const report = await migrateTables(runtimeOf(tables(TABLES, VIEW, REMADE_VIEW)), site());
    expect(report.removed).toEqual([]);
  });

  it('a write entry to a view does not fit, and refuses the run', async () => {
    const { runtimeOf } = database();
    const refused = await migrateTables(runtimeOf(tables(TABLES, VIEW)), site({ entries: [SESSIONS_ON_THE_SITE, WRITE_TO_THE_VIEW] })).catch((error: unknown) => error);
    expect(String(refused)).toContain('sessions/rename: "public_sessions" is a view: it is read, never written.');
  });
});
