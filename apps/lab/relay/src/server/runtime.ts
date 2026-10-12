import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { fuzzystrmatch } from '@electric-sql/pglite/contrib/fuzzystrmatch';
import { createPostgresCache } from '@niscorp/vex';
import type { CacheBackend, CacheEntry } from '@niscorp/vex';
import type { NiscRuntime } from '@niscorp/moss';
import { DDL } from '@relay/db/schema';
import { buildSeedSql } from '@relay/db/seed';
import { createPglitePool, RAW_DATE_PARSERS } from '@niscorp/vex/pglite';

export type DevRuntime = NiscRuntime & { db: PGlite };

// Vex deletes a cache entry whose schema stamp (a hash of the database's entity
// list) differs from the reader's. Moss introspects before it creates
// `moss_generation` and Ray's engine after, so their stamps differ. Dropping the
// stamp is safe only because the database is rebuilt from `DDL` at every boot.
const unstamped = (cache: CacheBackend): CacheBackend => ({
  ...cache,
  set: (key: string, entry: CacheEntry) => {
    const { schemaFingerprint: _stamp, ...rest } = entry;
    return cache.set(key, rest);
  },
});

export const devRuntime = async (): Promise<DevRuntime> => {
  const db = new PGlite({ extensions: { vector, pg_trgm, fuzzystrmatch } });
  await db.exec(DDL);
  await db.exec(buildSeedSql());

  // Two pools on one db: app queries get raw date strings (Prism formats them);
  // the cache needs Dates (it calls .getTime() on its own timestamps).
  const cache = unstamped(createPostgresCache({ pool: createPglitePool(db) }));
  await cache.init?.();

  // 'dev-open': every token is trusted, and moss says so at boot.
  return { db, pool: createPglitePool(db, RAW_DATE_PARSERS), cache, session: 'dev-open' };
};
