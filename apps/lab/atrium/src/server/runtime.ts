import { PGlite } from '@electric-sql/pglite';
import { createPostgresCache } from '@niscorp/vex';
import { createPglitePool, RAW_DATE_PARSERS } from '@niscorp/vex/pglite';
import type { NiscRuntime } from '@niscorp/moss';
import { DDL } from '@atrium/db/schema';
import { buildSeedSql } from '@atrium/db/seed';

// The dev ENVIRONMENT (D2) — a NiscRuntime over PGlite: schema, demo rows, and
// one resolve pass so a fresh database boots coherent. Nothing else.
//
// The API surface is declared once in the manifest's `entries` and seeded into
// vex_cache by whoever stands up an engine over this runtime. The concrete
// PGlite rides along so the checks can use raw SQL as ground truth.
export type DevRuntime = NiscRuntime & { db: PGlite };

export const devRuntime = async (): Promise<DevRuntime> => {
  const db = new PGlite();
  await db.exec(DDL);
  await db.exec(buildSeedSql());

  // App queries get raw date strings (Prism formats them); the cache keeps
  // Dates, because it calls getTime() on its own timestamps. One database, two
  // pools.
  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init();

  return { db, pool: createPglitePool(db, RAW_DATE_PARSERS), cache };
};
