import { createPostgresAdapter } from '@niscorp/vex';
import type { PgPool } from '@niscorp/vex';
import { migrate } from '@niscorp/strata/postgres';
import { MOSS_SEQUENCE } from '../src/data';
import { createOwnEntries } from '../src/data/own-entries';
import type { Replay } from '../src/data/own-entries';
import { REGISTRY_ENTRIES, REGISTRY_TABLES } from '../src/integrations/entries';

// THE REGISTRY'S ENTRIES OVER A REAL DATABASE, for the tests that already
// start one: moss's tables through the ledger, then the entries seeded and
// replayed the way a server replays them for the feature (../src/data,
// own-entries.ts), with no server.
export const registryOver = async (pool: PgPool): Promise<Replay> => {
  await migrate(pool, [MOSS_SEQUENCE]);
  const adapter = createPostgresAdapter({ pool });
  const schema = await adapter.introspect();
  return createOwnEntries({ adapter, schema, db: pool, engine: { invalidate: () => undefined } })({ entries: REGISTRY_ENTRIES, tables: REGISTRY_TABLES });
};
