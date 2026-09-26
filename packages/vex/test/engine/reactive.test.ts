import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import { seedCache } from '../../src/cache/seed.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { handleQuery, tablesChangedBy } from '../../src/handler.js';
import type { QueryEngine } from '../../src/types.js';
import type { DatabaseAdapter } from '../../src/adapters/adapter.types.js';
import type { ScopePolicy } from '../../src/scope/scope.types.js';
import type { QueryResponse } from '../../src/schemas/request.schema.js';
import type { SeedEntry, SeedMutation } from '../../src/cache/seed.js';

// `refresh: 'reactive'` end to end, against a real database: one query for
// everybody who would get the same rows, a write through the handler reaching
// every follower whose answer changed and nobody else, and a snapshot read
// behaving exactly as it always has.

const DDL = `
  CREATE TABLE houses (id TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE members (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    house_id TEXT REFERENCES houses (id) ON DELETE CASCADE
  );
  INSERT INTO houses VALUES ('h1', 'Ember'), ('h2', 'Tide');
  INSERT INTO members VALUES ('m1', 'Ada', NULL), ('m2', 'Ben', NULL), ('m3', 'Cy', 'h2');
`;

const ENTRIES: (SeedEntry | SeedMutation)[] = [
  {
    fingerprint: 'members/roster',
    refresh: 'reactive',
    shape: [{ name: '', house: '' }],
    dsl: { from: ['members'], fields: ['members.name', { field: 'members.house_id', as: 'house' }], sort: [{ field: 'members.id', dir: 'asc' }] },
    // Words per reader: the same rows, said in the reader's own language.
    mapping: {
      $map: {
        over: { $ref: '$.result' },
        as: 'row',
        body: {
          name: { $get: { from: { $var: 'row' }, path: ['name'] } },
          house: { $coalesce: [{ $get: { from: { $var: 'row' }, path: ['house'] } }, { $ref: '$.scope.unsorted' }] },
        },
      },
    },
  },
  {
    fingerprint: 'members/mine',
    refresh: 'reactive',
    shape: { house: '' },
    dsl: { from: ['members'], fields: [{ field: 'members.house_id', as: 'house' }], filter: { eq: ['members.id', { $scope: 'userId' }] } },
  },
  {
    fingerprint: 'members/snapshot',
    shape: [{ name: '' }],
    dsl: { from: ['members'], fields: ['members.name'], sort: [{ field: 'members.id', dir: 'asc' }] },
  },
  {
    fingerprint: 'members/sort',
    mutation: { op: 'update', table: 'members', set: { house_id: { $context: 'house' } }, where: { eq: ['members.id', { $context: 'member' }] } },
  },
  {
    fingerprint: 'houses/remove',
    mutation: { op: 'delete', table: 'houses', where: { eq: ['houses.id', { $context: 'house' }] } },
  },
];

const policy: ScopePolicy = { default: 'allow', entities: {} };

type World = { engine: QueryEngine; db: PGlite; queries: () => number };

const makeWorld = async (): Promise<World> => {
  const db = new PGlite();
  await db.exec(DDL);
  const pool = createPglitePool(db);
  const inner = createPostgresAdapter({ pool });
  let queries = 0;
  const adapter: DatabaseAdapter = { ...inner, execute: (query, params) => { queries += 1; return inner.execute(query, params); } };
  const cache = createMemoryCache();
  await seedCache(cache, ENTRIES);
  const engine = createQueryEngine({ adapter, cache, rows: { debounceMs: 1 } });
  await engine.introspect();
  return { engine, db, queries: () => queries };
};

const config = (world: World) => ({ engine: world.engine, locked: true, scopePolicy: policy, mutations: { client: world.db, policy } });

// Replays a fingerprint as `userId`, following the answer.
const follow = async (world: World, fingerprint: string, scope: Record<string, unknown>, signal: AbortSignal) => {
  const changes: unknown[] = [];
  const res = await handleQuery(config(world), { fingerprint, context: {} }, scope, {
    signal,
    onChange: (response: QueryResponse) => changes.push(response.result),
  });
  expect(res.status).toBe(200);
  const body = res.body as QueryResponse;
  return { result: body.result, changes };
};

const write = async (world: World, fingerprint: string, context: Record<string, unknown>) => {
  const res = await handleQuery(config(world), { fingerprint, context }, { userId: 'speaker' });
  expect(res.status).toBe(200);
};

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 30));

let world: World;
let controller = new AbortController();

beforeEach(async () => {
  world = await makeWorld();
  controller = new AbortController();
});

afterEach(() => {
  controller.abort();
  world.engine.rows.stop();
});

