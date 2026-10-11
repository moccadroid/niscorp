import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { STORE_CONTRACT } from '../src/testing';
import { createTideStore, TIDE_TABLES } from '../src/store/postgres';
import type { TidePool } from '../src/store/postgres';
import { oneDatabase, pglitePool } from './support';

// THE SAME CHECKS THE MEMORY STORE RUNS, against a real database.
//
// This is the file whose absence let the last SQL store diverge in eleven
// ways: LIMIT applied before the serial filter, `total` counted from the
// input array rather than the rows written, a dedupe index that outlived its
// rows, list reads answering opposite ends of the same list. Its header
// claimed it was "held to the same tests" and there were none, so every one
// of those was invisible to CI.
//
// `STORE_CONTRACT` is the list `store.test.ts` runs against the memory store,
// so there is one definition of the contract and not two readings of a
// comment.

// One database for the file, emptied before each store is made (./support.ts
// says why: a database for each test was 45 starts, and most of the suite).
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

// The same contract over a pool whose transaction hands its client through as
// it is: `query` is a method there, and it needs its receiver — the shape of a
// checked-out `pg` client. The store took `query` off the transaction once,
// and on such a pool every transaction failed inside the driver.
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

// TWO INSTANCES, ONE SERIAL GROUP. `onePer` promises at most one held row for a
// group, counting what somebody else already holds. The store asked whether the
// group was held and then claimed, as two statements, and another instance's
// two could run between them: both asked, both were told nothing was held, and
// each took a row. Two tasks of a serial reflex ran at once.
//
// Two stores over one database are two instances: their statements interleave
// at every await, as two processes' do.
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
    // And the group is not stuck: once that task is done, the next is claimable.
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

// That they are ordinary tables to a host (introspected, grantable, scopeable)
// is the host's to prove: moss does, in its test/tide-tables.test.ts.
describe('the engine tables are not application data', () => {
  // The one case that is about a database with no table of tide's in it, so
  // the one that starts a database of its own. It starts in a hook: the start
  // is the slow part, and it is not what the case is timed for.
  const empty: { db?: PGlite } = {};
  beforeAll(async () => {
    empty.db = new PGlite();
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
    // Twice, because a boot that has already run must not be a boot that
    // fails — every statement in the DDL is IF NOT EXISTS for this reason.
    await createTideStore(pool).ready;
    const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const names = tables.rows.map((row) => String(row['table_name']));
    for (const table of TIDE_TABLES) expect(names).toContain(table);
  });
});
