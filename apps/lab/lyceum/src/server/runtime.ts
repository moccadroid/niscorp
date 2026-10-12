import { PGlite } from '@electric-sql/pglite';
import { createMemoryCache, createPostgresCache, createTieredCache } from '@niscorp/vex';
import { createPglitePool, RAW_DATE_PARSERS } from '@niscorp/vex/pglite';
import type { NiscRuntime } from '@niscorp/moss';
import { migrate } from '@niscorp/strata/postgres';
import { LYCEUM_SEQUENCES } from '@lyceum/db/schema';
import { buildSeedSql } from '@lyceum/db/seed';

export type LyceumRuntime = NiscRuntime & { close: () => Promise<void> };

export type DevRuntime = LyceumRuntime & { db: PGlite };

export const openDevDatabase = (): PGlite => new PGlite();

export const devRuntime = async (borrowed?: PGlite): Promise<DevRuntime> => {
  const db = borrowed ?? openDevDatabase();
  await migrate(createPglitePool(db), [...LYCEUM_SEQUENCES]);
  await db.exec(buildSeedSql());

  const cache = createTieredCache({ l1: createMemoryCache(), l2: createPostgresCache({ pool: createPglitePool(db) }) });
  await cache.init();

  return {
    db,
    pool: createPglitePool(db, RAW_DATE_PARSERS),
    cache,
    session: 'sessions',
    close: async () => {
      if (borrowed === undefined && !db.closed) await db.close();
    },
  };
};
