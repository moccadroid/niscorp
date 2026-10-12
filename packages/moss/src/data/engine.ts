import { createPostgresAdapter, createPostgresCache, createQueryEngine, scopeGrants } from '@niscorp/vex';
import type { CacheBackend, DatabaseAdapter, DatabaseSchema, ExecuteRecord, PgPool, QueryEngine, QueryEngineConfig } from '@niscorp/vex';
import { createUpgrader, type Sequence, type Upgrader } from '@niscorp/strata';
import { NOVA_SEQUENCE } from '@niscorp/nova/migrations';
import { evaluate } from '@niscorp/prism';
import { PRISM_SEQUENCE } from '@niscorp/prism/migrations';
import type { TelemetrySpan } from '../runtime';

export type DataLayer = {
  engine: QueryEngine;
  adapter: DatabaseAdapter;
  schema: DatabaseSchema;
  grants: string[];
};

export type DataLayerDeps = {
  pool: PgPool;
  cache?: CacheBackend;
  vexConfig?: QueryEngineConfig['config'];
};

export const createDataLayer = async (deps: DataLayerDeps): Promise<DataLayer> => {
  const adapter = createPostgresAdapter({ pool: deps.pool });
  const cache = deps.cache ?? createPostgresCache({ pool: deps.pool });
  await cache.init?.();
  const engine = createQueryEngine({ adapter, cache, ...(deps.vexConfig !== undefined ? { config: deps.vexConfig } : {}) });
  const schema = await engine.introspect();

  return { engine, adapter, schema, grants: scopeGrants(schema.entities.map((e) => e.name)) };
};

export const grammarsOf = (app: { grammars?: readonly Sequence[] }): readonly Sequence[] => [
  NOVA_SEQUENCE,
  PRISM_SEQUENCE,
  ...(app.grammars ?? []),
];

export const createGrammarUpgrader = (app: { grammars?: readonly Sequence[] }): Promise<Upgrader> =>
  createUpgrader(grammarsOf(app), { transform: evaluate });

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
