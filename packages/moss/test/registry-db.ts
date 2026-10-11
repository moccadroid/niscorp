import { createPostgresAdapter } from '@niscorp/vex';
import type { PgPool } from '@niscorp/vex';
import { migrate } from '@niscorp/strata/postgres';
import { MOSS_SEQUENCE } from '../src/data';
import { createOwnEntries } from '../src/data/own-entries';
import type { Replay } from '../src/data/own-entries';
import { REGISTRY_ENTRIES, REGISTRY_TABLES } from '../src/integrations/entries';
import { INTEGRATIONS_SEQUENCE } from '../src/integrations/tables';

// THE REGISTRY'S ENTRIES OVER A REAL DATABASE, for the tests that already
// start one: moss's tables and the feature's through the ledger, then the entries seeded and
// replayed the way a server replays them for the feature (../src/data,
// own-entries.ts), with no server. `db` is the client writes are replayed on:
// the pool, unless a test hands one of its own.
export const registryOver = async (pool: PgPool, db: PgPool = pool): Promise<Replay> => {
  await migrate(pool, [MOSS_SEQUENCE, INTEGRATIONS_SEQUENCE]);
  const adapter = createPostgresAdapter({ pool });
  return createOwnEntries({ adapter, db, engine: { invalidate: () => undefined } })({ owner: 'the feature "integrations"', entries: REGISTRY_ENTRIES, tables: REGISTRY_TABLES });
};

// THE SAME DATABASE, THROUGH A CLIENT ON WHICH ONE KIND OF STATEMENT FAILS,
// inside a transaction and outside one: what a write that dies part-way looks
// like to whoever made it.
export const failingAt = (pool: PgPool, statement: RegExp): PgPool => {
  const through =
    (query: PgPool['query']): PgPool['query'] =>
    (text, values) =>
      statement.test(text) ? Promise.reject(new Error('the database went away')) : query(text, values);
  const query = through((text, values) => pool.query(text, values));
  const transact = pool.transaction;
  if (transact === undefined) return { query };
  return { query, transaction: (run) => transact((tx) => run({ query: through((text, values) => tx.query(text, values)) })) };
};
