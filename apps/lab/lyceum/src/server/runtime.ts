import { PGlite } from '@electric-sql/pglite';
import { createPostgresCache } from '@niscorp/vex';
import { createPglitePool, RAW_DATE_PARSERS } from '@niscorp/vex/pglite';
import type { NiscRuntime } from '@niscorp/moss';
import { DDL } from '@lyceum/db/schema';
import { buildSeedSql } from '@lyceum/db/seed';

// The DEVELOPMENT environment: an in-memory PGlite, reset on every boot, for
// `pnpm dev` and the checks. The talk itself runs on Postgres
// (./postgres-runtime.ts) — the manifest does not change, only the environment.
//
// Sessions are the real credential even here: 256-bit, hashed at rest,
// expiring. Stepping in mints one; nothing in lyceum trusts a token because it
// is well-formed.
// What every lyceum environment hands the boot: moss's runtime, and a way to
// let go of the database when the process is done.
export type LyceumRuntime = NiscRuntime & { close: () => Promise<void> };

export type DevRuntime = LyceumRuntime & { db: PGlite };

export const devRuntime = async (): Promise<DevRuntime> => {
  const db = new PGlite();
  await db.exec(DDL);
  await db.exec(buildSeedSql());

  // Two pools over one database: app reads get raw date strings; the cache
  // keeps Dates, because it calls getTime() on its own timestamps.
  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init();

  return {
    db,
    pool: createPglitePool(db, RAW_DATE_PARSERS),
    cache,
    session: 'sessions',
    close: () => db.close(),
  };
};
