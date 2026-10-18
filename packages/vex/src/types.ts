import type { ScopePolicy, ScopeValues } from './scope/scope.types.js';
import type { CacheBackend } from './cache/cache.types.js';
import type { DatabaseAdapter, CompiledQuery, Row } from './adapters/adapter.types.js';
import type { DatabaseSchema } from './schemas/database.schema.js';
import type { Query } from './schemas/query.schema.js';
import type { QueryRequest, QueryResponse } from './schemas/request.schema.js';
import type { TestResult } from './engine/engine.types.js';
import type { VexEventHandler } from './events.js';
import type { CompiledIr, JsonValue } from '@niscorp/prism';
import type { LiveRowsConfig, LiveRowsStats } from './engine/live.js';
import type { ScopeBehaviors } from './scope/grants.js';

export type GenerationCaller = {
  read: (dsl: Query) => Promise<{ rows: Row[]; sql: string; warnings: string[] }>;
  bindings: ScopeBinding[];
};

export type ScopeBinding = { entity: string; field: string; key: string };

export type GenerateDsl = (request: QueryRequest, schema: DatabaseSchema, caller: GenerationCaller) => Promise<Query>;

/**
 * The IR is replayed against an envelope whose `result` is the rows for an array shape, the first row for any other.
 * `config` is the prism config the IR was compiled from: a compiled form cannot be read back, or upgraded when prism changes.
 */
// `intent`: what the request asked for, when it asked in words, so the mapping can give a value the form it asked for.
export type MapToShape = (rows: Row[], shape: unknown, intent?: string) => Promise<{ ir: CompiledIr; config: unknown; transformed: JsonValue }>;

export type QueryEngineConfig = {
  adapter: DatabaseAdapter;
  embed?: (text: string, dimensions?: number) => Promise<number[]>;
  scope?: ScopePolicy;
  cache?: CacheBackend;
  onEvent?: VexEventHandler;
  generateDsl?: GenerateDsl;
  /**
   * Read for one thing: which columns a scope key is bound to, so a generation
   * can be told who its caller is (GenerationCaller.bindings). A compiled
   * policy cannot say it: it keeps only the phases a caller is granted.
   */
  behaviors?: ScopeBehaviors;
  mapToShape?: MapToShape;
  rows?: LiveRowsConfig;
  config?: {
    maxNestingDepth?: number;
    defaultLimit?: number;
    maxLimit?: number;
    // A seeded entry's own limit is honoured past `maxLimit`; `true` clamps
    // those entries as well.
    capAuthored?: boolean;
    rejectCartesianProducts?: boolean;
    warnUnindexedFilters?: boolean;
    rejectUnindexedFilters?: boolean;
    entities?: string[];
    unsatisfiableTtlMs?: number;
    // 0: unbounded.
    statementTimeoutMs?: number;
    // A warning threshold, not a limit on what runs.
    maxPresenceVariants?: number;
  };
};

export type QueryEngine = {
  introspect: () => Promise<DatabaseSchema>;
  execute: (request: QueryRequest, options?: ExecuteOptions) => Promise<QueryResponse>;
  compile: (dsl: Query) => CompiledQuery;
  test: (dsl: Query, scope?: ScopeValues) => Promise<TestResult>;
  getDslSchema: () => object;
  getSchema: () => DatabaseSchema | undefined;
  cache: CacheBackend;
  invalidate: (tables: readonly string[]) => void;
  rows: { stats: () => LiveRowsStats; stop: () => void };
};

export type ExecuteOptions = {
  scope?: ScopeValues;
  entities?: string[];
  locked?: boolean;
  scopePolicy?: ScopePolicy;
  /** `signal` and `onChange` go together; both are ignored for a snapshot read. */
  signal?: AbortSignal;
  onChange?: (response: QueryResponse) => void;
};