describe('reactive reads', () => {
  it('everybody who would get the same rows shares one query — and gets their own words', async () => {
    const english = await follow(world, 'members/roster', { userId: 'm1', unsorted: 'unsorted' }, controller.signal);
    const german = await follow(world, 'members/roster', { userId: 'm2', unsorted: 'ungeordnet' }, controller.signal);
    expect(world.queries()).toBe(1);
    expect(english.result).toEqual([{ name: 'Ada', house: 'unsorted' }, { name: 'Ben', house: 'unsorted' }, { name: 'Cy', house: 'h2' }]);
    expect(german.result).toEqual([{ name: 'Ada', house: 'ungeordnet' }, { name: 'Ben', house: 'ungeordnet' }, { name: 'Cy', house: 'h2' }]);
    expect(world.engine.rows.stats()).toMatchObject({ follows: 1, followers: 2 });
  });

  it('a write reaches every follower of what it changed, once, in their own words', async () => {
    const english = await follow(world, 'members/roster', { userId: 'm1', unsorted: 'unsorted' }, controller.signal);
    const german = await follow(world, 'members/roster', { userId: 'm2', unsorted: 'ungeordnet' }, controller.signal);
    await write(world, 'members/sort', { member: 'm1', house: 'h1' });
    await settle();
    expect(english.changes).toEqual([[{ name: 'Ada', house: 'h1' }, { name: 'Ben', house: 'unsorted' }, { name: 'Cy', house: 'h2' }]]);
    expect(german.changes).toEqual([[{ name: 'Ada', house: 'h1' }, { name: 'Ben', house: 'ungeordnet' }, { name: 'Cy', house: 'h2' }]]);
    // One query to answer, one to refetch — not one per follower.
    expect(world.queries()).toBe(2);
  });

  it('a follower whose own answer did not change hears nothing', async () => {
    const ada = await follow(world, 'members/mine', { userId: 'm1' }, controller.signal);
    const ben = await follow(world, 'members/mine', { userId: 'm2' }, controller.signal);
    // Different people, different scope values bound: two keys, two queries.
    expect(world.queries()).toBe(2);
    await write(world, 'members/sort', { member: 'm1', house: 'h1' });
    await settle();
    expect(ada.changes).toEqual([{ house: 'h1' }]);
    expect(ben.changes).toEqual([]);
  });

  it('a burst of writes is one refetch', async () => {
    const roster = await follow(world, 'members/roster', { userId: 'm1', unsorted: '-' }, controller.signal);
    await write(world, 'members/sort', { member: 'm1', house: 'h1' });
    await write(world, 'members/sort', { member: 'm2', house: 'h1' });
    await write(world, 'members/sort', { member: 'm3', house: 'h1' });
    await settle();
    expect(roster.changes).toHaveLength(1);
    expect(roster.changes[0]).toEqual([{ name: 'Ada', house: 'h1' }, { name: 'Ben', house: 'h1' }, { name: 'Cy', house: 'h1' }]);
  });

  it('a delete reaches the reads of the tables it cascades into', async () => {
    const roster = await follow(world, 'members/roster', { userId: 'm1', unsorted: '-' }, controller.signal);
    await write(world, 'houses/remove', { house: 'h2' });
    await settle();
    expect(roster.changes).toEqual([[{ name: 'Ada', house: '-' }, { name: 'Ben', house: '-' }]]);
  });

  it('aborting ends the follow', async () => {
    const own = new AbortController();
    const roster = await follow(world, 'members/roster', { userId: 'm1', unsorted: '-' }, own.signal);
    own.abort();
    expect(world.engine.rows.stats()).toMatchObject({ follows: 0 });
    await write(world, 'members/sort', { member: 'm1', house: 'h1' });
    await settle();
    expect(roster.changes).toEqual([]);
  });

  it('a snapshot read answers once, is never followed, and is not cached', async () => {
    const snapshot = await follow(world, 'members/snapshot', { userId: 'm1' }, controller.signal);
    await follow(world, 'members/snapshot', { userId: 'm1' }, controller.signal);
    expect(world.queries()).toBe(2);
    expect(world.engine.rows.stats()).toMatchObject({ follows: 0, entries: 0 });
    await write(world, 'members/sort', { member: 'm1', house: 'h1' });
    await settle();
    expect(snapshot.changes).toEqual([]);
  });
});

describe('tablesChangedBy', () => {
  it('names the written tables, plus what a delete cascades into, and nothing a write left untouched', async () => {
    const schema = world.engine.getSchema();
    expect(tablesChangedBy([{ table: 'members', op: 'update', rows: [{}] }], schema)).toEqual(['members']);
    expect(tablesChangedBy([{ table: 'houses', op: 'delete', rows: [{}] }], schema).sort()).toEqual(['houses', 'members']);
    expect(tablesChangedBy([{ table: 'houses', op: 'delete', rows: [] }], schema)).toEqual([]);
  });
});
