import { PGlite } from '@electric-sql/pglite';
import { createPostgresCache } from '@niscorp/vex';
import { createPglitePool, RAW_DATE_PARSERS } from '@niscorp/vex/pglite';
import type { NiscRuntime } from '@niscorp/moss';
import { DDL } from '@lyra/db/schema';
import { buildSeedSql } from '@lyra/db/seed';

// The dev ENVIRONMENT (D2) — a NiscRuntime over PGlite: schema, demo rows, and
// nothing else. The API surface is declared once in the manifest's `entries`
// and seeded into vex_cache by whoever stands up an engine over this runtime.
//
// Swapping this for Cloud SQL is one object: `PgPool` is `{ query(text, values) }`
// and nothing above this file knows which implementation answered.
export type DevRuntime = NiscRuntime & { db: PGlite };

export const devRuntime = async (): Promise<DevRuntime> => {
  const db = new PGlite();
  await db.exec(DDL);
  await db.exec(buildSeedSql());

  // App queries get raw date strings (Prism formats them); the cache keeps
  // Dates, because it calls getTime() on its own timestamps. One database,
  // two pools.
  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init();

  // THE OPERATOR KEY, from the environment on both sides of the seam. Absent
  // and the seam does not exist — which is the right default for a lab, and the
  // right default for a deployment that has not decided who administers it.
  const operatorKey = process.env['OPERATOR_KEY'] ?? '';
  return { db, pool: createPglitePool(db, RAW_DATE_PARSERS), cache, ...(operatorKey === '' ? {} : { operatorKey }) };
};
