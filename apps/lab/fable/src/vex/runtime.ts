import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { createQueryEngine, createPostgresAdapter, createPostgresCache } from '@niscorp/vex';
import type { QueryEngine } from '@niscorp/vex';
import { DDL } from './schema';
import { buildSeedSql, TODAY_ISO } from './seed';
import { createPglitePool, RAW_DATE_PARSERS } from './pool';
import { scopePolicy } from './scope';
import { buildCacheSeed } from '@fable/api';

export type VexRuntime = {
  db: PGlite;
  engine: QueryEngine;
};

const boot = async (): Promise<VexRuntime> => {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(DDL);
  await db.exec(buildSeedSql());

  // Two pools over one db: app queries get raw date strings (Prism formats
  // them); the cache needs Dates (it calls .getTime() on its timestamps).
  const adapter = createPostgresAdapter({ pool: createPglitePool(db, RAW_DATE_PARSERS) });
  const cache = createPostgresCache({ pool: createPglitePool(db) });
  await cache.init();

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

export const CURRENT_DATE = TODAY_ISO;
