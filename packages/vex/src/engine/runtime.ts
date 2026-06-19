import type { QueryEngine, QueryEngineConfig, ExecuteOptions } from '../types.js';
import type { DatabaseSchema } from '../schemas/database.schema.js';
import type { Query } from '../schemas/query.schema.js';
import type { QueryRequest, QueryResponse } from '../schemas/request.schema.js';
import type { CompiledQuery } from '../adapters/adapter.types.js';
import type { TestResult, AnalysisConfig } from './engine.types.js';
import type { ScopeValues } from '../scope/scope.types.js';
import type { CacheBackend, CacheMode, CacheEntry } from '../cache/cache.types.js';
import { z } from 'zod';
import { QueryRequestSchema } from '../schemas/request.schema.js';
import { QuerySchema } from '../schemas/query.schema.js';
import { discoverEntities } from '../scope/discover.js';
import { applyScope } from '../scope/apply.js';
import { resolve } from './resolver.js';
import { analyze } from './analyzer.js';
import { executeQuery, buildContextContract, findMissingContext } from './executor.js';
import { createMemoryCache } from '../cache/memory.js';
import { computeShapeHash, computeSchemaFingerprint, computeRequestHash } from '../cache/hash.js';
import { isEntryFresh } from '../cache/util.js';
import { buildValidationContext } from '../utils/context.js';
import { VexError } from '../errors.js';
import type { CompiledIr, JsonObject, JsonValue } from '@niscorp/prism';
import { execute as executePrism } from '@niscorp/prism';

// `sortBy`/`sortDir` are reserved context keys: when present they replace the
// query's literal `sort` (its default) with a single ORDER BY for this run. The
// column is validated downstream by resolve()/resolveFieldPath — an unknown
// column throws — and never becomes a param (operators.ts guards $context refs).
export const applySortContext = (dsl: Query, context: Record<string, unknown>): Query => {
  const sortBy = context['sortBy'];
  if (typeof sortBy !== 'string' || sortBy === '') return dsl;
  const dir: 'asc' | 'desc' = context['sortDir'] === 'desc' ? 'desc' : 'asc';
  return { ...dsl, sort: [{ field: sortBy, dir }] };
};

// ═══════════════════════════════════════════════════════════════
// Pipeline result (compiled query + analysis warnings)
// ═══════════════════════════════════════════════════════════════

type PipelineResult = {
  compiled: CompiledQuery;
  warnings: string[];
};

// ═══════════════════════════════════════════════════════════════
// Configuration defaults
// ═══════════════════════════════════════════════════════════════

const DEFAULT_MAX_NESTING_DEPTH = 2;
const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_LIMIT = 1000;
const DEFAULT_UNSATISFIABLE_TTL_MS = 300_000;

// ═══════════════════════════════════════════════════════════════
// Runtime factory
// ═══════════════════════════════════════════════════════════════

