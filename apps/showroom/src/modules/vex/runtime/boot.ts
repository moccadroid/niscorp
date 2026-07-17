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
import { scopePolicy } from './scope';
import { embed } from './embed';
import { makeGenerateDsl, makeMapToShape } from './live';

// ═══════════════════════════════════════════════════════════
// Boot — stands up a real @niscorp/vex engine against an
// in-browser PGlite (Postgres-in-WASM). One instance per session,
// memoized. Everything the stories touch is the genuine engine; the
// only swap vs. production is the database driver and the LLM key.
// ═══════════════════════════════════════════════════════════

export type VexEventListener = (event: VexEvent) => void;

export type VexRuntime = {
  engine: QueryEngine;
  schema: DatabaseSchema;
  dslJsonSchema: object;
  fingerprint: string;
  /** The mutation client (PGlite, structurally) — what `mutations.client` takes. */
  db: MutationClient;
  /** Subscribe to the live pipeline event stream. Returns an unsubscribe fn. */
  subscribe: (listener: VexEventListener) => () => void;
};

const boot = async (): Promise<VexRuntime> => {
  const db = new PGlite({ extensions: { vector, pg_trgm, fuzzystrmatch } });
  await db.exec(DDL);
  await db.exec(buildSeedSql());

  const pool = createPglitePool(db);
  // embedding is an engine-config concern (wired to Signal), not the
  // adapter — the adapter only generates the vector-distance SQL.
  const adapter = createPostgresAdapter({ pool });

  // First pass: introspect + grab the DSL JSON Schema (both needed to
  // wire the live agents).
  const probe = createQueryEngine({ adapter });
  const schema = await probe.introspect();
  const dslJsonSchema = probe.getDslSchema();
  const fingerprint = computeSchemaFingerprint(schema);

  // Fan events out to any current subscribers (the visualizer attaches
  // one per run).
  const listeners = new Set<VexEventListener>();
  const onEvent: VexEventListener = (event) => {
    for (const listener of listeners) listener(event);
  };

  const cache = createMemoryCache();
  const engine = createQueryEngine({
    adapter,
    cache,
    scope: scopePolicy,
    onEvent,
    embed,
    generateDsl: makeGenerateDsl(adapter, dslJsonSchema),
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

// Memoized: the first caller boots PGlite + seeds; everyone else awaits
// the same instance.
export const getVexRuntime = (): Promise<VexRuntime> => {
  runtimePromise ??= boot();
  return runtimePromise;
};
