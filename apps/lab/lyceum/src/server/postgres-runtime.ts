import pg from 'pg';
import { createMemoryCache, createPostgresCache, createTieredCache } from '@niscorp/vex';
import { LYCEUM_SEQUENCES } from '@lyceum/db/schema';
import { buildSeedSql } from '@lyceum/db/seed';
import { createPgPool, RAW_DATE_PARSERS } from './pg';
import type { LyceumRuntime } from './runtime';

const STATEMENT_TIMEOUT_MS = 5_000;

export const postgresRuntime = async (databaseUrl: string): Promise<LyceumRuntime> => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10, statement_timeout: STATEMENT_TIMEOUT_MS });
  const app = createPgPool(pool, RAW_DATE_PARSERS);
  return {
    pool: app,
    db: app,
    // One process only: a second replica would keep its own memory.
    cache: createTieredCache({ l1: createMemoryCache(), l2: createPostgresCache({ pool: createPgPool(pool) }) }),
    session: 'sessions',
    tables: [...LYCEUM_SEQUENCES],
    seed: async () => {
      await pool.query(buildSeedSql());
    },
    close: () => pool.end(),
  };
};
