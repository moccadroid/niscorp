import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { STORE_CONTRACT } from '../src/testing';
import { createTideStore, TIDE_TABLES } from '../src/store/postgres';
import type { TidePool } from '../src/store/postgres';
import { initialisedDirectory } from './initialised-database';
import { oneDatabase, pglitePool } from './support';

const database = oneDatabase();

const freshStore = async () => {
  const { pool } = await database.emptied();
  const store = createTideStore(pool);
  await store.ready;
  return store;
};

describe('the store contract — postgres', () => {
  for (const check of STORE_CONTRACT)
    it(check.name, async () => {
      await check.run(await freshStore());
    });
});

// `query` is a method that needs its receiver, as on a checked-out `pg` client.
const storeOverClient = async () => {
  const { db, pool } = await database.emptied();
  const clientOver = (inner: { query: TidePool['query'] }) => ({
    inner,
    query(this: { inner: { query: TidePool['query'] } }, text: string, values?: unknown[]) {
      return this.inner.query(text, values);
    },
  });
  const store = createTideStore({
    query: (text, values) => pool.query(text, values),
    transaction: (fn) => db.transaction((tx) => fn(clientOver({ query: (text, values) => tx.query(text, values) }))),
  });
  await store.ready;
  return store;
};

describe('the store contract — a transaction that hands its client through', () => {
  for (const check of STORE_CONTRACT)
    it(check.name, async () => {
      await check.run(await storeOverClient());
    });
});

describe('a serial group, claimed by two instances at once', () => {
  it('is held by one of them', async () => {
    const { pool } = await database.emptied();
    const one = createTideStore(pool);
    const other = createTideStore(pool);
    await one.appendIfAbsent('run', { id: 'run_1', reflexId: 'serial', version: 'v_0', cause: 'occurrence:1', state: 'fanned', depth: 0, total: 2, done: 0, failed: 0, dueAt: 0, createdAt: 0 });
    for (const unit of ['u1', 'u2'])
      await one.appendIfAbsent('task', { runId: 'run_1', reflexId: 'serial', unit, cause: 'occurrence:1', env: {}, depth: 0, state: 'pending', attempt: 0, claimedUntil: 0, notBefore: 0, createdAt: 0 });

    const claimBy = (store: typeof one, token: string) =>
      store.claim({
        table: 'task',
        where: { state: { in: ['pending', 'retrying'] }, notBefore: { lte: 100 } },
        order: [{ by: 'unit' }],
        limit: 10,
        set: { state: 'claimed', token, claimedUntil: 900 },
        onePer: { column: 'reflexId', held: { state: 'claimed', claimedUntil: { gt: 100 } }, only: ['serial'] },
      });
    const [first, second] = await Promise.all([claimBy(one, 'one'), claimBy(other, 'other')]);

    expect(first.length + second.length).toBe(1);
    expect(await one.query({ table: 'task', where: { state: 'claimed' } })).toHaveLength(1);
    const [held] = [...first, ...second];
    await one.cas('task', held?.id ?? '', { state: 'claimed' }, { state: 'done', claimedUntil: 0 });
    expect(await claimBy(other, 'other')).toHaveLength(1);
  });

  it('inside a transaction of the caller, the claim is part of it', async () => {
    const store = createTideStore((await database.emptied()).pool);
    await store.appendIfAbsent('run', { id: 'run_1', reflexId: 'serial', version: 'v_0', cause: 'occurrence:1', state: 'fanned', depth: 0, total: 1, done: 0, failed: 0, dueAt: 0, createdAt: 0 });
    await store.appendIfAbsent('task', { runId: 'run_1', reflexId: 'serial', unit: 'u1', cause: 'occurrence:1', env: {}, depth: 0, state: 'pending', attempt: 0, claimedUntil: 0, notBefore: 0, createdAt: 0 });

    const undone = store.transact(async (tx) => {
      const claimed = await tx.claim({
        table: 'task',
        where: { state: 'pending' },
        limit: 10,
        set: { state: 'claimed', claimedUntil: 900 },
        onePer: { column: 'reflexId', held: { state: 'claimed', claimedUntil: { gt: 100 } }, only: ['serial'] },
      });
      expect(claimed).toHaveLength(1);
      throw new Error('the caller changed its mind');
    });
    await expect(undone).rejects.toThrow('the caller changed its mind');
    expect(await store.query({ table: 'task', where: { state: 'pending' } })).toHaveLength(1);
  });
});

describe('the engine tables are not application data', () => {
  const empty: { db?: PGlite } = {};
  beforeAll(async () => {
    empty.db = new PGlite({ loadDataDir: initialisedDirectory(inject('initialisedDatabase')) });
    await empty.db.waitReady;
  });
  afterAll(async () => {
    await empty.db?.close();
  });

  it('a store creates its own schema, idempotently', async () => {
    const db = empty.db;
    if (db === undefined) throw new Error('the database of this case was not started');
    const pool = pglitePool(db);
    expect((await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).rows).toEqual([]);
    await createTideStore(pool).ready;
    await createTideStore(pool).ready;
    const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const names = tables.rows.map((row) => String(row['table_name']));
    for (const table of TIDE_TABLES) expect(names).toContain(table);
  });
});
