import pg from 'pg';
import { createMemoryCache, createPostgresCache, createTieredCache } from '@niscorp/vex';
import { migrate } from '@niscorp/strata/postgres';
import { LYCEUM_SEQUENCES } from '@lyceum/db/schema';
import { buildSeedSql } from '@lyceum/db/seed';
import { createPgPool, RAW_DATE_PARSERS } from './pg';
import type { LyceumRuntime } from './runtime';

const STATEMENT_TIMEOUT_MS = 5_000;

export const postgresRuntime = async (databaseUrl: string): Promise<LyceumRuntime> => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10, statement_timeout: STATEMENT_TIMEOUT_MS });
  await migrate(createPgPool(pool), [...LYCEUM_SEQUENCES]);
  await pool.query(buildSeedSql());

  const app = createPgPool(pool, RAW_DATE_PARSERS);
  // One process only: a second replica would keep its own memory.
  const cache = createTieredCache({ l1: createMemoryCache(), l2: createPostgresCache({ pool: createPgPool(pool) }) });
  await cache.init();

  return {
    pool: app,
    db: app,
    cache,
    session: 'sessions',
    close: () => pool.end(),
  };
};
