import { createPostgresAdapter, createPostgresCache, createQueryEngine, scopeGrants, seedCache } from '@niscorp/vex';
import type { CacheBackend, DatabaseAdapter, DatabaseSchema, PgPool, QueryEngine, QueryEngineConfig, SeedEntry, SeedMutation } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// The data layer stands up from what's present (DESIGN.md § Derivation
// over configuration): the database's seeded vex_cache IS the API
// surface — nothing generates here — and the grantable set is the
// introspected schema × vex's verb leaves. No table list is ever authored.
// ═══════════════════════════════════════════════════════════════

export type DataLayer = {
  engine: QueryEngine;
  // What the engine reads through, for an engine that stands beside it
  // (./own-entries.ts).
  adapter: DatabaseAdapter;
  schema: DatabaseSchema;
  // every `<table>.<verb>` grant this schema can carry — the data
  // section's resolution set, and the input to policy compilation
  grants: string[];
};

export type DataLayerConfig = {
  pool: PgPool;
  // Absent: vex's Postgres cache on the pool.
  cache?: CacheBackend;
  // The engine's own settings, handed on and not read here.
  vexConfig?: QueryEngineConfig['config'];
  // The entries to seed.
  entries?: readonly (SeedEntry | SeedMutation)[];
};

export const createDataLayer = async (config: DataLayerConfig): Promise<DataLayer> => {
  const adapter = createPostgresAdapter({ pool: config.pool });
  const cache = config.cache ?? createPostgresCache({ pool: config.pool });
  await cache.init?.();
  // The authored API surface lands as protected rows; a db that already
  // carries them is left untouched (idempotent).
  await seedCache(cache, config.entries ?? []);
  const engine = createQueryEngine({ adapter, cache, ...(config.vexConfig !== undefined ? { config: config.vexConfig } : {}) });
  const schema = await engine.introspect();

  // THE ENGINE'S OWN TABLES ARE ORDINARY TABLES, and it is worth saying why
  // they are not special-cased.
  //
  // The first instinct was to hide them: tide's four tables carry no tenancy
  // of their own, so `tide_run.read` looks like a grant that reads every
  // tenant's ledger at once. But that is true of ANY table with no scope
  // rule, and it is the scope rule — not the grant list — that has always
  // been what makes `memberships.read` safe. Hiding them would have closed
  // the door as well as the hole: an authored, scoped entry over the run
  // ledger is exactly how an operator's automations screen should read, and
  // it cannot compile against a table vex has never heard of.
  //
  // So they introspect, they are grantable, and a host that grants one
  // authors a scope rule for it like everything else. Lyra scopes `tide_run`
  // on the identity the run declared.
  return { engine, adapter, schema, grants: scopeGrants(schema.entities.map((e) => e.name)) };
};