export const createQueryEngine = (engineConfig: QueryEngineConfig): QueryEngine => {
  const { adapter, scope: scopePolicy, generateDsl, mapToShape, embed } = engineConfig;
  const emit = engineConfig.onEvent ?? (() => {});
  const maxNestingDepth = engineConfig.config?.maxNestingDepth ?? DEFAULT_MAX_NESTING_DEPTH;
  const defaultLimit = engineConfig.config?.defaultLimit ?? DEFAULT_LIMIT;
  const maxLimit = engineConfig.config?.maxLimit ?? DEFAULT_MAX_LIMIT;
  const rejectCartesianProducts = engineConfig.config?.rejectCartesianProducts ?? true;
  const warnUnindexedFilters = engineConfig.config?.warnUnindexedFilters ?? true;
  const rejectUnindexedFilters = engineConfig.config?.rejectUnindexedFilters ?? false;
  const unsatisfiableTtlMs = engineConfig.config?.unsatisfiableTtlMs ?? DEFAULT_UNSATISFIABLE_TTL_MS;

  const analysisConfig: AnalysisConfig = {
    maxNestingDepth,
    rejectCartesianProducts,
    warnUnindexedFilters,
    rejectUnindexedFilters,
  };

  let cachedSchema: DatabaseSchema | undefined;
  let cachedFingerprint: string | undefined;
  const cache: CacheBackend = engineConfig.cache ?? createMemoryCache();

  // Single-flight: collapse concurrent identical misses (same request
  // identity) so a burst of N requests triggers one agent generation,
  // not N. Keyed by request hash; only the shared generation is pooled,
  // each request still runs its own scope/execute.
  const inFlight = new Map<string, Promise<Query>>();

  // ─── Introspect ────────────────────────────────────────────

  const introspect = async (): Promise<DatabaseSchema> => {
    const options = engineConfig.config?.entities !== undefined
      ? { entities: engineConfig.config.entities }
      : undefined;
    const schema = await adapter.introspect(options);
    cachedSchema = schema;
    cachedFingerprint = computeSchemaFingerprint(schema);
    return schema;
  };

  // ─── Internal pipeline ─────────────────────────────────────

  const ensureSchema = (): DatabaseSchema => {
    if (cachedSchema === undefined) {
      throw new VexError(
        'execution_error',
        'Database schema not loaded. Call introspect() first.',
      );
    }
    return cachedSchema;
  };

  const runPipeline = (dsl: Query, scopeValues?: ScopeValues): PipelineResult => {
    const schema = ensureSchema();

    // Apply limit constraints
    let processedDsl = dsl;
    if (processedDsl.limit === undefined) {
      processedDsl = { ...processedDsl, limit: defaultLimit };
    } else if (processedDsl.limit > maxLimit) {
      processedDsl = { ...processedDsl, limit: maxLimit };
    }

    // Discover entities
    const entities = discoverEntities(processedDsl);

    // Apply scope
    let scopedDsl = processedDsl;
    if (scopePolicy !== undefined && scopeValues !== undefined) {
      scopedDsl = applyScope(processedDsl, entities, scopePolicy);
    }

    // Resolve
    const resolved = resolve(scopedDsl, schema);

    // Analyze
    const analysis = analyze(resolved, analysisConfig);
    if (analysis.errors.length > 0) {
      throw new VexError(
        'invalid_dsl',
        `Analysis failed: ${analysis.errors.join('; ')}`,
        { errors: analysis.errors, warnings: analysis.warnings },
      );
    }

    // Compile
    const compiled = adapter.compile(resolved);

    return { compiled, warnings: analysis.warnings };
  };

  // ─── Compile ───────────────────────────────────────────────

  const compile = (dsl: Query, scopeValues?: ScopeValues): CompiledQuery =>
    runPipeline(dsl, scopeValues).compiled;

  // ─── Test ──────────────────────────────────────────────────

  const test = async (dsl: Query, scopeValues?: ScopeValues): Promise<TestResult> => {
    try {
      // Override limit to 5 for test queries
      const testDsl: Query = { ...dsl, limit: 5 };
      const { compiled, warnings } = runPipeline(testDsl, scopeValues);

      // Build synthetic context for testing
      const syntheticContext = buildValidationContext(compiled.contextContract);

      // Build synthetic scope from scope values or empty
      const syntheticScope: Record<string, unknown> = scopeValues ?? {};

      const rows = await executeQuery(compiled, syntheticContext, syntheticScope, adapter, embed);

      return { rows, warnings, errors: [] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { rows: [], warnings: [], errors: [message] };
    }
  };

  // ─── Cache read ────────────────────────────────────────────

  type CacheRead = { dsl?: Query; cachedIr?: CompiledIr; hit: boolean };

  // Fresh = not past TTL and written against the current schema. A
  // non-fresh entry is evicted here, then treated as a miss.
  const freshOrEvict = (entry: CacheEntry, key: string): boolean => {
    if (isEntryFresh(entry, cachedFingerprint)) return true;
    void cache.delete(key);
    return false;
  };

  // Positive cache is shape-keyed; negative cache is request-keyed (a
  // hit there short-circuits a known-impossible request). Throws for
  // cache-only misses.
  const readFromCache = async (
    shapeHash: string,
    negKey: string,
    cacheMode: CacheMode,
  ): Promise<CacheRead> => {
    if (cacheMode !== 'use' && cacheMode !== 'only') return { hit: false };

    const positive = await cache.get(shapeHash);
    if (positive?.kind === 'ok' && freshOrEvict(positive, shapeHash)) {
      return { dsl: positive.dsl, cachedIr: positive.prismIr, hit: true };
    }

    const negative = await cache.get(negKey);
    if (negative?.kind === 'unsatisfiable' && freshOrEvict(negative, negKey)) {
      emit({ type: 'query.cache', hit: true });
      emit({ type: 'query.error', code: 'unsatisfiable', message: negative.reason });
      throw new VexError('unsatisfiable', negative.reason);
    }

    if (cacheMode === 'only') {
      throw new VexError('cache_miss', 'No cached query for this shape and cache mode is "only"');
    }
    return { hit: false };
  };

  // ─── DSL generation (single-flight + negative caching) ─────

  const generateMissingDsl = async (
    validRequest: QueryRequest,
    requestHash: string,
    negKey: string,
    cacheMode: CacheMode,
    entities: string[] | undefined,
  ): Promise<Query> => {
    if (generateDsl === undefined) {
      throw new VexError('agent_failed', 'No query generation function available and no cached query found');
    }

    const fullSchema = ensureSchema();
    const agentSchema = entities
      ? { ...fullSchema, entities: fullSchema.entities.filter(e => entities.includes(e.name)) }
      : fullSchema;

    const generate = async (): Promise<Query> => {
      try {
        return await generateDsl(validRequest, agentSchema);
      } catch (err) {
        // Cache a negative result so a known-impossible request doesn't
        // re-run the agent. TTL'd — a schema change may make it possible.
        if (err instanceof VexError && err.code === 'unsatisfiable' && cacheMode !== 'bypass') {
          const now = Date.now();
          await cache.set(negKey, {
            kind: 'unsatisfiable',
            reason: err.message,
            createdAt: now,
            expiresAt: now + unsatisfiableTtlMs,
            ...(validRequest.intent !== undefined ? { intent: validRequest.intent } : {}),
            shape: validRequest.shape,
            ...(cachedFingerprint !== undefined ? { schemaFingerprint: cachedFingerprint } : {}),
          });
        }
        throw err;
      }
    };

    // Single-flight the default 'use' path so a burst of identical
    // requests triggers one generation. 'refresh'/'bypass' are explicit
    // "don't share cache state" intents and generate independently.
    if (cacheMode !== 'use') return generate();

    const existing = inFlight.get(requestHash);
    if (existing !== undefined) return existing;

    const generation = generate();
    inFlight.set(requestHash, generation);
    try {
      return await generation;
    } finally {
      inFlight.delete(requestHash);
    }
  };

  // ─── Execute SQL + map to shape ────────────────────────────

  type MapResult = { result: JsonValue; executionMs: number; mappingMs?: number; mappedIr?: CompiledIr };

  const executeAndMap = async (
    compiled: CompiledQuery,
    validRequest: QueryRequest,
    cachedIr: CompiledIr | undefined,
    context: Record<string, unknown>,
    scope: Record<string, unknown>,
  ): Promise<MapResult> => {
    const execStart = Date.now();
    const rows = await executeQuery(compiled, context, scope, adapter, embed);
    const executionMs = Date.now() - execStart;
    emit({ type: 'query.rows', count: rows.length, executionMs });

    // No shape declared → hand back the raw rows untouched.
    let result: JsonValue = rows as unknown as JsonValue;
    let mappingMs: number | undefined;
    let mappedIr: CompiledIr | undefined = cachedIr;

    if (validRequest.shape !== undefined) {
      // Prism runs ONCE and its output IS the result. The shape decides the
      // envelope: an ARRAY shape maps over the whole row set (`$.result` is the
      // array — a `$map`/identity); a non-array shape maps the SINGLE (first)
      // row (`$.result` is that row — a detail/aggregate reads `$.result.field`,
      // no `[0]`). Vex never forces an array: the mapping owns the shape.
      const single = !Array.isArray(validRequest.shape);
      const source = { result: single ? (rows[0] ?? null) : rows } as unknown as JsonObject;
      if (cachedIr !== undefined) {
        const mapStart = Date.now();
        result = executePrism(cachedIr, source);
        mappingMs = Date.now() - mapStart;
      } else if (mapToShape !== undefined) {
        const mapStart = Date.now();
        const mapped = await mapToShape(rows, validRequest.shape);
        mappingMs = Date.now() - mapStart;
        result = mapped.transformed;
        mappedIr = mapped.ir;
      }
      if (mappingMs !== undefined) emit({ type: 'query.mapped', mappingMs });
    }

    return { result, executionMs, mappingMs, mappedIr };
  };

  // ─── Execute ───────────────────────────────────────────────

  const execute = async (
    request: QueryRequest,
    options?: ExecuteOptions,
  ): Promise<QueryResponse> => {
    const parsed = QueryRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new VexError('invalid_request', `Invalid request: ${parsed.error.message}`);
    }

    const validRequest = parsed.data;
    const cacheMode: CacheMode = options?.cache ?? 'use';
    const scopeValues = options?.scope;
    const t0 = Date.now();

    const shapeHash = computeShapeHash(validRequest.shape);
    const requestHash = computeRequestHash(validRequest);
    const negKey = `neg:${requestHash}`;
    emit({ type: 'query.start', intent: validRequest.intent, shape: validRequest.shape, cache: cacheMode, hash: shapeHash, entities: options?.entities });

    // Cache read (may short-circuit on a negative hit or cache-only miss).
    const cached = await readFromCache(shapeHash, negKey, cacheMode);
    emit({ type: 'query.cache', hit: cached.hit });

    // Generate on miss.
    let dsl = cached.dsl;
    let agentMs: number | undefined;
    if (dsl === undefined) {
      const agentStart = Date.now();
      dsl = await generateMissingDsl(validRequest, requestHash, negKey, cacheMode, options?.entities);
      agentMs = Date.now() - agentStart;
      emit({ type: 'query.dsl', dsl, agentMs });
    }

    // Run the pipeline. `sortBy`/`sortDir` from context override the literal
    // `sort` for this run (the cached `dsl` keeps its default — see cache.set below).
    const { compiled, warnings } = runPipeline(applySortContext(dsl, validRequest.context), scopeValues);
    emit({ type: 'query.sql', sql: compiled.sql, warnings });

    // Check for missing context
    const context = validRequest.context;
    const scope = scopeValues ?? {};
    const missingKeys = findMissingContext(compiled, context, scope);

    if (missingKeys.length > 0) {
      return {
        result: [],
        meta: {
          cache: { hit: cached.hit, key: shapeHash },
          context: buildContextContract(compiled),
          warnings: warnings.length > 0 ? warnings : undefined,
          missingContext: missingKeys,
        },
      };
    }

    // Execute SQL + map rows to the requested shape.
    const { result, executionMs, mappingMs, mappedIr } = await executeAndMap(
      compiled, validRequest, cached.cachedIr, context, scope,
    );

    // Cache DSL + mapping IR (positive, shape-keyed).
    if (!cached.hit && cacheMode !== 'bypass') {
      await cache.set(shapeHash, {
        kind: 'ok',
        dsl,
        prismIr: mappedIr,
        createdAt: Date.now(),
        ...(validRequest.intent !== undefined ? { intent: validRequest.intent } : {}),
        shape: validRequest.shape,
        ...(cachedFingerprint !== undefined ? { schemaFingerprint: cachedFingerprint } : {}),
      });
    }

    emit({ type: 'query.done', totalMs: Date.now() - t0 });

    return {
      result,
      meta: {
        cache: { hit: cached.hit, key: shapeHash },
        context: buildContextContract(compiled),
        timing: {
          ...(agentMs !== undefined ? { agentMs } : {}),
          executionMs,
          ...(mappingMs !== undefined ? { mappingMs } : {}),
        },
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    };
  };

  // ─── getDslSchema ─────────────────────────────────────────

  const getDslSchema = (): object =>
    z.toJSONSchema(QuerySchema, { target: 'draft-7', reused: 'ref' });

  // ─── getSchema ─────────────────────────────────────────────

  const getSchema = (): DatabaseSchema | undefined => cachedSchema;

  return {
    introspect,
    execute,
    compile,
    test,
    getDslSchema,
    getSchema,
    cache,
  };
};
