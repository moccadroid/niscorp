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
import { createQueryDsl, createShapeMapper } from '@niscorp/vex/agent';
import type { SignalClient } from '@niscorp/cortex';
import { getKey, createGroqClient } from '../llm/groq';
import { buildCacheSeed } from '@relay/api';

// ═══════════════════════════════════════════════════════════
// Relay runtime — a real @niscorp/vex engine over an in-browser PGlite
// (Postgres-in-WASM). No server. Setup only.
//
// At boot the DB is seeded three ways: the schema (DDL), the demo data, and the
// CACHE — the prewarmed entries from `@relay/api`, compiled to SQL and inserted
// straight into Vex's own `vex_cache` table under named, protected fingerprints.
// After that the cache just exists in the DB; every predefined read replays its
// entry by fingerprint through the deterministic pipeline (scope → SQL →
// execute → Prism map) with no LLM.
//
// The engine ALSO carries the LLM hooks (generateDsl / mapToShape, built from the
// stored Groq key below) so a NOVEL shape — Ray asking a question no screen
// prewarmed — is a cache miss that runs Vex's query + mapping agents, then caches.
// The warm reads never touch them; only Ray's ad-hoc queries do.
//
// Memoized; the first caller boots + seeds.
// ═══════════════════════════════════════════════════════════

export type VexRuntime = {
  db: PGlite;
  engine: QueryEngine;
};

// The LLM, rebuilt from the stored Groq key on every call — so a key set or
// changed mid-session is picked up, and a key-less call throws a readable error.
// The warm cache reads never reach here; only a novel shape (a cache miss) does.
const buildLlm = (): SignalClient => {
  const key = getKey();
  if (key === undefined) throw new Error('Set a Groq key (🔑) before reading data.');
  return createGroqClient(key);
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

  // The DSL JSON Schema is static (z.toJSONSchema(QuerySchema)); a throwaway
  // probe yields it without touching the DB. The generateDsl hook needs it up
  // front; the live schema arrives per call from the engine.
  const dslJsonSchema = createQueryEngine({ adapter }).getDslSchema();

  const engine = createQueryEngine({
    adapter,
    scope: scopePolicy,
    cache,
    // Vex's reference agents — the query agent (intent + shape → DSL) and Prism's
    // mapping agent (rows → shape) — each handed an LLM rebuilt per call. The
    // engine passes the live schema; only a cache miss invokes them.
    generateDsl: (request, schema) =>
      createQueryDsl({ adapter, llm: buildLlm(), scopePolicy, schema, queryJsonSchema: dslJsonSchema })(request, schema),
    mapToShape: (rows, shape) => createShapeMapper(buildLlm())(rows, shape),
  });
  await engine.introspect();

  return { db, engine };
};

let runtimePromise: Promise<VexRuntime> | undefined;

export const getVexRuntime = (): Promise<VexRuntime> => {
  runtimePromise ??= boot();
  return runtimePromise;
};

// "Now" for the app, as a date (YYYY-MM-DD), computed per call — never a
// frozen constant. The seed generates its dataset relative to the same day
// (see seed.ts `TODAY`), so overdue/today/upcoming stay coherent with the
// wall clock. Injected into request sources as `$.today`.
export const todayStr = (): string => new Date().toISOString().slice(0, 10);
