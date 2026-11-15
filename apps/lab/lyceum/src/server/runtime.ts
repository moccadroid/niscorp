import { PGlite } from '@electric-sql/pglite';
import { createMemoryCache, createPostgresCache, createTieredCache } from '@niscorp/vex';
import { createPglitePool, RAW_DATE_PARSERS } from '@niscorp/vex/pglite';
import type { NiscRuntime } from '@niscorp/moss';
import { LYCEUM_SEQUENCES } from '@lyceum/db/schema';
import { buildSeedSql } from '@lyceum/db/seed';

// `seed` writes what the code says the talk is; the boot calls it once the server has the tables.
export type LyceumRuntime = NiscRuntime & { seed: () => Promise<void>; close: () => Promise<void> };

export type DevRuntime = LyceumRuntime & { db: PGlite };

export const openDevDatabase = (): PGlite => new PGlite();

export const devRuntime = async (borrowed?: PGlite): Promise<DevRuntime> => {
  const db = borrowed ?? openDevDatabase();
  return {
    db,
    pool: createPglitePool(db, RAW_DATE_PARSERS),
    cache: createTieredCache({ l1: createMemoryCache(), l2: createPostgresCache({ pool: createPglitePool(db) }) }),
    session: 'sessions',
    tables: [...LYCEUM_SEQUENCES],
    // In memory, empty at every start: migrated at boot. Postgres is migrated by `nisc migrate`.
    migrations: 'apply',
    seed: async () => {
      await db.exec(buildSeedSql());
    },
    close: async () => {
      if (borrowed === undefined && !db.closed) await db.close();
    },
  };
};
