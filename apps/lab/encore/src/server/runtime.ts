import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { createPostgresCache } from '@niscorp/vex';
import { createPglitePool, RAW_DATE_PARSERS } from '@niscorp/vex/pglite';
import type { NiscRuntime } from '@niscorp/moss';
import { DDL } from '@encore/db/schema';
import { buildSeedSql } from '@encore/db/seed';

export type DevRuntime = NiscRuntime & { db: PGlite };

// NUMERIC and BIGINT arrive from Postgres as strings, and a gauge handed "9000" draws nothing.
const NUMERIC_OID = 1700;
const BIGINT_OID = 20;

export const devRuntime = async (): Promise<DevRuntime> => {
  // vex's `fuzzy` filter needs pg_trgm, which PGlite must load before the DDL can create it.
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(DDL);
  await db.exec(buildSeedSql());

  // The cache gets its own pool: it needs Dates, where app queries get raw date strings.
  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init();

  return {
    db,
    pool: createPglitePool(db, { ...RAW_DATE_PARSERS, [NUMERIC_OID]: Number, [BIGINT_OID]: Number }),
    cache,
    // Every well-formed token is trusted: a dev floor over an in-memory database.
    session: 'dev-open',
  };
};
