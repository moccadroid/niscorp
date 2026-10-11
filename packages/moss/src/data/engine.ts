import { createPostgresAdapter, createPostgresCache, createQueryEngine, scopeGrants } from '@niscorp/vex';
import type { CacheBackend, DatabaseAdapter, DatabaseSchema, ExecuteRecord, PgPool, QueryEngine, QueryEngineConfig } from '@niscorp/vex';
import { createUpgrader, type Sequence, type Upgrader } from '@niscorp/strata';
import { NOVA_SEQUENCE } from '@niscorp/nova/migrations';
import { evaluate } from '@niscorp/prism';
import { PRISM_SEQUENCE } from '@niscorp/prism/migrations';
import type { TelemetrySpan } from '../runtime';

// ═══════════════════════════════════════════════════════════════
// The data layer stands up from what's present (DESIGN.md § Derivation
// over configuration): the database's seeded vex_cache IS the API
// surface — nothing generates here — and the grantable set is the
// introspected schema × vex's verb leaves. No table list is ever authored.
//
// The entries are not seeded here. Their source is the running manifest,
// which cannot stand before the grantable set is known, so its list is
// copied into this engine's cache once it does (./data.ts, `seed`). The
// cache is what a replay resolves in.
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

export type DataLayerDeps = {
  pool: PgPool;
  // Absent: vex's Postgres cache on the pool.
  cache?: CacheBackend;
  // The engine's own settings, handed on and not read here.
  vexConfig?: QueryEngineConfig['config'];
};

export const createDataLayer = async (deps: DataLayerDeps): Promise<DataLayer> => {
  const adapter = createPostgresAdapter({ pool: deps.pool });
  const cache = deps.cache ?? createPostgresCache({ pool: deps.pool });
  await cache.init?.();
  const engine = createQueryEngine({ adapter, cache, ...(deps.vexConfig !== undefined ? { config: deps.vexConfig } : {}) });
  const schema = await engine.introspect();

  // THE ENGINE'S OWN TABLES ARE ORDINARY TABLES, not special-cased. Tide's
  // four tables carry no tenancy of their own, so `tide_run.read` looks like a
  // grant that reads every tenant's ledger at once. That is true of ANY table
  // with no scope rule: it is the scope rule, not the grant list, that makes
  // `memberships.read` safe. Hiding them would also close the door on an
  // authored, scoped entry over the run ledger, which is how an operator's
  // automations screen reads, and it cannot compile against a table vex has
  // never heard of.
  //
  // So they introspect, they are grantable, and a host that grants one
  // authors a scope rule for it like everything else.
  return { engine, adapter, schema, grants: scopeGrants(schema.entities.map((e) => e.name)) };
};

// THE GRAMMARS a moss deployment reads and writes documents in: nova's (its
// actions, fragments and layouts), Prism's (the configs inside them), and the
// app's own (`NiscApp.grammars` — its component kit's props, say). One upgrader
// over all of them, built at boot: it brings stored rows current, upgrades what
// an add-on submits from the stamp the add-on declares, and stamps what moss
// writes.
//
// A document migration is a Prism config, evaluated by Prism's own migration
// transform — the engine that runs an endpoint's request, the same safety (no
// code runs).

// nova's and Prism's grammars, then the app's own, in that order.
export const grammarsOf = (app: { grammars?: readonly Sequence[] }): readonly Sequence[] => [
  NOVA_SEQUENCE,
  PRISM_SEQUENCE,
  ...(app.grammars ?? []),
];

export const createGrammarUpgrader = (app: { grammars?: readonly Sequence[] }): Promise<Upgrader> =>
  createUpgrader(grammarsOf(app), { transform: evaluate });

// A vex execution record → a telemetry span. The one place a vex fact becomes
// a span: vex reports in its own vocabulary (handler.ts, ExecuteRecord) and
// knows nothing of OTLP; moss decides what of it is safe to name. Principal
// PRESENCE is derived from the composed scope's `userId` (moss's own
// convention — machinery carries none), never the value itself; no other scope
// value crosses into the span.
export const vexRecordToSpan = (rec: ExecuteRecord): TelemetrySpan => ({
  name: 'vex.execute',
  startUnixNano: rec.startUnixNano,
  endUnixNano: rec.endUnixNano,
  status: rec.status,
  attributes: {
    op: rec.kind,
    hasPrincipal: (rec.scope['userId'] ?? 'anonymous') !== 'anonymous',
    ...(rec.fingerprint !== undefined ? { fingerprint: rec.fingerprint } : {}),
    ...(rec.reach !== undefined ? { reach: rec.reach } : {}),
    ...(rec.cacheHit !== undefined ? { cache: rec.cacheHit ? 'hit' : 'miss' } : {}),
    ...(rec.rows !== undefined ? { rows: rec.rows } : {}),
  },
});
