import { PGlite } from '@electric-sql/pglite';
import { createMemoryCache, createPostgresCache, createTieredCache } from '@niscorp/vex';
import { createPglitePool, RAW_DATE_PARSERS } from '@niscorp/vex/pglite';
import type { NiscRuntime } from '@niscorp/moss';
import { migrate } from '@niscorp/strata/postgres';
import { LYCEUM_SEQUENCE } from '@lyceum/db/schema';
import { buildSeedSql } from '@lyceum/db/seed';

// The DEVELOPMENT environment: an in-memory PGlite, for `pnpm dev` and the
// checks. A check gets a fresh one per boot. `pnpm dev` opens ONE for the life
// of the process and lends it to every re-boot (vite.config.ts), so an edit
// keeps the room: sessions, members and the deck survive it. The tables go
// through strata's ledger (a borrowed database finds them already applied) and
// the seed converges, so both run again on the borrowed one. The talk itself runs on Postgres
// (./postgres-runtime.ts) — the manifest does not change, only the environment.
//
// Sessions are the real credential even here: 256-bit, hashed at rest,
// expiring. Stepping in mints one; nothing in lyceum trusts a token because it
// is well-formed.
// What every lyceum environment hands the boot: moss's runtime, and a way to
// let go of the database when the process is done.
export type LyceumRuntime = NiscRuntime & { close: () => Promise<void> };

export type DevRuntime = LyceumRuntime & { db: PGlite };

export const openDevDatabase = (): PGlite => new PGlite();

// `borrowed`: a database somebody else opened and will close — the dev server's.
export const devRuntime = async (borrowed?: PGlite): Promise<DevRuntime> => {
  const db = borrowed ?? openDevDatabase();
  await migrate(createPglitePool(db), [LYCEUM_SEQUENCE]);
  await db.exec(buildSeedSql());

  // Two pools over one database: app reads get raw date strings; the cache
  // keeps Dates, because it calls getTime() on its own timestamps. The cache
  // is the deployment's shape — memory in front of the table
  // (./postgres-runtime.ts) — so the checks run what the talk runs.
  const cache = createTieredCache({ l1: createMemoryCache(), l2: createPostgresCache({ pool: createPglitePool(db) }) });
  await cache.init();

  return {
    db,
    pool: createPglitePool(db, RAW_DATE_PARSERS),
    cache,
    session: 'sessions',
    // A borrowed database outlives this runtime; an owned one is closed with
    // it. Safe twice either way.
    close: async () => {
      if (borrowed === undefined && !db.closed) await db.close();
    },
  };
};
