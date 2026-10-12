import { createPostgresAdapter } from '@niscorp/vex';
import type { PgPool } from '@niscorp/vex';
import { migrate } from '@niscorp/strata/postgres';
import { MOSS_SEQUENCE } from '../src/data';
import { createOwnEntries } from '../src/data/own-entries';
import type { Replay } from '../src/data/own-entries';
import { REGISTRY_ENTRIES, REGISTRY_TABLES } from '../src/integrations/entries';

export const registryOver = async (pool: PgPool, db: PgPool = pool): Promise<Replay> => {
  await migrate(pool, [MOSS_SEQUENCE]);
  const adapter = createPostgresAdapter({ pool });
  return createOwnEntries({ adapter, db, engine: { invalidate: () => undefined } })({ owner: 'the feature "integrations"', entries: REGISTRY_ENTRIES, tables: REGISTRY_TABLES });
};

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
