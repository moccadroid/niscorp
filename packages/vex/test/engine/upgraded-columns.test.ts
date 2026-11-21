import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createUpgrader, type Sequence } from '@niscorp/strata';
import { evaluate } from '@niscorp/prism';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import { seedCache } from '../../src/cache/seed.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { handleQuery } from '../../src/handler.js';
import type { QueryEngine, QueryEngineConfig } from '../../src/types.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';
import type { QueryResponse } from '../../src/schemas/request.schema.js';
import type { SeedEntry, SeedMutation } from '../../src/cache/seed.js';
import type { Query } from '../../src/schemas/query.schema.js';

const ANSWERS: Sequence = {
  id: 'app.answers',
  documents: { plan: {} },
  migrations: [{ description: 'A plan has an ink; one kept before is blue', steps: [{ kind: 'document', at: 'app.answers/plan', transform: { $merge: [{ ink: { $const: 'blue' } }, { $ref: '$.document' }] } }] }],
};

const THINGS: Sequence = {
  id: 'app.things',
  documents: { list: {}, note: {} },
  migrations: [{ description: 'A list has a shape; one kept before is plain', steps: [{ kind: 'document', at: 'app.things/list', transform: { $merge: [{ shape: { $const: 'plain' } }, { $ref: '$.document' }] } }] }],
};

const DDL = `
  CREATE TABLE answers (id TEXT PRIMARY KEY, plan JSONB, grammar JSONB);
  CREATE TABLE things (id TEXT PRIMARY KEY, kind TEXT NOT NULL, doc JSONB NOT NULL, grammar JSONB NOT NULL, answer TEXT REFERENCES answers (id));
  INSERT INTO answers VALUES
    ('a1', '{"columns": 1}', NULL),
    ('a2', '{"columns": 2}', '{"app.answers": 0}'),
    ('a3', '{"columns": 3, "ink": "red"}', '{"app.answers": 1, "app.things": 1}'),
    ('a4', NULL, NULL);
  INSERT INTO things (id, kind, doc, grammar) VALUES
    ('t1', 'list', '{"rows": []}', '{"app.things": 0}'),
    ('t2', 'note', '{"text": "hi"}', '{"app.things": 0}');
`;

const planMapping = {
  $map: {
    over: { $ref: '$.result' },
    as: 'row',
    body: { id: { $get: { from: { $var: 'row' }, path: ['id'] } }, ink: { $get: { from: { $var: 'row' }, path: ['plan', 'ink'], fallback: null } } },
  },
};

const ENTRIES: (SeedEntry | SeedMutation)[] = [
  {
    fingerprint: 'answers/stack',
    shape: [{ id: '', ink: '' }],
    dsl: { from: ['answers'], fields: ['answers.id', 'answers.plan', 'answers.grammar'], sort: [{ field: 'answers.id', dir: 'asc' }] },
    mapping: planMapping,
  },
  {
    fingerprint: 'answers/live',
    refresh: 'reactive',
    shape: [{ id: '', ink: '' }],
    dsl: { from: ['answers'], fields: ['answers.id', 'answers.plan', 'answers.grammar'], sort: [{ field: 'answers.id', dir: 'asc' }] },
    mapping: planMapping,
  },
  {
    fingerprint: 'answers/raw',
    dsl: { from: ['answers'], fields: ['answers.id', { field: 'answers.plan', as: 'p' }, { field: 'answers.grammar', as: 'g' }], sort: [{ field: 'answers.id', dir: 'asc' }] },
  },
  {
    fingerprint: 'answers/no-stamp',
    dsl: { from: ['answers'], fields: ['answers.id', 'answers.plan'] },
  },
  {
    fingerprint: 'answers/two-stamps',
    dsl: { from: ['answers'], fields: ['answers.id', 'answers.plan', 'answers.grammar', { field: 'answers.grammar', as: 'g' }], sort: [{ field: 'answers.id', dir: 'asc' }], limit: 1 },
  },
  {
    fingerprint: 'answers/filtered-by-subquery',
    dsl: {
      from: ['answers', { as: 'planned', query: { from: ['answers'], fields: [{ field: 'answers.id', as: 'pid' }], filter: { isNotNull: 'answers.plan' } } }],
      fields: ['answers.id'],
      filter: { eq: ['answers.id', 'planned.pid'] },
    },
  },
  {
    fingerprint: 'answers/and-things',
    dsl: { from: ['answers', 'things'], fields: ['answers.id', 'answers.plan', 'answers.grammar', 'things.grammar'], limit: 1 },
  },
  {
    fingerprint: 'things/all',
    dsl: { from: ['things'], fields: ['things.id', 'things.kind', 'things.doc', 'things.grammar'], sort: [{ field: 'things.id', dir: 'asc' }] },
  },
  {
    fingerprint: 'answers/keep',
    mutation: { op: 'insert', table: 'answers', values: { id: { $context: 'id' }, plan: { $context: 'plan' }, grammar: { $context: 'grammar' } } },
  },
];

