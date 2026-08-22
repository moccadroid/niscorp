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

// ═══════════════════════════════════════════════════════════
// The dev ENVIRONMENT — a NiscRuntime over PGlite: schema + demo rows,
// nothing else. The API surface (vex_cache) is declared once, in the
// manifest's `entries`, and seeded by whoever stands up an engine over
// this runtime (moss's data layer; the dev checks' engine). The concrete
// PGlite rides along for the checks' raw-SQL ground truth.
// ═══════════════════════════════════════════════════════════

export type DevRuntime = NiscRuntime & { db: PGlite };

// ═══════════════════════════════════════════════════════════
// The cache this app hands out, with the SCHEMA STAMP removed on write.
//
// Vex stamps each entry it generates with a hash of the whole database's
// entity list, and refuses — and DELETES — an entry whose stamp does not match
// the reader's own. That check is meant to catch a cached query whose columns
// moved underneath it. It also fires when the two readers merely counted a
// different number of TABLES, which is what happens here: moss introspects
// while standing up its data layer, before it creates `moss_generation`; Ray's
// engine introspects later and sees one more table. Same database, same
// columns, two stamps — so every query the action architect proves is deleted
// by the first live read of the screen built on it.
//
// The app's OWN entries have never carried a stamp (the seed path writes none),
// which is exactly why hand-authored screens have never hit this. Stripping it
// on write puts generated entries on the same footing.
//
// What this gives up: a schema change while the server is running no longer
// invalidates a cached query — it would fail as broken SQL instead of being
// discarded. Unreachable here, because the database is rebuilt from `DDL` at
// every boot, so the schema is fixed for the life of the process. A deployment
// with live migrations wants the stamp back, narrowed to the entities a query
// actually names (vex's `computeSchemaFingerprint`), not this.
// ═══════════════════════════════════════════════════════════
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

  // App queries get raw date strings (Prism formats them); the cache keeps
  // Dates (it calls .getTime() on its own timestamps). Same db, two pools.
  const cache = unstamped(createPostgresCache({ pool: createPglitePool(db) }));
  await cache.init?.(); // migration: CREATE TABLE vex_cache

  // A dev floor over an in-memory database: every token is trusted, and
  // moss says so at boot. The honest label for what this always was.
  return { db, pool: createPglitePool(db, RAW_DATE_PARSERS), cache, session: 'dev-open' };
};
