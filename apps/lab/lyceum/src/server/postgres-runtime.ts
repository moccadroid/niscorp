import pg from 'pg';
import { createPostgresCache } from '@niscorp/vex';
import { DDL } from '@lyceum/db/schema';
import { buildSeedSql } from '@lyceum/db/seed';
import { createPgPool, RAW_DATE_PARSERS } from './pg';
import type { LyceumRuntime } from './runtime';

// THE DEPLOYED ENVIRONMENT: Postgres, which outlives the process. A restart
// keeps the room, the deck's position and every session — the talk depends on
// it (PLAN.md, D2). Schema and seed are idempotent, so every boot runs them:
// an empty database is stood up, a live one is left alone.

// A statement that runs longer than this is a bug on a stage, not a workload.
const STATEMENT_TIMEOUT_MS = 5_000;

export const postgresRuntime = async (databaseUrl: string): Promise<LyceumRuntime> => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10, statement_timeout: STATEMENT_TIMEOUT_MS });
  await pool.query(DDL);
  await pool.query(buildSeedSql());

  // One pool, two readings of it: app reads get raw date strings, the vex
  // cache keeps Dates (see ./pg.ts).
  const app = createPgPool(pool, RAW_DATE_PARSERS);
  const cache = createPostgresCache({ pool: createPgPool(pool) });
  await cache.init();

  return {
    pool: app,
    db: app,
    cache,
    session: 'sessions',
    close: () => pool.end(),
  };
};
