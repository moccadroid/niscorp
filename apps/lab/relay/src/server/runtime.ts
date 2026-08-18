import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { fuzzystrmatch } from '@electric-sql/pglite/contrib/fuzzystrmatch';
import { createPostgresCache } from '@niscorp/vex';
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

export const devRuntime = async (): Promise<DevRuntime> => {
  const db = new PGlite({ extensions: { vector, pg_trgm, fuzzystrmatch } });
  await db.exec(DDL);
  await db.exec(buildSeedSql());

  // App queries get raw date strings (Prism formats them); the cache keeps
  // Dates (it calls .getTime() on its own timestamps). Same db, two pools.
  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init(); // migration: CREATE TABLE vex_cache

  // A dev floor over an in-memory database: every token is trusted, and
  // moss says so at boot. The honest label for what this always was.
  return { db, pool: createPglitePool(db, RAW_DATE_PARSERS), cache, session: 'dev-open' };
};
