import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { fuzzystrmatch } from '@electric-sql/pglite/contrib/fuzzystrmatch';
import {
  createQueryEngine,
  createPostgresAdapter,
  createMemoryCache,
  computeSchemaFingerprint,
} from '@niscorp/vex';
import type { QueryEngine, DatabaseSchema, VexEvent, MutationClient } from '@niscorp/vex';
import { DDL, buildSeedSql } from './seed-data';
import { createPglitePool } from '@niscorp/vex/pglite';
import { embed } from './embed';
import { makeGenerateDsl, makeMapToShape } from './live';

export type VexEventListener = (event: VexEvent) => void;

export type VexRuntime = {
  engine: QueryEngine;
  schema: DatabaseSchema;
  dslJsonSchema: object;
  fingerprint: string;
  db: MutationClient;
  subscribe: (listener: VexEventListener) => () => void;
};

const boot = async (): Promise<VexRuntime> => {
  const db = new PGlite({ extensions: { vector, pg_trgm, fuzzystrmatch } });
  await db.exec(DDL);
  await db.exec(buildSeedSql());

  const pool = createPglitePool(db);
  const adapter = createPostgresAdapter({ pool });

  // A first engine yields the DSL JSON Schema the live agents are wired with.
  const probe = createQueryEngine({ adapter });
  const schema = await probe.introspect();
  const dslJsonSchema = probe.getDslSchema();
  const fingerprint = computeSchemaFingerprint(schema);

  const listeners = new Set<VexEventListener>();
  const onEvent: VexEventListener = (event) => {
    for (const listener of listeners) listener(event);
  };

  const cache = createMemoryCache();
  const engine = createQueryEngine({
    adapter,
    cache,
    onEvent,
    embed,
    generateDsl: makeGenerateDsl(dslJsonSchema),
    mapToShape: makeMapToShape(),
  });
  await engine.introspect();

  return {
    engine,
    schema,
    dslJsonSchema,
    fingerprint,
    db,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

let runtimePromise: Promise<VexRuntime> | undefined;

export const getVexRuntime = (): Promise<VexRuntime> => {
  runtimePromise ??= boot();
  return runtimePromise;
};
