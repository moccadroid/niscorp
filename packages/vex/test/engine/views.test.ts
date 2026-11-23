import { describe, it, expect, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import { seedCache } from '../../src/cache/seed.js';
import { computeSchemaFingerprint } from '../../src/cache/hash.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { handleQuery } from '../../src/handler.js';
import { executeMutation, mutationMisfits } from '../../src/mutations/engine.js';
import { MutationDefinitionSchema } from '../../src/mutations/schema.js';
import type { QueryEngine } from '../../src/types.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';
import type { QueryResponse } from '../../src/schemas/request.schema.js';
import type { SeedEntry, SeedMutation } from '../../src/cache/seed.js';

const TABLES = `
  CREATE TABLE teachers (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL);
  CREATE TABLE class_sessions (
    id         TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES teachers (id),
    starts_on  DATE NOT NULL,
    studio     TEXT NOT NULL,
    seats      INTEGER NOT NULL,
    notes      TEXT
  );
  CREATE INDEX class_sessions_studio ON class_sessions (studio);
  INSERT INTO teachers VALUES ('t1', 'Ada', 'ada@example.com'), ('t2', 'Ben', 'ben@example.com');
  INSERT INTO class_sessions VALUES
    ('s1', 't1', '2026-12-01', 'north', 12, 'staff only'),
    ('s2', 't2', '2026-12-02', 'south', 8, NULL),
    ('s3', 't1', '2025-12-03', 'north', 10, NULL);
`;

const VIEWS = `
  CREATE VIEW public_sessions AS
    SELECT s.id, s.starts_on, s.studio, s.seats, t.name AS teacher
    FROM class_sessions s JOIN teachers t ON t.id = s.teacher_id;
  CREATE VIEW upcoming_sessions AS
    SELECT id, starts_on, teacher FROM public_sessions WHERE starts_on >= DATE '2026-01-01';
  CREATE MATERIALIZED VIEW sessions_per_studio AS
    SELECT studio, count(*) AS n FROM class_sessions GROUP BY studio;
`;

const databaseWith = async (ddl: string): Promise<PGlite> => {
  const db = new PGlite();
  await db.exec(ddl);
  return db;
};

const adapterOf = (db: PGlite) => createPostgresAdapter({ pool: createPglitePool(db) });

const engines: QueryEngine[] = [];
const engineOf = (db: PGlite, views?: readonly string[], cache = createMemoryCache()): QueryEngine => {
  const engine = createQueryEngine({ adapter: adapterOf(db), cache, rows: { debounceMs: 1 }, ...(views !== undefined ? { config: { views } } : {}) });
  engines.push(engine);
  return engine;
};

afterEach(() => {
  for (const engine of engines.splice(0)) engine.rows.stop();
});

const allow: ScopePolicy = { default: 'allow', entities: {} };

describe('views, read as entities where they are listed', () => {
  it('a view is an entity only when it is listed; a materialized view never is', async () => {
    const db = await databaseWith(TABLES + VIEWS);
    const names = (schema: { entities: { name: string }[] }) => schema.entities.map((e) => e.name);
    expect(names(await adapterOf(db).introspect())).toEqual(['class_sessions', 'teachers']);
    expect(names(await adapterOf(db).introspect({ views: [] }))).toEqual(['class_sessions', 'teachers']);
    expect(names(await adapterOf(db).introspect({ views: ['public_sessions'] }))).toEqual(['class_sessions', 'public_sessions', 'teachers']);
    expect(names(await engineOf(db, ['public_sessions', 'upcoming_sessions']).introspect())).toEqual(['class_sessions', 'public_sessions', 'teachers', 'upcoming_sessions']);
  });

  it('listing a name that is no view of the database refuses the introspection', async () => {
    const db = await databaseWith(TABLES + VIEWS);
    await expect(engineOf(db, ['nowhere']).introspect()).rejects.toThrow('"nowhere" is not in the database');
    await expect(engineOf(db, ['teachers']).introspect()).rejects.toThrow('"teachers" is a table');
    await expect(engineOf(db, ['sessions_per_studio']).introspect()).rejects.toThrow('a materialized view is not read');
  });

  it('refuses a listed view over anything but the tables it reads: another schema, a materialized view, a sequence', async () => {
    const db = await databaseWith(`${TABLES}${VIEWS}
      CREATE SCHEMA other;
      CREATE TABLE other.teachers (id TEXT PRIMARY KEY);
      CREATE VIEW other.hidden AS SELECT id FROM public.class_sessions;
      CREATE SEQUENCE counter;
      CREATE VIEW other_teachers AS SELECT id FROM other.teachers;
      CREATE VIEW through_other AS SELECT id FROM other.hidden;
      CREATE VIEW per_studio AS SELECT studio FROM sessions_per_studio;
      CREATE VIEW numbered AS SELECT nextval('counter') AS n;
    `);
    const listed = ['other_teachers', 'through_other', 'per_studio', 'numbered'];
    const schema = await adapterOf(db).introspect({ views: listed });
    expect(listed.map((name) => schema.entities.find((e) => e.name === name)?.view?.reads)).toEqual([['other.teachers'], ['other.hidden'], ['sessions_per_studio'], ['counter']]);
    await expect(engineOf(db, listed).introspect()).rejects.toThrow(
      '"other_teachers" reads "other.teachers", which is no table vex reads; "through_other" reads "other.hidden", which is no table vex reads; "per_studio" reads "sessions_per_studio", which is no table vex reads; "numbered" reads "counter", which is no table vex reads',
    );
    expect((await engineOf(db, ['public_sessions']).introspect()).entities.some((e) => e.name === 'public_sessions')).toBe(true);
  });

  it("has the view's columns and their types, and no key, index, relation or row count", async () => {
    const db = await databaseWith(TABLES + VIEWS);
    const schema = await adapterOf(db).introspect({ views: ['public_sessions'] });
    const view = schema.entities.find((e) => e.name === 'public_sessions');
    expect(view?.fields.map((f) => [f.name, f.normalizedType, f.primaryKey])).toEqual([
      ['id', 'string', false],
      ['starts_on', 'date', false],
      ['studio', 'string', false],
      ['seats', 'number', false],
      ['teacher', 'string', false],
    ]);
    expect(view).toMatchObject({ relations: [], indexes: [], rowCount: undefined });
  });

  it('says which tables a view reads, through a view it reads', async () => {
    const db = await databaseWith(TABLES + VIEWS);
    const schema = await adapterOf(db).introspect({ views: ['public_sessions', 'upcoming_sessions'] });
    expect(schema.entities.find((e) => e.name === 'public_sessions')?.view).toEqual({ reads: ['class_sessions', 'teachers'] });
    expect(schema.entities.find((e) => e.name === 'upcoming_sessions')?.view).toEqual({ reads: ['class_sessions', 'teachers'] });
    expect(schema.entities.find((e) => e.name === 'teachers')?.view).toBeUndefined();
  });

  it('the schema fingerprint of a database whose views nobody lists is the one it had without them', async () => {
    const bare = computeSchemaFingerprint(await adapterOf(await databaseWith(TABLES)).introspect());
    const db = await databaseWith(TABLES + VIEWS);
    expect(computeSchemaFingerprint(await adapterOf(db).introspect())).toBe(bare);
    expect(computeSchemaFingerprint(await adapterOf(db).introspect({ views: [] }))).toBe(bare);
    expect(computeSchemaFingerprint(await adapterOf(db).introspect({ views: ['public_sessions'] }))).not.toBe(bare);
  });

  it('a filter on a view column is not said to be unindexed: its index is on the table under it', async () => {
    const db = await databaseWith(TABLES + VIEWS);
    const engine = engineOf(db, ['public_sessions']);
    await engine.introspect();
    const tested = await engine.test({ from: ['public_sessions'], fields: ['public_sessions.id'], filter: { eq: ['public_sessions.studio', 'north'] } });
    expect(tested.errors).toEqual([]);
    expect(tested.rows).toHaveLength(2);
    expect(tested.warnings.filter((w) => w.includes('index'))).toEqual([]);
    const onTable = await engine.test({ from: ['class_sessions'], fields: ['class_sessions.id'], filter: { eq: ['class_sessions.notes', 'x'] } });
    expect(onTable.warnings).toContain('Unindexed filter columns: class_sessions.notes. Consider adding indexes for better performance.');
  });

  it('a view is not joined: it has no keys to join by', async () => {
    const db = await databaseWith(TABLES + VIEWS);
    const engine = engineOf(db, ['public_sessions']);
    await engine.introspect();
    expect(() => engine.compile({ from: ['public_sessions', 'teachers'], fields: ['public_sessions.id', 'teachers.email'] })).toThrow('No foreign key relationship found');
  });
});

describe('a view is read, never written', () => {
  const writes = MutationDefinitionSchema.parse([
    { op: 'insert', table: 'public_sessions', values: { id: { $context: 'id' } } },
    { op: 'insertEach', table: 'public_sessions', items: { $context: 'items' }, values: { id: { $item: 'id' } } },
    { op: 'update', table: 'public_sessions', set: { seats: { $context: 'seats' } }, where: { eq: ['public_sessions.id', { $context: 'id' }] } },
    { op: 'delete', table: 'public_sessions', where: { eq: ['public_sessions.id', { $context: 'id' }] } },
    { op: 'upsert', table: 'public_sessions', key: 'id', columns: { seats: { $context: 'seats' } } },
  ]);
  const refusal = '"public_sessions" is a view: it is read, never written.';

  it('each kind of write to one is refused before it runs, though Postgres would take it', async () => {
    const db = await databaseWith(TABLES + VIEWS);
    const schema = await adapterOf(db).introspect({ views: ['public_sessions'] });
    const pool = createPglitePool(db);
    const context = { id: 's2', seats: 99, items: [{ id: 's9' }] };
    for (const write of Array.isArray(writes) ? writes : [writes]) {
      await expect(executeMutation(pool, write, { context, scope: {}, policy: allow, schema })).rejects.toThrow(refusal);
    }
    await expect(executeMutation(pool, { op: 'upsert', table: 'public_sessions', key: 'id', columns: { seats: { $context: 'seats' } } }, { context: { seats: 1 }, scope: {}, policy: allow, schema })).rejects.toThrow(refusal);
    expect((await db.query('SELECT seats FROM class_sessions WHERE id = $1', ['s2'])).rows).toEqual([{ seats: 8 }]);
  });

  it('mutationMisfits names it, and a $lookup from a view in a write is a read, and fits', async () => {
    const db = await databaseWith(TABLES + VIEWS);
    const schema = await adapterOf(db).introspect({ views: ['public_sessions'] });
    expect(mutationMisfits(writes, schema)).toEqual(Array.from({ length: 6 }, () => refusal));
    const lookup = MutationDefinitionSchema.parse({
      op: 'update',
      table: 'class_sessions',
      set: { notes: { $lookup: { from: 'public_sessions', field: 'teacher', where: { eq: ['public_sessions.id', { $context: 'id' }] } } } },
      where: { eq: ['class_sessions.id', { $context: 'id' }] },
    });
    expect(mutationMisfits(lookup, schema)).toEqual([]);
  });
});

describe('a view under a policy, and followed live', () => {
  const ENTRIES: (SeedEntry | SeedMutation)[] = [
    {
      fingerprint: 'sessions/public',
      refresh: 'reactive',
      dsl: { from: ['public_sessions'], fields: ['public_sessions.id', 'public_sessions.seats', 'public_sessions.teacher'], sort: [{ field: 'public_sessions.id', dir: 'asc' }] },
    },
    {
      fingerprint: 'sessions/upcoming',
      refresh: 'reactive',
      dsl: { from: ['upcoming_sessions'], fields: ['upcoming_sessions.id', 'upcoming_sessions.teacher'], sort: [{ field: 'upcoming_sessions.id', dir: 'asc' }] },
    },
    { fingerprint: 'sessions/all', dsl: { from: ['class_sessions'], fields: ['class_sessions.id', 'class_sessions.notes'] } },
    { fingerprint: 'sessions/seats', mutation: { op: 'update', table: 'class_sessions', set: { seats: { $context: 'seats' } }, where: { eq: ['class_sessions.id', { $context: 'id' }] } } },
    { fingerprint: 'teachers/rename', mutation: { op: 'update', table: 'teachers', set: { name: { $context: 'name' } }, where: { eq: ['teachers.id', { $context: 'id' }] } } },
  ];

  const seeded = async () => {
    const db = await databaseWith(TABLES + VIEWS);
    const cache = createMemoryCache();
    await seedCache(cache, ENTRIES);
    const engine = engineOf(db, ['public_sessions', 'upcoming_sessions'], cache);
    await engine.introspect();
    return { db, engine };
  };

  it('a match rule on a view column keeps the rows it matches', async () => {
    const { engine } = await seeded();
    const policy: ScopePolicy = { default: 'deny', entities: { public_sessions: { read: [{ match: 'studio', to: 'studio' }] } } };
    const { result } = await engine.execute({ fingerprint: 'sessions/public', context: {} }, { scope: { studio: 'north' }, scopePolicy: policy });
    expect(result).toEqual([
      { id: 's1', seats: 12, teacher: 'Ada' },
      { id: 's3', seats: 10, teacher: 'Ada' },
    ]);
    await expect(engine.execute({ fingerprint: 'sessions/public', context: {} }, { scope: {}, scopePolicy: policy })).rejects.toMatchObject({ code: 'missing_scope' });
    await expect(engine.execute({ fingerprint: 'sessions/all', context: {} }, { scope: { studio: 'north' }, scopePolicy: policy })).rejects.toMatchObject({ code: 'scope_denied' });
  });

  it('a write to a table under a view answers a reactive read of it again, through a view over a view too', async () => {
    const { db, engine } = await seeded();
    const config = { engine, locked: true, scopePolicy: allow, mutations: { client: db, policy: allow } };
    const controller = new AbortController();
    const follow = async (fingerprint: string) => {
      const changes: unknown[] = [];
      const res = await handleQuery(config, { fingerprint, context: {} }, {}, { signal: controller.signal, onChange: (response: QueryResponse) => changes.push(response.result) });
      expect(res.status).toBe(200);
      return changes;
    };
    try {
      const sessions = await follow('sessions/public');
      const upcoming = await follow('sessions/upcoming');
      expect((await handleQuery(config, { fingerprint: 'sessions/seats', context: { id: 's2', seats: 9 } }, {})).status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(sessions).toEqual([[{ id: 's1', seats: 12, teacher: 'Ada' }, { id: 's2', seats: 9, teacher: 'Ben' }, { id: 's3', seats: 10, teacher: 'Ada' }]]);
      expect(upcoming).toEqual([]);
      expect((await handleQuery(config, { fingerprint: 'teachers/rename', context: { id: 't2', name: 'Bea' } }, {})).status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(upcoming).toEqual([[{ id: 's1', teacher: 'Ada' }, { id: 's2', teacher: 'Bea' }]]);
    } finally {
      controller.abort();
    }
  });
});
