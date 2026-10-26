import { PGlite } from '@electric-sql/pglite';
import { createPostgresCache } from '@niscorp/vex';
import { createPgPool, RAW_DATE_PARSERS as PG_RAW_DATES } from '@niscorp/vex/pg';
import { createPglitePool, RAW_DATE_PARSERS } from '@niscorp/vex/pglite';
import type { NiscRuntime } from '@niscorp/moss';
import pg from 'pg';
import { APP_SEQUENCE } from '../db/schema';

export type Runtime = NiscRuntime & { close: () => Promise<void> };

const STATEMENT_TIMEOUT_MS = 10_000;

// Two pools over one database: app queries get raw date strings (Prism
// formats them), the cache keeps Dates.
const postgres = async (url: string): Promise<Runtime> => {
  const pool = new pg.Pool({ connectionString: url, max: 10, statement_timeout: STATEMENT_TIMEOUT_MS });
  const cache = createPostgresCache({ pool: createPgPool(pool) });
  await cache.init();
  const app = createPgPool(pool, PG_RAW_DATES);
  return { db: app, pool: app, cache, session: 'sessions', tables: [APP_SEQUENCE], close: () => pool.end() };
};

const pglite = async (): Promise<Runtime> => {
  const db = new PGlite();
  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init();
  return { db, pool: createPglitePool(db, RAW_DATE_PARSERS), cache, session: 'sessions', tables: [APP_SEQUENCE], close: () => db.close() };
};

// A database URL: Postgres. None: an in-memory PGlite, gone when the process ends. Moss applies the tables at boot.
export const runtime = async (databaseUrl: string): Promise<Runtime> => (databaseUrl === '' ? pglite() : postgres(databaseUrl));
