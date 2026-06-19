// @niscorp/vex — Declarative Query Synthesis
// See DESIGN.md for architecture and API specification.

// ─── Core engine ─────────────────────────────────────────────
export { createQueryEngine } from './engine/runtime.js';
export { resolve } from './engine/resolver.js';
export { analyze } from './engine/analyzer.js';
export { executeQuery, buildContextContract, findMissingContext } from './engine/executor.js';

// ─── Adapters ────────────────────────────────────────────────
export { createPostgresAdapter } from './adapters/postgres/index.js';
// Low-level SQL compilation primitives. Exposed so a write path (the Relay
// mutation prototype) can compile a `Filter` → WHERE and a `FieldOrValue` →
// value with the SAME binding/param logic as reads, instead of reinventing it.
// Candidate internals to back a future first-class Vex mutation compiler.
export { compileFilter, compileFieldOrValue } from './adapters/postgres/operators.js';
export type { CompilationContext } from './adapters/postgres/operators.js';

// ─── Schemas ─────────────────────────────────────────────────
export { QuerySchema } from './schemas/query.schema.js';
export { FilterSchema } from './schemas/filter.schema.js';
export { ComputeExpressionSchema } from './schemas/compute.schema.js';
export { AggregateExpressionSchema } from './schemas/aggregate.schema.js';
export { QueryRequestSchema } from './schemas/request.schema.js';

// ─── Scope ───────────────────────────────────────────────────
export { discoverEntities } from './scope/discover.js';
export { applyScope, VexScopeError } from './scope/apply.js';

// ─── Cache ───────────────────────────────────────────────────
export { createMemoryCache } from './cache/memory.js';
export { createPostgresCache } from './cache/postgres.js';
export { createTieredCache } from './cache/tiered.js';
export { validateEntry } from './cache/validate.js';
export { computeShapeHash, normalizeShape, computeRequestHash, computeSchemaFingerprint } from './cache/hash.js';

// ─── Utils ───────────────────────────────────────────────────
export { buildValidationContext, resolveParams } from './utils/context.js';

// ─── Handler ────────────────────────────────────────────────
export { handleDiscovery, handleQuery } from './handler.js';
export type { VexHandlerConfig, DiscoveryResponse, QueryResult } from './handler.js';

// ─── Events ─────────────────────────────────────────────────
export type { VexEvent, VexEventHandler } from './events.js';

// ─── Errors ──────────────────────────────────────────────────
export { VexError } from './errors.js';

// ─── Types ───────────────────────────────────────────────────
export type { QueryEngine, QueryEngineConfig, ExecuteOptions } from './types.js';
export type { Query, Source, SortEntry } from './schemas/query.schema.js';
export type { Filter } from './schemas/filter.schema.js';
export type { ComputeExpression } from './schemas/compute.schema.js';
export type { AggregateExpression } from './schemas/aggregate.schema.js';
export type { FieldOrValue, ContextRef, ScopeRef } from './schemas/value.schema.js';
export type { DatabaseSchema, EntitySchema, FieldSchema, RelationSchema, IndexSchema, NormalizedType } from './schemas/database.schema.js';
export type { QueryRequest, QueryResponse, QueryErrorResponse, QueryErrorCode, ContextMeta } from './schemas/request.schema.js';
export type { DatabaseAdapter, AdapterCapabilities, CompiledQuery, ParamSlot, BoundParams, Row, IntrospectOptions } from './adapters/adapter.types.js';
export type { PostgresAdapterConfig, PgPool } from './adapters/postgres/index.js';
export type { ScopePolicy, ScopeEntityRule, ScopeRule, ScopeMatch, ScopeSet, ScopeValues } from './scope/scope.types.js';
export type { CacheBackend, CacheEntry, OkCacheEntry, UnsatisfiableCacheEntry, CacheMode } from './cache/cache.types.js';
export type { PostgresCacheConfig, PostgresCache } from './cache/postgres.js';
export type { TieredCacheConfig, TieredCache, WarmupMode } from './cache/tiered.js';
export type { ResolvedQuery, ResolvedSource, ResolvedField, ResolvedJoin, ResolvedFilter, ResolvedSemantic, AnalysisResult, AnalysisConfig, TestResult } from './engine/engine.types.js';
