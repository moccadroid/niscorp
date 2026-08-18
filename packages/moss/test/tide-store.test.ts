import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import { STORE_CONTRACT } from '@niscorp/tide/testing';
import { createTideStore, TIDE_TABLES } from '../src/tide';
import { createDataLayer } from '../src/data';

// THE SAME CHECKS THE MEMORY STORE RUNS, against a real database.
//
// This is the file whose absence let the last SQL store diverge in eleven
// ways: LIMIT applied before the serial filter, `total` counted from the
// input array rather than the rows written, a dedupe index that outlived its
// rows, list reads answering opposite ends of the same list. Its header
// claimed it was "held to the same tests" and there were none, so every one
// of those was invisible to CI.
//
// `STORE_CONTRACT` is imported from tide rather than restated here, so there
// is one definition of the contract and not two readings of a comment.

const freshStore = async () => {
  const db = new PGlite();
  const store = createTideStore(createPglitePool(db));
  await store.ready;
  return store;
};

describe('the store contract — postgres, via vex', () => {
  for (const check of STORE_CONTRACT)
    it(check.name, async () => {
      await check.run(await freshStore());
    });
});

describe('the engine tables are not application data', () => {
  it('a store creates its own schema, idempotently', async () => {
    const db = new PGlite();
    const pool = createPglitePool(db);
    await createTideStore(pool).ready;
    // Twice, because a boot that has already run must not be a boot that
    // fails — every statement in the DDL is IF NOT EXISTS for this reason.
    await createTideStore(pool).ready;
    const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const names = tables.rows.map((row) => String(row['table_name']));
    for (const table of TIDE_TABLES) expect(names).toContain(table);
  });

  it('and they are ordinary tables — introspected, grantable, scopeable', async () => {
    const db = new PGlite();
    const pool = createPglitePool(db);
    await createTideStore(pool).ready;
    await pool.query('CREATE TABLE IF NOT EXISTS members (id text PRIMARY KEY, name text)');

    const layer = await createDataLayer({ pool, db: pool, session: 'dev-open' });

    // An authored, scoped entry over the run ledger has to compile against a
    // table vex has heard of, so hiding them would close the door as well as
    // the hole. What keeps a grant safe here is what keeps every other grant
    // safe: the host's scope rule.
    expect(layer.schema.entities.map((entity) => entity.table)).toContain('tide_run');
    expect(layer.grants).toContain('tide_run.read');

    // The identity a run declared IS the column a host scopes on, so it has
    // to survive introspection as a real field.
    const runEntity = layer.schema.entities.find((entity) => entity.table === 'tide_run');
    expect(runEntity?.fields.map((field) => field.name)).toContain('as_who');
  });
});
