import type { ScopePolicy, ScopeValues } from './scope/scope.types.js';
import type { CacheBackend, CacheMode } from './cache/cache.types.js';
import type { DatabaseAdapter, CompiledQuery, Row } from './adapters/adapter.types.js';
import type { DatabaseSchema } from './schemas/database.schema.js';
import type { Query } from './schemas/query.schema.js';
import type { QueryRequest, QueryResponse } from './schemas/request.schema.js';
import type { TestResult } from './engine/engine.types.js';
import type { VexEventHandler } from './events.js';
import type { CompiledIr } from '@niscorp/prism';

/** DSL generation from intent + shape. Wire to a Cortex agent (see agent/). */
export type GenerateDsl = (request: QueryRequest, schema: DatabaseSchema) => Promise<Query>;

/** Result mapping from raw rows to the requested shape. Wire to Prism's mapping agent. */
export type MapToShape = (rows: Row[], shape: unknown) => Promise<{ ir: CompiledIr; transformed: unknown[] }>;

export type QueryEngineConfig = {
  adapter: DatabaseAdapter;
  /**
   * Turns text into a vector at parameter-binding time, for `semantic`
   * filters. An injected provider (wire it to Signal), not a database
   * concern — the adapter only generates the vector-distance SQL.
   * Required only if the schema has vector columns you search over.
   */
  embed?: (text: string, dimensions?: number) => Promise<number[]>;
  scope?: ScopePolicy;
  cache?: CacheBackend;
  onEvent?: VexEventHandler;
  /** Optional LLM-backed query generation (cache misses fail without it). */
  generateDsl?: GenerateDsl;
  /** Optional LLM-backed result mapping (raw rows used as-is without it). */
  mapToShape?: MapToShape;
  config?: {
    maxNestingDepth?: number;
    defaultLimit?: number;
    maxLimit?: number;
    rejectCartesianProducts?: boolean;
    warnUnindexedFilters?: boolean;
    rejectUnindexedFilters?: boolean;
    entities?: string[];
    unsatisfiableTtlMs?: number;          // negative-cache TTL, default 300_000 (5 min)
  };
};

export type QueryEngine = {
  introspect: () => Promise<DatabaseSchema>;
  execute: (request: QueryRequest, options?: ExecuteOptions) => Promise<QueryResponse>;
  compile: (dsl: Query, scope?: ScopeValues) => CompiledQuery;
  test: (dsl: Query, scope?: ScopeValues) => Promise<TestResult>;
  getDslSchema: () => object;
  getSchema: () => DatabaseSchema | undefined;
  cache: CacheBackend;
};

export type ExecuteOptions = {
  scope?: ScopeValues;
  cache?: CacheMode;
  entities?: string[];
};
