import { PGlite } from '@electric-sql/pglite';
import { createPostgresCache } from '@niscorp/vex';
import { createPglitePool, RAW_DATE_PARSERS } from '@niscorp/vex/pglite';
import type { NiscRuntime } from '@niscorp/moss';
import { DDL } from '@atrium/db/schema';
import { buildSeedSql } from '@atrium/db/seed';

export type DevRuntime = NiscRuntime & { db: PGlite };

export const devRuntime = async (): Promise<DevRuntime> => {
  const db = new PGlite();
  await db.exec(DDL);
  await db.exec(buildSeedSql());

  // Two pools over one database: app queries get raw date strings (Prism formats
  // them), and the cache keeps Dates because it calls getTime() on its timestamps.
  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init();

  // `operatorKey` has to be on the runtime, not only in the environment: moss mounts its own
  // gate on `/operator/*` ahead of the app's and answers 404 to every path when it is unset.
  return {
    db,
    pool: createPglitePool(db, RAW_DATE_PARSERS),
    cache,
    // A dev floor over an in-memory database: every token is trusted.
    session: 'dev-open',
    ...(process.env['OPERATOR_KEY'] !== undefined && process.env['OPERATOR_KEY'] !== ''
      ? { operatorKey: process.env['OPERATOR_KEY'] }
      : {}),
  };
};