const UPGRADED: QueryEngineConfig['upgradedColumns'] = {
  answers: { plan: { stamp: 'grammar', kind: 'app.answers/plan' } },
  things: { doc: { stamp: 'grammar', kind: { grammar: 'app.things', column: 'kind' } } },
};

const policy: ScopePolicy = { default: 'allow', entities: {} };

type World = { engine: QueryEngine; db: PGlite };

const makeWorld = async (upgraded: boolean, columns: QueryEngineConfig['upgradedColumns'] = UPGRADED): Promise<World> => {
  const db = new PGlite();
  await db.exec(DDL);
  const adapter = createPostgresAdapter({ pool: createPglitePool(db) });
  const cache = createMemoryCache();
  await seedCache(cache, ENTRIES);
  const upgrader = await createUpgrader([ANSWERS, THINGS], { transform: evaluate });
  const engine = createQueryEngine({ adapter, cache, rows: { debounceMs: 1 }, ...(upgraded ? { upgradedColumns: columns, upgrader } : {}) });
  await engine.introspect();
  return { engine, db };
};

const config = (world: World) => ({ engine: world.engine, locked: true, scopePolicy: policy, mutations: { client: world.db, policy } });

const replay = async (world: World, fingerprint: string, context: Record<string, unknown> = {}, live?: { signal: AbortSignal; onChange: (r: QueryResponse) => void }) =>
  handleQuery(config(world), { fingerprint, context }, { userId: 'u' }, live);

const resultOf = (res: { status: number; body: unknown }): unknown => {
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body as QueryResponse).result;
};

let world: World;
const controller = new AbortController();

afterEach(() => world.engine.rows.stop());

