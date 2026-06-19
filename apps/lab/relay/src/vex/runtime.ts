import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { fuzzystrmatch } from '@electric-sql/pglite/contrib/fuzzystrmatch';
import { createQueryEngine, createPostgresAdapter, createPostgresCache } from '@niscorp/vex';
import type { QueryEngine } from '@niscorp/vex';
import { DDL } from './schema';
import { buildSeedSql } from './seed';
import { createPglitePool, RAW_DATE_PARSERS } from './pool';
import { scopePolicy } from './scope';
import { buildCacheSeed } from '@relay/api';

// ═══════════════════════════════════════════════════════════
// Relay runtime — a real @niscorp/vex engine over an in-browser PGlite
// (Postgres-in-WASM). No server, no LLM. Setup only.
//
// At boot the DB is seeded three ways: the schema (DDL), the demo data, and the
// CACHE — the prewarmed entries from `@relay/api`, compiled to SQL and inserted
// straight into Vex's own `vex_cache` table. After that the cache just exists in
// the DB; Vex's normal `cache:'use'` serves every read by the deterministic
// pipeline (scope → SQL → execute → Prism map). There is no prewarm routine and
// no generateDsl: a miss would be a genuine "needs the LLM", which v1 never does.
//
// Memoized; the first caller boots + seeds.
// ═══════════════════════════════════════════════════════════

export type VexRuntime = {
  db: PGlite;
  engine: QueryEngine;
};

const boot = async (): Promise<VexRuntime> => {
  const db = new PGlite({ extensions: { vector, pg_trgm, fuzzystrmatch } });
  await db.exec(DDL);
  await db.exec(buildSeedSql());

  // App queries get raw date strings (Prism formats them); the cache keeps Dates
  // (it calls .getTime() on its own timestamps). Same db, two pools.
  const adapter = createPostgresAdapter({ pool: createPglitePool(db, RAW_DATE_PARSERS) });
  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init(); // migration: CREATE TABLE vex_cache

  // Seed the cache from the API entries (compile each mapping → prism_ir, INSERT
  // into vex_cache). The cache is now warm DB data — Vex serves it naturally.
  await db.exec(await buildCacheSeed());

  const engine = createQueryEngine({ adapter, scope: scopePolicy, cache });
  await engine.introspect();

  return { db, engine };
};

let runtimePromise: Promise<VexRuntime> | undefined;

export const getVexRuntime = (): Promise<VexRuntime> => {
  runtimePromise ??= boot();
  return runtimePromise;
};

// The signed-in demo user. v1 is single-identity; this is the value that
// feeds $context.userId for "my …" queries and, later, the scope seam.
export const CURRENT_USER_ID = 'usr_001';

// "Now" for the app, as a date. The seed is deterministic around a FIXED
// reference (see seed.ts `TODAY`), so date-relative reads (overdue tasks) must
// compare against that same day, not the wall clock. Keep this in sync with the
// seed's reference date. The reader injects it as `$.today`.
export const CURRENT_DATE = '2026-06-13';
