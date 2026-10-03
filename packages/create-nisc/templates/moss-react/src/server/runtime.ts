import { PGlite } from '@electric-sql/pglite';
import { createPostgresCache } from '@niscorp/vex';
import { createPglitePool, RAW_DATE_PARSERS } from '@niscorp/vex/pglite';
import type { NiscRuntime } from '@niscorp/moss';

// The environment (D2): what the app is handed to run on. An in-memory Postgres
// (PGlite) — every boot starts empty, which is what development and the checks
// want. A deployment hands moss a real Postgres pool here instead; nothing else
// in the app changes (see PLAN.md).
//
// `sessions`: moss verifies session tokens against its own table. Nobody can
// sign in yet — signing in is an application of its own, the anonymous
// principal's (AGENTS.md rule 12) — so every request is `public` for now.
export const runtime = async (): Promise<NiscRuntime> => {
  const db = new PGlite();
  // App queries get raw date strings (Prism formats them); the cache keeps
  // Dates. One database, two pools.
  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init();
  return { db, pool: createPglitePool(db, RAW_DATE_PARSERS), cache, session: 'sessions' };
};
