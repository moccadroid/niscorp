// @niscorp/vex — Declarative Query Synthesis
// See DESIGN.md for architecture and API specification.

// ─── Core engine ─────────────────────────────────────────────
export { createQueryEngine } from './engine/runtime.js';
export { resolve } from './engine/resolver.js';
export { analyze } from './engine/analyzer.js';
export { executeQuery, buildContextContract, findMissingContext } from './engine/executor.js';
export { pruneOptional, presenceOf, optionalKeysOf } from './engine/optional.js';

// ─── Adapters ────────────────────────────────────────────────
export { createPostgresAdapter } from './adapters/postgres/index.js';
// Low-level SQL compilation primitives. Exposed so a write path (the Relay
// mutation prototype) can compile a `Filter` → WHERE and a `FieldOrValue` →
// value with the SAME binding/param logic as reads, instead of reinventing it.
// Candidate internals to back a future first-class Vex mutation compiler.
export { compileFilter, compileFieldOrValue } from './adapters/postgres/operators.js';
export type { CompilationContext } from './adapters/postgres/operators.js';

// ─── Agent-facing knowledge ──────────────────────────────────
export { vexGuide } from './guide.js';

// ─── Schemas ─────────────────────────────────────────────────
export { QuerySchema } from './schemas/query.schema.js';
export { FilterSchema } from './schemas/filter.schema.js';
export { ComputeExpressionSchema } from './schemas/compute.schema.js';
export { AggregateExpressionSchema } from './schemas/aggregate.schema.js';
export { QueryRequestSchema } from './schemas/request.schema.js';

// ─── Scope ───────────────────────────────────────────────────
export { discoverEntities } from './scope/discover.js';
export { checkScope, scopeResolved, applyScope, VexScopeError } from './scope/apply.js';
// Grants — a ScopePolicy described as strings (`<table>.<verb>` over
// SCOPE_VERBS), so a policy layer above (a charter, a role system) hands
// vex a flat string set and gets the native contract back — no imports
// in either direction.
export { SCOPE_VERBS, scopeGrants, createScopePolicy } from './scope/grants.js';
export type { ScopeBehaviors, NamedScopeBehaviors, ScopeRules } from './scope/grants.js';
export { scopeProfiles, mergeScopePolicies } from './scope/grants.js';

// ─── Cache ───────────────────────────────────────────────────
export { createMemoryCache } from './cache/memory.js';
export { createPostgresCache } from './cache/postgres.js';
export { createTieredCache } from './cache/tiered.js';
export { validateEntry } from './cache/validate.js';
export { normalizeShape, computeRequestHash, computeSchemaFingerprint, mintFingerprint } from './cache/hash.js';
export { sweepCache } from './cache/util.js';
// Seeding — authored entries -> protected cache rows (the API surface under
// the locked posture). The machinery apps used to hand-roll.
export { seedCache } from './cache/seed.js';
export type { SeedEntry, SeedMutation } from './cache/seed.js';

// ─── Mutations ───────────────────────────────────────────────
// The write pipeline: a closed grammar, engine-applied scope, and replay-only
// execution — mutations are `kind: 'mutation'` cache entries invoked by
// fingerprint; there is no generation path (dev-authored seeds only).
export { MutationSchema, MutationDefinitionSchema, executeMutation, executeWrites, collectMutationContext, collectQueryContext, mutationEffect, requiredContextKeys, lintMutation } from './mutations/index.js';
export type { Mutation, MutationDefinition, CoreMutation, ResolvedMutation, ResolvedOnConflict, MutationValue, LookupValue, ItemRef, MutationClient, MutationTx, MutationContext, ContextField, ContextSignature, MutationEffect, WriteResult } from './mutations/index.js';

// ─── Utils ───────────────────────────────────────────────────
export { buildValidationContext, resolveParams } from './utils/context.js';

// ─── Handler ────────────────────────────────────────────────
export { handleDiscovery, handleQuery, handleFingerprintPatch, handleFingerprintDelete } from './handler.js';
export type { VexHandlerConfig, DiscoveryResponse, DiscoveryFingerprint, QueryResult, WriteEvent, ExecuteRecord } from './handler.js';

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
export type { CacheBackend, CacheEntry, OkCacheEntry, UnsatisfiableCacheEntry, MutationCacheEntry } from './cache/cache.types.js';
export type { PostgresCacheConfig, PostgresCache } from './cache/postgres.js';
export type { TieredCacheConfig, TieredCache, WarmupMode } from './cache/tiered.js';
export type { ResolvedQuery, ResolvedSource, ResolvedField, ResolvedJoin, ResolvedFilter, ResolvedSemantic, AnalysisResult, AnalysisConfig, TestResult } from './engine/engine.types.js';
