import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { createPostgresCache } from '@niscorp/vex';
import { createPglitePool, RAW_DATE_PARSERS } from '@niscorp/vex/pglite';
import type { NiscRuntime } from '@niscorp/moss';
import { DDL } from '@encore/db/schema';
import { buildSeedSql } from '@encore/db/seed';

// The dev ENVIRONMENT (D2) — a NiscRuntime over an in-memory PGlite: schema,
// the festival's seed, nothing else. It resets on every boot, which is what a
// demo whose data is fiction wants.
//
// The concrete PGlite rides along so the checks can use raw SQL as ground
// truth against what the shell claims.
export type DevRuntime = NiscRuntime & { db: PGlite };

// NUMERIC (1700) and BIGINT (20) arrive from Postgres as strings, because
// neither fits a JS number in general. Here they are capacities, millimetres
// of rain and a SUM over a few dozen rows, and a gauge handed the string
// "9000" draws nothing. Parsed at the pool, once, so no card and no transform
// has to know.
const NUMERIC_OID = 1700;
const BIGINT_OID = 20;

export const devRuntime = async (): Promise<DevRuntime> => {
  // pg_trgm is what vex's `fuzzy` filter compiles to (`name % $1`). PGlite
  // ships it as a contrib bundle that must be loaded into the instance before
  // the DDL can `CREATE EXTENSION` it.
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(DDL);
  await db.exec(buildSeedSql());

  // Two pools over one database: app queries get raw date strings and real
  // numbers; the cache keeps Dates, because it calls getTime() on its own
  // timestamps.
  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init();

  return {
    db,
    pool: createPglitePool(db, { ...RAW_DATE_PARSERS, [NUMERIC_OID]: Number, [BIGINT_OID]: Number }),
    cache,
    // A dev floor over an in-memory database: every well-formed token is
    // trusted, and moss says so at boot.
    session: 'dev-open',
  };
};
