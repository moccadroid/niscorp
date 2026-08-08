import { createPostgresAdapter, createPostgresCache, createQueryEngine, scopeGrants, seedCache } from '@niscorp/vex';
import type { QueryEngine, DatabaseSchema, SeedEntry, SeedMutation } from '@niscorp/vex';
import type { NiscRuntime } from './runtime';

// ═══════════════════════════════════════════════════════════════
// The data layer stands up from what's present (DESIGN.md § Derivation
// over configuration): the database's seeded vex_cache IS the API
// surface — nothing generates here — and the grantable set is the
// introspected schema × vex's verb leaves. No table list is ever authored.
// ═══════════════════════════════════════════════════════════════

export type DataLayer = {
  engine: QueryEngine;
  schema: DatabaseSchema;
  // every `<table>.<verb>` grant this schema can carry — the data
  // section's resolution set, and the input to policy compilation
  grants: string[];
};

export const createDataLayer = async (runtime: NiscRuntime, entries: readonly (SeedEntry | SeedMutation)[] = []): Promise<DataLayer> => {
  const adapter = createPostgresAdapter({ pool: runtime.pool });
  const cache = runtime.cache ?? createPostgresCache({ pool: runtime.pool });
  await cache.init?.();
  // The authored API surface lands as protected rows; a db that already
  // carries them is left untouched (idempotent).
  await seedCache(cache, entries);
  const engine = createQueryEngine({ adapter, cache });
  const schema = await engine.introspect();
  return { engine, schema, grants: scopeGrants(schema.entities.map((e) => e.name)) };
};
