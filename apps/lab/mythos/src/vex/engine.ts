import { createPostgresAdapter, createPostgresCache, createQueryEngine } from '@niscorp/vex';
import type { DatabaseSchema, PostgresCache, QueryEngine, ScopePolicy } from '@niscorp/vex';
import type { PGlite } from '@electric-sql/pglite';
import { createPglitePool, RAW_DATE_PARSERS } from './pool';

const SCOPE: ScopePolicy = {
  default: 'deny',
  entities: { todos: { public: true } },
};

export type VexBoot = {
  engine: QueryEngine;
  schema: DatabaseSchema;
  cache: PostgresCache;
};

export const createVexEngine = async (db: PGlite): Promise<VexBoot> => {
  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init();

  const engine = createQueryEngine({
    adapter: createPostgresAdapter({ pool: createPglitePool(db, RAW_DATE_PARSERS) }),
    cache,
    scope: SCOPE,
    config: { entities: ['todos'] },
  });
  const schema = await engine.introspect();

  return { engine, schema, cache };
};
