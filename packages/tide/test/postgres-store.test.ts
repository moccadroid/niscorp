import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { STORE_CONTRACT } from '../src/testing';
import { createTideStore, TIDE_TABLES } from '../src/store/postgres';
import type { TidePool } from '../src/store/postgres';
import { pglitePool } from './support';

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

const freshStore = async () => {
  const db = new PGlite();
  const store = createTideStore(pglitePool(db));
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
  const db = new PGlite();
  const pool = pglitePool(db);
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

// That they are ordinary tables to a host (introspected, grantable, scopeable)
// is the host's to prove: moss does, in its test/tide-tables.test.ts.
describe('the engine tables are not application data', () => {
  it('a store creates its own schema, idempotently', async () => {
    const db = new PGlite();
    const pool = pglitePool(db);
    await createTideStore(pool).ready;
    // Twice, because a boot that has already run must not be a boot that
    // fails — every statement in the DDL is IF NOT EXISTS for this reason.
    await createTideStore(pool).ready;
    const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const names = tables.rows.map((row) => String(row['table_name']));
    for (const table of TIDE_TABLES) expect(names).toContain(table);
  });
});
