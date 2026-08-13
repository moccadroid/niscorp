import type { QueryEngine, QueryEngineConfig, ExecuteOptions } from '../types.js';
import type { DatabaseSchema } from '../schemas/database.schema.js';
import type { Query } from '../schemas/query.schema.js';
import type { QueryRequest, QueryResponse } from '../schemas/request.schema.js';
import type { CompiledQuery } from '../adapters/adapter.types.js';
import type { TestResult, AnalysisConfig } from './engine.types.js';
import type { ScopeValues, ScopePolicy } from '../scope/scope.types.js';
import type { CacheBackend, CacheEntry, OkCacheEntry } from '../cache/cache.types.js';
import { z } from 'zod';
import { QueryRequestSchema } from '../schemas/request.schema.js';
import { QuerySchema } from '../schemas/query.schema.js';
import { discoverEntities } from '../scope/discover.js';
import { checkScope, scopeResolved } from '../scope/apply.js';
import { resolve } from './resolver.js';
import { analyze } from './analyzer.js';
import { executeQuery, buildContextContract, findMissingContext } from './executor.js';
import { pruneOptional, presenceOf, presenceSignature, optionalKeysOf } from './optional.js';
import { createMemoryCache } from '../cache/memory.js';
import { computeSchemaFingerprint, computeRequestHash, mintFingerprint } from '../cache/hash.js';
import { isEntryFresh, fireAndForget } from '../cache/util.js';
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
  // The caller's column LEADS; the entry's own keys stay behind it as
  // tiebreakers. This used to replace the sort outright, which quietly broke
  // any entry whose last sort key was there to make the order TOTAL — a keyset
  // page ordered by (name, id) became ordered by name alone, and two people
  // sharing a name could straddle a page boundary and never be reached.
  // A trailing key is not decoration; it is what makes "the next fifty" mean
  // anything. The caller's own column is dropped from the tail so it cannot
  // appear twice with two directions.
  const tiebreakers = (dsl.sort ?? []).filter((entry) => entry.field !== sortBy);
  return { ...dsl, sort: [{ field: sortBy, dir }, ...tiebreakers] };
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
const DEFAULT_MAX_PRESENCE_VARIANTS = 32;

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

  // ── how many SHAPES one entry is being asked for ──
  //
  // Optional conditions trade one artifact for up to 2^n compiled forms. That
  // is the deal and it is a good one — but it is worth SAYING when an entry
  // starts behaving like a query builder, because at that point a caller is
  // composing rather than choosing, and the closed grammar is doing less work
  // than it looks like it is.
  //
  // A warning rather than a refusal: every variant is still a query the author
  // wrote, scope still applies, and failing a legitimate read to make a point
  // about authoring would be the wrong trade. There is no per-call cost here
  // either — vex compiles per request already, so a new shape is not a cache
  // miss, it is just a different string.
  const variantsSeen = new Map<string, Set<string>>();
  const maxPresenceVariants = engineConfig.config?.maxPresenceVariants ?? DEFAULT_MAX_PRESENCE_VARIANTS;

  const noteVariant = (fingerprint: string | undefined, signature: string, warnings: string[]): void => {
    if (fingerprint === undefined || signature === '') return;
    let seen = variantsSeen.get(fingerprint);
    if (seen === undefined) {
      seen = new Set<string>();
      variantsSeen.set(fingerprint, seen);
    }
    if (seen.has(signature)) return;
    seen.add(signature);
    if (seen.size > maxPresenceVariants) {
      warnings.push(
        `"${fingerprint}" has now compiled ${seen.size} distinct optional-key combinations (limit ${maxPresenceVariants}). An entry answering this many shapes is closer to a query builder than to a question — consider splitting it.`,
      );
    }
  };

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

  const runPipeline = (dsl: Query, scopeValues?: ScopeValues, policyOverride?: ScopePolicy): PipelineResult => {
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

    // Scope, in two halves. A per-request policy (from ExecuteOptions)
    // overrides the engine's configured default for this run.
    //
    // The ACCESS CHECK runs first, on entity names alone, so a denied table is
    // refused before any work is done. The ROW RULES are placed AFTER
    // resolution, because only the resolver knows which tables are left-joined
    // and a row rule in the WHERE of a left join silently deletes rows whose
    // optional FK is null. See scope/apply.ts.
    const activePolicy = policyOverride ?? scopePolicy;
    const scoping = activePolicy !== undefined && scopeValues !== undefined;
    if (scoping && activePolicy !== undefined) checkScope(entities, activePolicy);

    // Resolve
    const resolved = resolve(processedDsl, schema);
    if (scoping && activePolicy !== undefined) scopeResolved(resolved, activePolicy);

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

  // No caller, so no presence to resolve against: `all` compiles the WIDEST
  // form of the query, every optional condition included. That is the right
  // default for both of these — a compile is asking "does this query build",
  // and a test is asking "does the hardest version of it run".
  const compile = (dsl: Query, scopeValues?: ScopeValues): CompiledQuery =>
    runPipeline(pruneOptional(dsl, 'all'), scopeValues).compiled;

  // ─── Test ──────────────────────────────────────────────────

  const test = async (dsl: Query, scopeValues?: ScopeValues): Promise<TestResult> => {
    try {
      // Override limit to 5 for test queries
      const testDsl: Query = { ...pruneOptional(dsl, 'all'), limit: 5 };
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

  // ─── Cache resolution (fingerprint identity) ───────────────

  type Resolution = {
    fingerprint: string;
    // Present on a hit — the stored artifact.
    dsl?: Query;
    cachedIr?: CompiledIr;
    intent?: string;
    // The stored shape — drives the array-vs-single mapping envelope on
    // fingerprint-only replays (the request carries no shape then).
    shape?: unknown;
    hit: boolean;
    // A named slot existed but its stored request differed — this run
    // regenerates and REPLACES it.
    replaced: boolean;
  };

  // Fresh = not past TTL and written against the current schema. A
  // non-fresh entry is evicted here, then treated as a miss.
  const freshOrEvict = (entry: CacheEntry, key: string): boolean => {
    if (isEntryFresh(entry, cachedFingerprint)) return true;
    void cache.delete(key);
    return false;
  };

  // Lifetime = usage: every hit stamps lastUsedAt (off the hot path) so
  // a GC sweep can evict entries that stopped being replayed.
  const touch = (key: string, entry: CacheEntry): void => {
    fireAndForget(cache.set(key, { ...entry, lastUsedAt: Date.now() }));
  };

  const resolveFingerprint = async (
    validRequest: QueryRequest,
    hasRequest: boolean,
    requestHash: string | undefined,
  ): Promise<Resolution> => {
    const fp = validRequest.fingerprint;
    if (fp === undefined) {
      // Explore: always a fresh generation under a minted, immutable pin.
      return { fingerprint: mintFingerprint(), hit: false, replaced: false };
    }

    const entry = await cache.get(fp);
    if (entry?.kind === 'mutation') {
      throw new VexError(
        'invalid_request',
        `Fingerprint "${fp}" names a mutation — the query engine cannot execute writes. Replay it through the vex endpoint.`,
      );
    }
    if (entry?.kind === 'ok' && freshOrEvict(entry, fp)) {
      if (!hasRequest || entry.requestHash === requestHash) {
        touch(fp, entry);
        return {
          fingerprint: fp,
          dsl: entry.dsl,
          ...(entry.prismIr !== undefined ? { cachedIr: entry.prismIr } : {}),
          ...(entry.intent !== undefined ? { intent: entry.intent } : {}),
          ...(entry.shape !== undefined ? { shape: entry.shape } : {}),
          hit: true,
          replaced: false,
        };
      }
      if (entry.protected === true) {
        throw new VexError(
          'fingerprint_protected',
          `Fingerprint "${fp}" is protected and this request no longer matches its stored one. Replay it with the fingerprint alone, or use a new name.`,
        );
      }
      // The name is the caller's; its content follows the caller's request.
      return { fingerprint: fp, hit: false, replaced: true };
    }

    if (!hasRequest) {
      throw new VexError('cache_miss', `Unknown fingerprint "${fp}" — pass intent + shape to (re)generate it.`);
    }
    return { fingerprint: fp, hit: false, replaced: false };
  };

  // ─── DSL generation (single-flight + negative caching) ─────

  const generateMissingDsl = async (
    validRequest: QueryRequest,
    requestHash: string,
    negKey: string,
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
        if (err instanceof VexError && err.code === 'unsatisfiable') {
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

    // Single-flight: a burst of identical requests (same request
    // identity) triggers one generation, not N.
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
      // `$.result` is the rows, and it is what every mapping was written
      // against. `$.context` and `$.scope` sit BESIDE it — additive, so nothing
      // authored before this line changes meaning.
      //
      // WHY A MAPPING NEEDS THE SCOPE. A mapping is where a row becomes words
      // ("Active", "Fri 14 Mar", "€45"), and words have a language. Without
      // this, the deepest layer of an application's display strings is the one
      // layer that structurally cannot be localised — and the only escape is to
      // stop mapping in vex and re-derive the same fields somewhere further out,
      // which is worse in every direction.
      //
      // Scope values are ENGINE-side (moss injects them per session; a request
      // cannot author one), so reading them here does not widen what a caller
      // can reach — it widens what the app can say about a caller it already
      // knows. Note this does not touch the cache: vex caches the query PLAN
      // (`dsl` + `prismIr`), never the rows, and the compiled IR holds the
      // lookup rather than the looked-up value.
      const source = {
        result: single ? (rows[0] ?? null) : rows,
        context,
        scope,
      } as unknown as JsonObject;
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
    const scopeValues = options?.scope;
    const t0 = Date.now();

    const hasRequest = validRequest.shape !== undefined && validRequest.shape !== null;
    if (validRequest.fingerprint === undefined && !hasRequest) {
      throw new VexError('invalid_request', 'Pass a fingerprint (replay) or intent + shape (generate) — or both (named slot).');
    }
    const requestHash = hasRequest ? computeRequestHash(validRequest) : undefined;
    const negKey = requestHash !== undefined ? `neg:${requestHash}` : undefined;
    emit({
      type: 'query.start',
      intent: validRequest.intent,
      shape: validRequest.shape,
      fingerprint: validRequest.fingerprint,
      entities: options?.entities,
    });

    // Resolve identity: replay a pin/name, or decide to generate.
    const cached = await resolveFingerprint(validRequest, hasRequest, requestHash);
    emit({ type: 'query.cache', hit: cached.hit, fingerprint: cached.fingerprint, replaced: cached.replaced });

    // Generate on miss (consulting the negative cache first).
    let dsl = cached.dsl;
    let agentMs: number | undefined;
    if (dsl === undefined) {
      if (options?.locked === true) {
        throw new VexError('locked', 'This endpoint is replay-only — unknown or changed fingerprints cannot generate here.');
      }
      if (requestHash === undefined || negKey === undefined) {
        throw new VexError('invalid_request', 'Generation needs intent + shape.');
      }
      const negative = await cache.get(negKey);
      if (negative?.kind === 'unsatisfiable' && freshOrEvict(negative, negKey)) {
        emit({ type: 'query.error', code: 'unsatisfiable', message: negative.reason });
        throw new VexError('unsatisfiable', negative.reason);
      }
      const agentStart = Date.now();
      dsl = await generateMissingDsl(validRequest, requestHash, negKey, options?.entities);
      agentMs = Date.now() - agentStart;
      emit({ type: 'query.dsl', dsl, agentMs });
    }

    // Run the pipeline. Two caller-driven rewrites happen here and NOWHERE
    // else, both against the stored `dsl` rather than replacing it:
    //   · `sortBy`/`sortDir` override the literal `sort` for this run
    //   · optional conditions the caller did not key are pruned OUT entirely
    // The cached entry keeps its full form — every run re-derives its own
    // shape, so one stored artifact answers every combination of keys.
    const presence = presenceOf(validRequest.context);
    const shaped = pruneOptional(applySortContext(dsl, validRequest.context), presence);
    const { compiled, warnings } = runPipeline(shaped, scopeValues, options?.scopePolicy);
    noteVariant(cached.fingerprint, presenceSignature(dsl, presence), warnings);
    emit({ type: 'query.sql', sql: compiled.sql, warnings });

    // Check for missing context
    const context = validRequest.context;
    const scope = scopeValues ?? {};
    const missingKeys = findMissingContext(compiled, context, scope);

    if (missingKeys.length > 0) {
      return {
        result: [],
        meta: {
          cache: {
            hit: cached.hit,
            fingerprint: cached.fingerprint,
            intent: cached.intent ?? validRequest.intent,
            ...(cached.replaced ? { replaced: true } : {}),
          },
          context: buildContextContract(compiled, optionalKeysOf(dsl)),
          warnings: warnings.length > 0 ? warnings : undefined,
          missingContext: missingKeys,
        },
      };
    }

    // Execute SQL + map rows to the requested shape. A fingerprint-only
    // replay carries no shape — the stored one drives the envelope.
    const effectiveRequest = hasRequest ? validRequest : { ...validRequest, shape: cached.shape };
    const { result, executionMs, mappingMs, mappedIr } = await executeAndMap(
      compiled, effectiveRequest, cached.cachedIr, context, scope,
    );

    // Store the artifact under its fingerprint. Runtime writes are never
    // protected — that bit belongs to seeds and explicit PATCHes only.
    if (!cached.hit) {
      const now = Date.now();
      const entry: OkCacheEntry = {
        kind: 'ok',
        dsl,
        ...(mappedIr !== undefined ? { prismIr: mappedIr } : {}),
        createdAt: now,
        lastUsedAt: now,
        ...(requestHash !== undefined ? { requestHash } : {}),
        ...(validRequest.intent !== undefined ? { intent: validRequest.intent } : {}),
        shape: validRequest.shape,
        ...(cachedFingerprint !== undefined ? { schemaFingerprint: cachedFingerprint } : {}),
      };
      await cache.set(cached.fingerprint, entry);
    }

    emit({ type: 'query.done', totalMs: Date.now() - t0 });

    return {
      result,
      meta: {
        cache: {
          hit: cached.hit,
          fingerprint: cached.fingerprint,
          intent: cached.intent ?? validRequest.intent,
          ...(cached.replaced ? { replaced: true } : {}),
        },
        context: buildContextContract(compiled, optionalKeysOf(dsl)),
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