describe('a read of upgraded columns', () => {
  beforeEach(async () => {
    world = await makeWorld(true);
  });

  it('hands the mapping each plan at the current grammar, whatever it was written at', async () => {
    expect(resultOf(await replay(world, 'answers/stack'))).toEqual([
      { id: 'a1', ink: 'blue' },
      { id: 'a2', ink: 'blue' },
      { id: 'a3', ink: 'red' },
      { id: 'a4', ink: null },
    ]);
  });

  it('rewrites the stamp beside the value, under its own output key, so a second upgrade does nothing', async () => {
    const rows = resultOf(await replay(world, 'answers/raw'));
    expect(rows).toEqual([
      { id: 'a1', p: { columns: 1, ink: 'blue' }, g: { 'app.answers': 1, 'app.things': 1 } },
      { id: 'a2', p: { columns: 2, ink: 'blue' }, g: { 'app.answers': 1, 'app.things': 1 } },
      { id: 'a3', p: { columns: 3, ink: 'red' }, g: { 'app.answers': 1, 'app.things': 1 } },
      { id: 'a4', p: null, g: null },
    ]);
  });

  it('takes the kind from a column of the row', async () => {
    expect(resultOf(await replay(world, 'things/all'))).toEqual([
      { id: 't1', kind: 'list', doc: { rows: [], shape: 'plain' }, grammar: { 'app.answers': 1, 'app.things': 1 } },
      { id: 't2', kind: 'note', doc: { text: 'hi' }, grammar: { 'app.answers': 1, 'app.things': 1 } },
    ]);
  });

  it('upgrades what a reactive read refetches after a write', async () => {
    const changes: unknown[] = [];
    const first = resultOf(await replay(world, 'answers/live', {}, { signal: controller.signal, onChange: (r) => changes.push(r.result) }));
    expect(first).toHaveLength(4);
    resultOf(await replay(world, 'answers/keep', { id: 'a5', plan: { columns: 1 }, grammar: { 'app.answers': 0 } }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(changes.at(-1)).toEqual([
      { id: 'a1', ink: 'blue' },
      { id: 'a2', ink: 'blue' },
      { id: 'a3', ink: 'red' },
      { id: 'a4', ink: null },
      { id: 'a5', ink: 'blue' },
    ]);
  });

  it('refuses the read when a row was written by newer code (TOO_NEW)', async () => {
    await world.db.exec(`INSERT INTO answers VALUES ('a9', '{"columns": 1}', '{"app.answers": 7}')`);
    const res = await replay(world, 'answers/stack');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).toContain('TOO_NEW');
  });

  it('refuses a read that selects an upgraded column without its stamp', async () => {
    const res = await replay(world, 'answers/no-stamp');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('answers.grammar');
  });
});

describe('reads that name an upgraded column in more than one way', () => {
  beforeEach(async () => {
    world = await makeWorld(true);
  });

  it('rewrites every key the stamp is selected under, so no copy of it stays behind', async () => {
    const [row] = resultOf(await replay(world, 'answers/two-stamps')) as Record<string, unknown>[];
    expect(row?.['grammar']).toEqual({ 'app.answers': 1, 'app.things': 1 });
    expect(row?.['g']).toEqual(row?.['grammar']);
  });

  it('lets a subquery filter on an upgraded column it does not return', async () => {
    expect(resultOf(await replay(world, 'answers/filtered-by-subquery'))).toHaveLength(3);
  });

  it('refuses two tables answering under the stamp key', async () => {
    const res = await replay(world, 'answers/and-things');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('grammar');
  });

  it('refuses the column reached any way but as a field of the outer read, and a compute named like its stamp', () => {
    const outside: Query[] = [
      { from: [{ as: 's', query: { from: ['answers'], fields: ['answers.id'], compute: { p: { coalesce: ['answers.plan', 'answers.plan'] } } } }], fields: ['s.id', 's.p'] },
      { from: [{ as: 's', query: { from: ['answers'], fields: ['answers.id', 'answers.plan'] } }], fields: ['s.id'] },
      { from: ['answers'], fields: ['answers.id'], aggregate: { n: { count: 'answers.plan' } } },
      { from: ['answers'], fields: ['answers.id'], groupBy: ['answers.plan'], aggregate: { n: { count: '*' } } },
    ];
    for (const dsl of outside) expect(() => world.engine.compile(dsl)).toThrow('only as one of its own fields');
    expect(() =>
      world.engine.compile({ from: ['answers'], fields: ['answers.plan', 'answers.grammar'], compute: { grammar: { coalesce: ['answers.id', 'answers.id'] } } }),
    ).toThrow('two values under one key (grammar)');
  });

  it('refuses a read without its stamp when it is compiled, not only when it is replayed', () => {
    expect(() => world.engine.compile({ from: ['answers'], fields: ['answers.id', 'answers.plan'] })).toThrow('add answers.grammar');
  });

  it('checks and upgrades what the generator’s own test runs read', async () => {
    const db = new PGlite();
    await db.exec(DDL);
    const upgrader = await createUpgrader([ANSWERS, THINGS], { transform: evaluate });
    const probes: unknown[] = [];
    const engine = createQueryEngine({
      adapter: createPostgresAdapter({ pool: createPglitePool(db) }),
      upgradedColumns: UPGRADED,
      upgrader,
      generateDsl: async (_request, _schema, caller) => {
        try {
          await caller.read({ from: ['answers'], fields: ['answers.id', 'answers.plan'] });
        } catch (error) {
          probes.push(error instanceof Error ? error.message : String(error));
        }
        probes.push((await caller.read({ from: ['answers'], fields: ['answers.id', 'answers.plan', 'answers.grammar'], sort: [{ field: 'answers.id', dir: 'asc' }], limit: 1 })).rows);
        return { from: ['answers'], fields: ['answers.id', 'answers.plan', 'answers.grammar'] };
      },
    });
    await engine.introspect();
    await engine.execute({ intent: 'the plans', shape: [{}], context: {} });
    expect(probes).toEqual([expect.stringContaining('answers.grammar'), [{ id: 'a1', plan: { columns: 1, ink: 'blue' }, grammar: { 'app.answers': 1, 'app.things': 1 } }]]);
    expect((await engine.test({ from: ['answers'], fields: ['answers.id', 'answers.plan', 'answers.grammar'], sort: [{ field: 'answers.id', dir: 'asc' }] })).rows[0]).toEqual({
      id: 'a1',
      plan: { columns: 1, ink: 'blue' },
      grammar: { 'app.answers': 1, 'app.things': 1 },
    });
    world = { engine, db };
  });
});

describe('a row whose value does not upgrade', () => {
  const lenient: QueryEngineConfig['upgradedColumns'] = {
    answers: { plan: { stamp: 'grammar', kind: 'app.answers/plan', unreadable: 'omit' } },
    things: { doc: { stamp: 'grammar', kind: { grammar: 'app.things', column: 'kind' }, unreadable: 'null' } },
  };

  beforeEach(async () => {
    world = await makeWorld(true, lenient);
    await world.db.exec(`INSERT INTO answers VALUES ('a9', '{"columns": 1}', '{"app.answers": 7}')`);
    await world.db.exec(`INSERT INTO things (id, kind, doc, grammar) VALUES ('t9', 'page', '{"text": "x"}', '{"app.things": 0}')`);
  });

  it('is left out under `omit`, and the read says so', async () => {
    const res = await replay(world, 'answers/stack');
    expect(resultOf(res)).toEqual([
      { id: 'a1', ink: 'blue' },
      { id: 'a2', ink: 'blue' },
      { id: 'a3', ink: 'red' },
      { id: 'a4', ink: null },
    ]);
    expect((res.body as QueryResponse).meta.warnings).toEqual([expect.stringMatching(/^The database's row 4 \(counting from 0\) was left out: its answers\.plan does not upgrade \(TOO_NEW: /)]);
  });

  it('keeps its row with the value null under `null`, its stamp untouched', async () => {
    const res = await replay(world, 'things/all');
    expect(resultOf(res)).toEqual([
      { id: 't1', kind: 'list', doc: { rows: [], shape: 'plain' }, grammar: { 'app.answers': 1, 'app.things': 1 } },
      { id: 't2', kind: 'note', doc: { text: 'hi' }, grammar: { 'app.answers': 1, 'app.things': 1 } },
      { id: 't9', kind: 'page', doc: null, grammar: { 'app.things': 0 } },
    ]);
    expect((res.body as QueryResponse).meta.warnings).toEqual([expect.stringMatching(/^The database's row 2 \(counting from 0\) has things\.doc set to null: it does not upgrade \(UNKNOWN_KIND: /)]);
  });

  it('treats a stamp that is not a stamp as a value that does not upgrade', async () => {
    await world.db.exec(`INSERT INTO answers VALUES ('a8', '{"columns": 1}', '"5"')`);
    const res = await replay(world, 'answers/stack');
    expect(resultOf(res)).toHaveLength(4);
    expect((res.body as QueryResponse).meta.warnings).toEqual([expect.stringContaining('The stamp beside answers.plan is not a stamp'), expect.stringContaining('TOO_NEW')]);
  });

  it('is left out of what a reactive read delivers too, with the warning beside it', async () => {
    const changes: QueryResponse[] = [];
    const first = await replay(world, 'answers/live', {}, { signal: controller.signal, onChange: (r) => changes.push(r) });
    expect(resultOf(first)).toHaveLength(4);
    expect((first.body as QueryResponse).meta.warnings).toHaveLength(1);
    resultOf(await replay(world, 'answers/keep', { id: 'a5', plan: { columns: 1 }, grammar: { 'app.answers': 0 } }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(changes.at(-1)?.result).toHaveLength(5);
    expect(changes.at(-1)?.meta.warnings).toEqual([expect.stringContaining('row 5 (counting from 0) was left out')]);
  });
});

describe('an engine given no upgraded columns', () => {
  beforeEach(async () => {
    world = await makeWorld(false);
  });

  it('returns the columns as stored, as before', async () => {
    expect(resultOf(await replay(world, 'answers/stack'))).toEqual([
      { id: 'a1', ink: null },
      { id: 'a2', ink: null },
      { id: 'a3', ink: 'red' },
      { id: 'a4', ink: null },
    ]);
    expect(resultOf(await replay(world, 'answers/no-stamp'))).toHaveLength(4);
  });
});

describe('an engine that cannot upgrade what it was told to', () => {
  it('is refused when it is created without an upgrader, or naming a kind or grammar the upgrader lacks', async () => {
    const adapter = createPostgresAdapter({ pool: createPglitePool(new PGlite()) });
    expect(() => createQueryEngine({ adapter, upgradedColumns: UPGRADED })).toThrow(/no `upgrader`/);
    const upgrader = await createUpgrader([ANSWERS, THINGS], { transform: evaluate });
    expect(() =>
      createQueryEngine({
        adapter,
        upgrader,
        upgradedColumns: { answers: { plan: { stamp: 'grammar', kind: 'app.answers/page' } }, things: { doc: { stamp: 'grammar', kind: { grammar: 'app.notes', column: 'kind' } } } },
      }),
    ).toThrow('answers.plan names the kind "app.answers/page"; things.doc names the grammar "app.notes"');
  });

  it('is refused at introspect when an upgraded column or its stamp is missing or not json', async () => {
    const db = new PGlite();
    await db.exec(DDL);
    const upgrader = await createUpgrader([ANSWERS, THINGS], { transform: evaluate });
    const engine = createQueryEngine({
      adapter: createPostgresAdapter({ pool: createPglitePool(db) }),
      upgradedColumns: { answers: { plan: { stamp: 'stamped_at', kind: 'app.answers/plan' } }, things: { doc: { stamp: 'kind', kind: 'app.things/note' } } },
      upgrader,
    });
    await expect(engine.introspect()).rejects.toThrow('answers.stamped_at is not in the database; things.kind is text, not json');
  });
});
