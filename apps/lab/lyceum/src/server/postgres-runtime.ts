import pg from 'pg';
import { createMemoryCache, createPostgresCache, createTieredCache } from '@niscorp/vex';
import { migrate } from '@niscorp/strata/postgres';
import { LYCEUM_SEQUENCE } from '@lyceum/db/schema';
import { buildSeedSql } from '@lyceum/db/seed';
import { createPgPool, RAW_DATE_PARSERS } from './pg';
import type { LyceumRuntime } from './runtime';

// THE DEPLOYED ENVIRONMENT: Postgres, which outlives the process. A restart
// keeps the room, the deck's position and every session — the talk depends on
// it (PLAN.md, D2). The tables go through strata's ledger — applied once and
// recorded; a database from before the ledger adopts on its first boot, rows
// kept (db/schema.ts). The seed converges, so every boot runs it.

// A statement that runs longer than this is a bug on a stage, not a workload.
const STATEMENT_TIMEOUT_MS = 5_000;

export const postgresRuntime = async (databaseUrl: string): Promise<LyceumRuntime> => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10, statement_timeout: STATEMENT_TIMEOUT_MS });
  await migrate(createPgPool(pool), [LYCEUM_SEQUENCE]);
  await pool.query(buildSeedSql());

  // One pool, two readings of it: app reads get raw date strings, the vex
  // cache keeps Dates (see ./pg.ts).
  const app = createPgPool(pool, RAW_DATE_PARSERS);
  // The vex cache in memory, Postgres behind it: every entry is loaded at
  // boot, so a replay looks its entry up in memory rather than asking the
  // database first — 12 of a stage connect's 27 queries. Writes still land in
  // Postgres, off the hot path. One process only: a second replica would keep
  // its own memory (one replica is what lyceum runs).
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
