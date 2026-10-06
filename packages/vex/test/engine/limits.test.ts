import { describe, it, expect, vi, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import { createPostgresCache } from '../../src/cache/postgres.js';
import { seedCache } from '../../src/cache/seed.js';
import { createQueryEngine } from '../../src/engine/runtime.js';
import { handleFingerprintPatch } from '../../src/handler.js';
import type { CacheBackend } from '../../src/cache/cache.types.js';
import type { Query } from '../../src/schemas/query.schema.js';
import type { QueryEngineConfig, QueryEngine } from '../../src/types.js';
import type { QueryResponse } from '../../src/schemas/request.schema.js';

// The limit a query runs with, and whose number it is. Against a real
// database, with small numbers standing in for the engine's 100 and 1000: what
// is held is how many rows COME BACK, and what the reply says when the number
// that ended the list was not the author's.

const PEOPLE = 12;
const shape = [{ id: 0 }];
const all: Query = { from: ['people'], fields: ['people.id'], sort: [{ field: 'people.id', dir: 'asc' }] };

const durableCache = async (db: PGlite): Promise<CacheBackend> => {
  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init();
  return cache;
};

const world = async (config: QueryEngineConfig['config'] = { defaultLimit: 5, maxLimit: 8 }, generated: Query = all, durable = false) => {
  const db = new PGlite();
  await db.exec(`CREATE TABLE people (id serial PRIMARY KEY, name text NOT NULL); INSERT INTO people (name) SELECT 'P' || g FROM generate_series(1, ${PEOPLE}) AS g;`);
  const cache = durable ? await durableCache(db) : createMemoryCache();
  const quiet = vi.spyOn(console, 'warn').mockImplementation(() => {});
  // `generateDsl` stands in for the query agent.
  const engine = createQueryEngine({ adapter: createPostgresAdapter({ pool: createPglitePool(db) }), cache, config, generateDsl: async () => generated });
  await engine.introspect();
  quiet.mockRestore();
  return { db, cache, engine };
};

const rowsOf = (response: QueryResponse): number => (Array.isArray(response.result) ? response.result.length : -1);
const pinOf = (response: QueryResponse): string => {
  const { fingerprint } = response.meta.cache;
  if (fingerprint === undefined) throw new Error('the reply names no fingerprint');
  return fingerprint;
};
const cutWarnings = (response: QueryResponse): string[] => (response.meta.warnings ?? []).filter((line) => line.includes('may have been cut'));
const replay = (engine: QueryEngine, fingerprint: string): Promise<QueryResponse> => engine.execute({ fingerprint, context: {} });
const seed = (cache: CacheBackend, fingerprint: string, dsl: Query, more: { shape?: unknown; refresh?: 'reactive' } = {}): Promise<unknown> =>
  seedCache(cache, [{ fingerprint, shape: more.shape ?? shape, dsl, ...(more.refresh !== undefined ? { refresh: more.refresh } : {}) }]);

afterEach(() => vi.restoreAllMocks());

describe('limits — a seeded entry gets the limit its author wrote', () => {
  it('past maxLimit: the stated number of rows, not the maximum', async () => {
    const { engine, cache } = await world();
    await seed(cache, 'people/book', { ...all, limit: 10 });
    const response = await replay(engine, 'people/book');
    expect(rowsOf(response)).toBe(10);
    expect(cutWarnings(response)).toEqual([]);
    engine.rows.stop();
  });

  it('a seeded entry that states no limit still gets the default', async () => {
    const { engine, cache } = await world();
    await seed(cache, 'people/unbounded', all);
    expect(rowsOf(await replay(engine, 'people/unbounded'))).toBe(5);
    engine.rows.stop();
  });

  it('capAuthored: true clamps it again', async () => {
    const { engine, cache } = await world({ defaultLimit: 5, maxLimit: 8, capAuthored: true });
    await seed(cache, 'people/book', { ...all, limit: 10 });
    const response = await replay(engine, 'people/book');
    expect(rowsOf(response)).toBe(8);
    expect(cutWarnings(response)).toHaveLength(1);
    engine.rows.stop();
  });

  it('a reactive entry is read with its own limit too', async () => {
    const { engine, cache } = await world();
    await seed(cache, 'people/live', { ...all, limit: 10 }, { refresh: 'reactive' });
    expect(rowsOf(await replay(engine, 'people/live'))).toBe(10);
    engine.rows.stop();
  });
});

describe('limits — the same over the durable cache, where an entry is read back from a table', () => {
  it('a seeded entry is still known as seeded, and a generated one still is not', async () => {
    const { engine, cache } = await world(undefined, { ...all, limit: 10 }, true);
    await seed(cache, 'people/book', { ...all, limit: 10 });
    expect(rowsOf(await replay(engine, 'people/book'))).toBe(10);

    const generated = pinOf(await engine.execute({ intent: 'everybody', shape, context: {} }));
    await handleFingerprintPatch({ engine }, generated, { protected: true });
    expect(rowsOf(await replay(engine, generated))).toBe(8);
    engine.rows.stop();
  });
});

describe('limits — a generated query stays under maxLimit, however it is stored', () => {
  const big: Query = { ...all, limit: 10 };
  const ask = { intent: 'everybody', shape, context: {} };

  it('fresh, under a minted fingerprint, and replayed from it', async () => {
    const { engine } = await world(undefined, big);
    const first = await engine.execute(ask);
    expect(rowsOf(first)).toBe(8);
    expect(rowsOf(await replay(engine, pinOf(first)))).toBe(8);
    engine.rows.stop();
  });

  it('into a slot the caller named', async () => {
    const { engine } = await world(undefined, big);
    expect(rowsOf(await engine.execute({ ...ask, fingerprint: 'mine/slot' }))).toBe(8);
    expect(rowsOf(await replay(engine, 'mine/slot'))).toBe(8);
    engine.rows.stop();
  });

  it('protected afterwards — the one field a wire call can change', async () => {
    const { engine } = await world(undefined, big);
    const fingerprint = pinOf(await engine.execute(ask));
    expect((await handleFingerprintPatch({ engine }, fingerprint, { protected: true })).status).toBe(200);
    expect(rowsOf(await replay(engine, fingerprint))).toBe(8);
    engine.rows.stop();
  });

  it('a request that carries `protected` and `requestHash` itself changes nothing', async () => {
    const { engine } = await world(undefined, big);
    const fingerprint = pinOf(await engine.execute(ask));
    const forged = { fingerprint, context: {}, protected: true, requestHash: null, kind: 'ok' };
    expect(rowsOf(await engine.execute(forged))).toBe(8);
    expect(rowsOf(await replay(engine, fingerprint))).toBe(8);
    engine.rows.stop();
  });

  it('a row the host stored itself, protected and with no request hash, is the host\'s as a seeded one is', async () => {
    const { engine, cache } = await world();
    await cache.set('host/stored', { kind: 'ok', dsl: big, shape, createdAt: Date.now(), protected: true });
    expect(rowsOf(await replay(engine, 'host/stored'))).toBe(10);
    engine.rows.stop();
  });

  it('a stored row with no request hash that nobody protected', async () => {
    const { engine, cache } = await world();
    await cache.set('legacy/row', { kind: 'ok', dsl: big, shape, createdAt: Date.now() });
    expect(rowsOf(await replay(engine, 'legacy/row'))).toBe(8);
    engine.rows.stop();
  });

  it('a seeded entry somebody unprotected is clamped until it is seeded again', async () => {
    const { engine, cache } = await world();
    await seed(cache, 'people/book', big);
    await handleFingerprintPatch({ engine }, 'people/book', { protected: false });
    expect(rowsOf(await replay(engine, 'people/book'))).toBe(8);
    await seed(cache, 'people/book', big);
    expect(rowsOf(await replay(engine, 'people/book'))).toBe(10);
    engine.rows.stop();
  });

  it('compile(), which no stored entry stands behind, clamps as it did', async () => {
    const { engine } = await world();
    expect(engine.compile(big).sql).toMatch(/LIMIT 8$/);
    expect(engine.compile(all).sql).toMatch(/LIMIT 5$/);
    engine.rows.stop();
  });
});

describe('limits — the reply says when the engine\'s number may have ended the list', () => {
  it('the default cut a list that stated no limit', async () => {
    const { engine, cache } = await world();
    await seed(cache, 'people/unbounded', all);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await replay(engine, 'people/unbounded');
    expect(cutWarnings(response)).toEqual(["This list states no limit, so it ran with the engine's defaultLimit of 5, and exactly 5 rows came back — it may have been cut. State a `limit`."]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[vex] "people/unbounded": This list states no limit'));
    engine.rows.stop();
  });

  it('the maximum cut a generated one, and the line names both numbers', async () => {
    const { engine } = await world(undefined, { ...all, limit: 10 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await engine.execute({ intent: 'everybody', shape, context: {} });
    expect(cutWarnings(response)).toEqual(["This query asks for 10 rows, the engine's maxLimit is 8, and exactly 8 came back — the list may have been cut. Raise `maxLimit` to read more."]);
    engine.rows.stop();
  });

  it('says nothing when the author\'s own limit ended the list', async () => {
    const { engine, cache } = await world();
    await seed(cache, 'people/five', { ...all, limit: 5 });
    await seed(cache, 'people/three', { ...all, limit: 3 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Five rows, and five is the default — but the author asked for five.
    expect(cutWarnings(await replay(engine, 'people/five'))).toEqual([]);
    expect(cutWarnings(await replay(engine, 'people/three'))).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    engine.rows.stop();
  });

  it('says nothing when fewer rows came back than the engine\'s number', async () => {
    const { engine, cache } = await world({ defaultLimit: 50, maxLimit: 80 });
    await seed(cache, 'people/unbounded', all);
    const response = await replay(engine, 'people/unbounded');
    expect(rowsOf(response)).toBe(PEOPLE);
    expect(cutWarnings(response)).toEqual([]);
    engine.rows.stop();
  });

  it('says nothing for a single-row answer, which uses one row and cannot be cut', async () => {
    const { engine, cache } = await world({ defaultLimit: 1, maxLimit: 8 });
    await seed(cache, 'people/first', all, { shape: { id: 0 } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await replay(engine, 'people/first');
    expect(response.result).toEqual({ id: 1 });
    expect(cutWarnings(response)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    engine.rows.stop();
  });

  it('the console hears it once per entry; the reply says it every time', async () => {
    const { engine, cache } = await world();
    await seed(cache, 'people/unbounded', all);
    await seed(cache, 'people/also', all);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(cutWarnings(await replay(engine, 'people/unbounded'))).toHaveLength(1);
    expect(cutWarnings(await replay(engine, 'people/unbounded'))).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    await replay(engine, 'people/also');
    expect(warn).toHaveBeenCalledTimes(2);
    engine.rows.stop();
  });

  it('a query nobody named is told in its reply and not on the console', async () => {
    const { engine } = await world();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await engine.execute({ intent: 'everybody', shape, context: {} });
    expect(cutWarnings(response)).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    engine.rows.stop();
  });

  it('a followed list says so when it grows to the engine\'s number, and stops when it shrinks', async () => {
    const { engine, cache, db } = await world({ defaultLimit: 14, maxLimit: 80 });
    await seed(cache, 'people/live', all, { refresh: 'reactive' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const answers: QueryResponse[] = [];
    const following = new AbortController();
    const first = await engine.execute({ fingerprint: 'people/live', context: {} }, { signal: following.signal, onChange: (next) => answers.push(next) });
    expect(rowsOf(first)).toBe(PEOPLE);
    expect(cutWarnings(first)).toEqual([]);

    await db.exec(`INSERT INTO people (name) VALUES ('P13'), ('P14'), ('P15')`);
    engine.invalidate(['people']);
    await vi.waitFor(() => expect(answers).toHaveLength(1));
    const grown = answers[0];
    if (grown === undefined) throw new Error('no answer followed the insert');
    expect(rowsOf(grown)).toBe(14);
    expect(cutWarnings(grown)).toHaveLength(1);

    await db.exec(`DELETE FROM people WHERE id > 6`);
    engine.invalidate(['people']);
    await vi.waitFor(() => expect(answers).toHaveLength(2));
    const shrunk = answers[1];
    if (shrunk === undefined) throw new Error('no answer followed the delete');
    expect(rowsOf(shrunk)).toBe(6);
    expect(cutWarnings(shrunk)).toEqual([]);
    following.abort();
    engine.rows.stop();
  });
});
