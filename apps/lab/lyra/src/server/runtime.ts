import { PGlite } from '@electric-sql/pglite';
import { createPostgresCache } from '@niscorp/vex';
import { createPglitePool, RAW_DATE_PARSERS } from '@niscorp/vex/pglite';
import type { NiscRuntime } from '@niscorp/moss';
import { TIDE_DDL } from '@niscorp/tide/postgres';
import { DDL } from '@lyra/db/schema';
import { TIDE_MIRROR_DDL } from '@lyra/db/tide-mirror';
import { buildSeedSql } from '@lyra/db/seed';

export type DevRuntime = NiscRuntime & { db: PGlite };

export const devRuntime = async (): Promise<DevRuntime> => {
  const db = new PGlite();
  await db.exec(DDL);
  // The tide tables and the run-mirror trigger are schema like everything
  // else — applied here by the database builder, in dependency order, never
  // created imperatively at boot.
  await db.exec(TIDE_DDL);
  await db.exec(TIDE_MIRROR_DDL);
  await db.exec(buildSeedSql());

  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init();

  const operatorKey = process.env['OPERATOR_KEY'] ?? '';

  return {
    db,
    pool: createPglitePool(db, RAW_DATE_PARSERS),
    cache,
    // A dev floor over an in-memory database: every token is trusted, and
    // moss says so at boot. The honest label for what this always was.
    session: 'dev-open',
    ...(operatorKey === '' ? {} : { operatorKey }),
  };
};
