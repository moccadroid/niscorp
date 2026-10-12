import { PGlite } from '@electric-sql/pglite';
import { createPostgresCache } from '@niscorp/vex';
import { createPglitePool, RAW_DATE_PARSERS } from '@niscorp/vex/pglite';
import type { NiscRuntime } from '@niscorp/moss';

export const runtime = async (): Promise<NiscRuntime> => {
  const db = new PGlite();
  // Two pools over one database: app queries get raw date strings (Prism
  // formats them), the cache keeps Dates.
  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init();
  return { db, pool: createPglitePool(db, RAW_DATE_PARSERS), cache, session: 'sessions' };
};
