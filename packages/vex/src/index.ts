export { createQueryEngine } from './engine/runtime.js';
export { resolve } from './engine/resolver.js';
export { analyze } from './engine/analyzer.js';
export { executeQuery, buildContextContract, findMissingContext } from './engine/executor.js';
export { pruneOptional, presenceOf, optionalKeysOf } from './engine/optional.js';

export { createPostgresAdapter } from './adapters/postgres/index.js';
export { compileFilter, compileFieldOrValue } from './adapters/postgres/operators.js';
export type { CompilationContext } from './adapters/postgres/operators.js';

export { vexGuide } from './guide.js';

export { QuerySchema } from './schemas/query.schema.js';
export { FilterSchema } from './schemas/filter.schema.js';
export { ComputeExpressionSchema } from './schemas/compute.schema.js';
export { AggregateExpressionSchema } from './schemas/aggregate.schema.js';
export { QueryRequestSchema } from './schemas/request.schema.js';

export { discoverEntities } from './scope/discover.js';
export { checkScope, scopeResolved, applyScope, VexScopeError } from './scope/apply.js';
export { SCOPE_VERBS, scopeGrants, createScopePolicy } from './scope/grants.js';
export type { ScopeBehaviors, NamedScopeBehaviors, ScopeRules } from './scope/grants.js';
export { scopeProfiles, mergeScopePolicies, scopeBindings } from './scope/grants.js';

export { createMemoryCache } from './cache/memory.js';
export { createPostgresCache } from './cache/postgres.js';
export { createTieredCache } from './cache/tiered.js';
export { validateEntry } from './cache/validate.js';
export { normalizeShape, computeRequestHash, computeSchemaFingerprint, mintFingerprint } from './cache/hash.js';
export { sweepCache } from './cache/util.js';
export { seedCache } from './cache/seed.js';
export type { SeedEntry, SeedMutation } from './cache/seed.js';
export { REFRESH_MODES, isRefresh } from './cache/cache.types.js';
export type { Refresh } from './cache/cache.types.js';
export type { LiveRowsConfig, LiveRowsStats } from './engine/live.js';

export { MutationSchema, MutationDefinitionSchema, executeMutation, executeWrites, mutationMisfits, collectMutationContext, collectQueryContext, mutationEffect, requiredContextKeys, lintMutation } from './mutations/index.js';
export type { Mutation, MutationDefinition, CoreMutation, ResolvedMutation, ResolvedOnConflict, MutationValue, LookupValue, ReturnedRef, ItemRef, MutationClient, MutationTx, MutationContext, ContextField, ContextSignature, MutationEffect, WriteResult } from './mutations/index.js';

export { buildValidationContext, resolveParams } from './utils/context.js';

export { handleDiscovery, handleQuery, handleFingerprintPatch, handleFingerprintDelete, tablesChangedBy } from './handler.js';
export type { VexHandlerConfig, DiscoveryResponse, DiscoveryFingerprint, QueryResult, WriteEvent, ExecuteRecord, VexLive } from './handler.js';

export type { VexEvent, VexEventHandler } from './events.js';

export { VexError } from './errors.js';

export type { QueryEngine, QueryEngineConfig, ExecuteOptions, GenerateDsl, GenerationCaller, ScopeBinding, MapToShape } from './types.js';
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
export type { CacheBackend, CacheEntry, OkCacheEntry, UnsatisfiableCacheEntry, MutationCacheEntry } from './cache/cache.types.js';
export type { PostgresCacheConfig, PostgresCache } from './cache/postgres.js';
export type { TieredCacheConfig, TieredCache, WarmupMode } from './cache/tiered.js';
export type { ResolvedQuery, ResolvedSource, ResolvedField, ResolvedJoin, ResolvedFilter, ResolvedSemantic, AnalysisResult, AnalysisConfig, TestResult } from './engine/engine.types.js';
