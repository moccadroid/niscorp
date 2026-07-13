import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { createQueryEngine, createPostgresAdapter, createPostgresCache } from '@niscorp/vex';
import type { QueryEngine } from '@niscorp/vex';
import { DDL } from './schema';
import { buildSeedSql, TODAY_ISO } from './seed';
import { createPglitePool, RAW_DATE_PARSERS } from './pool';
import { scopePolicy } from './scope';
import { buildCacheSeed } from '@fable/api';

// ═══════════════════════════════════════════════════════════
// Fable runtime — a real @niscorp/vex engine over an in-browser PGlite
// (Postgres-in-WASM). No server. Setup only.
//
// At boot the DB is seeded three ways: the schema (DDL), the demo data, and
// the CACHE — the prewarmed entries from `@fable/api`, compiled to SQL and
// inserted straight into Vex's own `vex_cache` table under named, protected
// fingerprints. After that the cache just exists in the DB; every predefined
// read replays its entry by fingerprint through the deterministic pipeline
// (scope → SQL → execute → Prism map).
//
// The engine is WARM-ONLY: no generateDsl / mapToShape hooks (D3). An unknown
// fingerprint is a cache miss that throws — a discipline lint, not a feature gap.
//
// Memoized; the first caller boots + seeds.
// ═══════════════════════════════════════════════════════════

export type VexRuntime = {
  db: PGlite;
  engine: QueryEngine;
};

const boot = async (): Promise<VexRuntime> => {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(DDL);
  await db.exec(buildSeedSql());

  // App queries get raw date strings (Prism formats them); the cache keeps
  // Dates (it calls .getTime() on its own timestamps). Same db, two pools.
  const adapter = createPostgresAdapter({ pool: createPglitePool(db, RAW_DATE_PARSERS) });
  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init(); // migration: CREATE TABLE vex_cache

  // Seed the cache from the API entries (compile each mapping → prism_ir,
  // INSERT into vex_cache). The cache is now warm DB data.
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

// "Now" for the app, as a date. The seed is deterministic around a FIXED
// reference day, so date-relative reads (overdue, due today) compare against
// that same day, never the wall clock. The shell injects it as `$.today`.
export const CURRENT_DATE = TODAY_ISO;
