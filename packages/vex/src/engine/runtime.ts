import type { QueryEngine, QueryEngineConfig, ExecuteOptions, GenerationCaller } from '../types.js';
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
import { checkScope, scopeResolved, canReadTable } from '../scope/apply.js';
import { behaviorColumns, scopeBindings } from '../scope/grants.js';
import { resolve } from './resolver.js';
import { analyze } from './analyzer.js';
import { executeQuery, buildContextContract, findMissingContext, requireScope } from './executor.js';
import { pruneOptional, presenceOf, presenceSignature, optionalKeysOf } from './optional.js';
import { createMemoryCache } from '../cache/memory.js';
import { computeSchemaFingerprint, computeRequestHash, computePolicyKey, mintFingerprint } from '../cache/hash.js';
import { isEntryFresh, isTouchDue, fireAndForget } from '../cache/util.js';
import { buildValidationContext, resolveParams } from '../utils/context.js';
import { canonicalHash } from '../utils/canonical.js';
import { createLiveRows } from './live.js';
import type { RowsSource } from './live.js';
import type { Refresh } from '../cache/cache.types.js';
import type { Row } from '../adapters/adapter.types.js';
import { VexError, isVexError } from '../errors.js';
import { depthRefusal, exceedsDepth } from '@niscorp/strata';
import type { CompiledIr, JsonObject, JsonValue } from '@niscorp/prism';
import { execute as executePrism } from '@niscorp/prism';

// `sortBy` is the caller's and becomes SQL text: resolve() refuses it unless
// it names a column of a `from` entity or one of the query's computes or
// aggregates.
export const applySortContext = (dsl: Query, context: Record<string, unknown>): Query => {
  const sortBy = context['sortBy'];
  if (typeof sortBy !== 'string' || sortBy === '') return dsl;
  const dir: 'asc' | 'desc' = context['sortDir'] === 'desc' ? 'desc' : 'asc';
  // The entry's own sort keys stay behind the caller's column as tiebreakers:
  // a keyset page needs a total order.
  const tiebreakers = (dsl.sort ?? []).filter((entry) => entry.field !== sortBy);
  return { ...dsl, sort: [{ field: sortBy, dir }, ...tiebreakers] };
};

type PipelineResult = {
  compiled: CompiledQuery;
  warnings: string[];
  engineLimit?: number;
};

const DEFAULT_MAX_NESTING_DEPTH = 2;
const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_LIMIT = 1000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 10_000;
const DEFAULT_UNSATISFIABLE_TTL_MS = 300_000;
const DEFAULT_MAX_PRESENCE_VARIANTS = 32;

export const createQueryEngine = (engineConfig: QueryEngineConfig): QueryEngine => {
  const { adapter, scope: scopePolicy, generateDsl, mapToShape, embed, behaviors } = engineConfig;
  const emit = engineConfig.onEvent ?? (() => {});
  const maxNestingDepth = engineConfig.config?.maxNestingDepth ?? DEFAULT_MAX_NESTING_DEPTH;
  const defaultLimit = engineConfig.config?.defaultLimit ?? DEFAULT_LIMIT;
  const maxLimit = engineConfig.config?.maxLimit ?? DEFAULT_MAX_LIMIT;
  const capAuthored = engineConfig.config?.capAuthored ?? false;
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

  const live = createLiveRows(engineConfig.rows, emit);

  let cachedSchema: DatabaseSchema | undefined;
  let cachedFingerprint: string | undefined;
  const cache: CacheBackend = engineConfig.cache ?? createMemoryCache();

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

  const inFlight = new Map<string, Promise<Query>>();

  const introspect = async (): Promise<DatabaseSchema> => {
    const options = engineConfig.config?.entities !== undefined
      ? { entities: engineConfig.config.entities }
      : undefined;
    const schema = await adapter.introspect(options);
    const readLimit = engineConfig.config?.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS;
    if (adapter.limitReads !== undefined && (await adapter.limitReads(readLimit)) === 'unenforced' && readLimit > 0) {
      console.warn(`[vex] reads are not bounded: this database cannot enforce statement_timeout (${readLimit}ms asked). Fine for development; production wants Postgres.`);
    }
    if (behaviors !== undefined) {
      const missing = behaviorColumns(behaviors).filter(({ entity, field }) => !schema.entities.some((e) => e.name === entity && e.fields.some((f) => f.name === field)));
      if (missing.length > 0) {
        throw new VexError('execution_error', `The behaviors name columns the database does not have: ${missing.map((m) => `${m.entity}.${m.field}`).join(', ')}.`);
      }
    }
    cachedSchema = schema;
    cachedFingerprint = computeSchemaFingerprint(schema);
    return schema;
  };

  const ensureSchema = (): DatabaseSchema => {
    if (cachedSchema === undefined) {
      throw new VexError(
        'execution_error',
        'Database schema not loaded. Call introspect() first.',
      );
    }
    return cachedSchema;
  };

  // The policy applies on every run, whoever asks: scope values only fill the
  // row rules' `$scope` slots at bind time, and an unfilled slot is refused
  // (`requireScope`). `maxLimit` guards a query nobody reviewed, so a seeded
  // entry keeps the limit its author chose unless `capAuthored`.
  const runPipeline = (dsl: Query, policyOverride?: ScopePolicy, seeded = false): PipelineResult => {
    const schema = ensureSchema();

    let processedDsl = dsl;
    let engineLimit: number | undefined;
    if (processedDsl.limit === undefined) {
      processedDsl = { ...processedDsl, limit: defaultLimit };
      engineLimit = defaultLimit;
    } else if (processedDsl.limit > maxLimit && (capAuthored || !seeded)) {
      processedDsl = { ...processedDsl, limit: maxLimit };
      engineLimit = maxLimit;
    }

    const entities = discoverEntities(processedDsl);

    // Access is checked on entity names, before any work. Row rules are placed
    // after resolution: only the resolver knows which tables are left-joined.
    const activePolicy = policyOverride ?? scopePolicy;
    if (activePolicy !== undefined) checkScope(entities, activePolicy);

    const resolved = resolve(processedDsl, schema);
    if (activePolicy !== undefined) scopeResolved(resolved, activePolicy);

    const analysis = analyze(resolved, analysisConfig);
    if (analysis.errors.length > 0) {
      throw new VexError(
        'invalid_dsl',
        `Analysis failed: ${analysis.errors.join('; ')}`,
        { errors: analysis.errors, warnings: analysis.warnings },
      );
    }

    const compiled = adapter.compile(resolved);

    return { compiled, warnings: analysis.warnings, ...(engineLimit !== undefined ? { engineLimit } : {}) };
  };

  const cutSaid = new Set<string>();

  const cutNote = (engineLimit: number | undefined, stated: number | undefined, rowCount: number, shape: unknown, fingerprint: string | undefined): string | undefined => {
    if (engineLimit === undefined || rowCount !== engineLimit) return undefined;
    if (shape !== undefined && !Array.isArray(shape)) return undefined;
    const note =
      stated === undefined
        ? `This list states no limit, so it ran with the engine's defaultLimit of ${engineLimit}, and exactly ${engineLimit} rows came back — it may have been cut. State a \`limit\`.`
        : `This query asks for ${stated} rows, the engine's maxLimit is ${engineLimit}, and exactly ${engineLimit} came back — the list may have been cut. Raise \`maxLimit\` to read more.`;
    if (fingerprint !== undefined && !cutSaid.has(fingerprint)) {
      cutSaid.add(fingerprint);
      console.warn(`[vex] "${fingerprint}": ${note}`);
    }
    return note;
  };

  const compile = (dsl: Query): CompiledQuery =>
    runPipeline(pruneOptional(dsl, 'all')).compiled;

  const test = async (dsl: Query, scopeValues?: ScopeValues): Promise<TestResult> => {
    try {
      const testDsl: Query = { ...pruneOptional(dsl, 'all'), limit: 5 };
      const { compiled, warnings } = runPipeline(testDsl);

      const syntheticContext = buildValidationContext(compiled.contextContract);

      // Scope is never synthetic: a test runs as somebody or it is refused.
      const scope: ScopeValues = scopeValues ?? {};
      requireScope(compiled, scope);

      const rows = await executeQuery(compiled, syntheticContext, scope, adapter, embed);

      return { rows, warnings, errors: [] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { rows: [], warnings: [], errors: [message] };
    }
  };

  type Resolution = {
    fingerprint: string;
    dsl?: Query;
    cachedIr?: CompiledIr;
    intent?: string;
    shape?: unknown;
    refresh?: Refresh;
    // Put there by the host: protected, and with no request hash. No request
    // can produce that: a generated entry always carries its request's hash,
    // and the one field a wire call can change on a stored entry is `protected`.
    seeded?: boolean;
    hit: boolean;
    replaced: boolean;
  };

  const freshOrEvict = (entry: CacheEntry, key: string): boolean => {
    if (isEntryFresh(entry, cachedFingerprint)) return true;
    void cache.delete(key);
    return false;
  };

  const touch = (key: string, entry: CacheEntry): void => {
    const now = Date.now();
    if (isTouchDue(entry, now)) fireAndForget(cache.set(key, { ...entry, lastUsedAt: now }));
  };

  const resolveFingerprint = async (
    validRequest: QueryRequest,
    hasRequest: boolean,
    requestHash: string | undefined,
    scope: ScopeValues,
  ): Promise<Resolution> => {
    const fp = validRequest.fingerprint;
    if (fp === undefined) {
      return { fingerprint: mintFingerprint(), hit: false, replaced: false };
    }

    const entry = await cache.get(fp, scope);
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
          ...(entry.refresh !== undefined ? { refresh: entry.refresh } : {}),
          seeded: entry.protected === true && entry.requestHash === undefined,
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
      return { fingerprint: fp, hit: false, replaced: true };
    }

    if (!hasRequest) {
      throw new VexError('cache_miss', `Unknown fingerprint "${fp}" — pass intent + shape to (re)generate it.`);
    }
    return { fingerprint: fp, hit: false, replaced: false };
  };

  const callerOf = (policy: ScopePolicy | undefined, scope: ScopeValues, tables: readonly string[]): GenerationCaller => ({
    bindings: scopeBindings(behaviors ?? {}, tables, scope),
    read: async (dsl) => {
      const { compiled, warnings } = runPipeline(pruneOptional(dsl, 'all'), policy);
      requireScope(compiled, scope);
      if (compiled.paramSlots.some((slot) => slot.kind === 'semantic')) {
        return { rows: [], sql: compiled.sql, warnings: [...warnings, 'Semantic params present — execution skipped, SQL structure validated only'] };
      }
      // `$context` binds NULL: a probe asks whether the query runs, and NULL
      // compares against a column of any type, where a typed guess ('' against
      // a date column) is a cast error.
      const params = compiled.paramSlots.map((slot) => (slot.kind === 'scope' ? scope[slot.key] : null));
      return { rows: await adapter.execute(compiled, params), sql: compiled.sql, warnings };
    },
  });

  const generateMissingDsl = async (
    validRequest: QueryRequest,
    flightKey: string,
    negKey: string,
    entities: string[] | undefined,
    policy: ScopePolicy | undefined,
    scope: ScopeValues,
  ): Promise<Query> => {
    if (generateDsl === undefined) {
      throw new VexError('agent_failed', 'No query generation function available and no cached query found');
    }

    const fullSchema = ensureSchema();
    const agentSchema = {
      ...fullSchema,
      entities: fullSchema.entities.filter(
        (e) => (entities === undefined || entities.includes(e.name)) && (policy === undefined || canReadTable(policy, e.name)),
      ),
    };

    const generate = async (): Promise<Query> => {
      try {
        return await generateDsl(validRequest, agentSchema, callerOf(policy, scope, agentSchema.entities.map((e) => e.name)));
      } catch (err) {
        if (isVexError(err) && err.code === 'unsatisfiable') {
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

    // Keyed by request and policy: callers who can see different tables get
    // different generations, and one's "unsatisfiable" is not the other's.
    const existing = inFlight.get(flightKey);
    if (existing !== undefined) return existing;

    const generation = generate();
    inFlight.set(flightKey, generation);
    try {
      return await generation;
    } finally {
      inFlight.delete(flightKey);
    }
  };

  type MapResult = { result: JsonValue; rowCount: number; executionMs: number; mappingMs?: number; mappedIr?: CompiledIr; mappedConfig?: unknown };

  // A mapping reads `$.context` and `$.scope` beside `$.result`, so a reactive
  // read shares rows between callers and maps them per caller.
  const mapRows = (
    rows: Row[],
    shape: unknown,
    ir: CompiledIr,
    context: Record<string, unknown>,
    scope: Record<string, unknown>,
  ): JsonValue => {
    const single = !Array.isArray(shape);
    const source = {
      result: single ? (rows[0] ?? null) : rows,
      context,
      scope,
    } as unknown as JsonObject;
    return executePrism(ir, source);
  };

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

    let result: JsonValue = rows as unknown as JsonValue;
    let mappingMs: number | undefined;
    let mappedIr: CompiledIr | undefined = cachedIr;
    let mappedConfig: unknown;

    if (validRequest.shape !== undefined) {
      if (cachedIr !== undefined) {
        const mapStart = Date.now();
        result = mapRows(rows, validRequest.shape, cachedIr, context, scope);
        mappingMs = Date.now() - mapStart;
      } else if (mapToShape !== undefined) {
        const mapStart = Date.now();
        const mapped = await mapToShape(rows, validRequest.shape, validRequest.intent);
        mappingMs = Date.now() - mapStart;
        result = mapped.transformed;
        mappedIr = mapped.ir;
        mappedConfig = mapped.config;
      }
      if (mappingMs !== undefined) emit({ type: 'query.mapped', mappingMs });
    }

    return { result, rowCount: rows.length, executionMs, mappingMs, mappedIr, ...(mappedConfig !== undefined ? { mappedConfig } : {}) };
  };

  const execute = async (
    request: QueryRequest,
    options?: ExecuteOptions,
  ): Promise<QueryResponse> => {
    if (exceedsDepth(request)) throw new VexError('invalid_request', `Invalid request: ${depthRefusal()}`);
    const parsed = QueryRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new VexError('invalid_request', `Invalid request: ${parsed.error.message}`);
    }

    const validRequest = parsed.data;
    const scope: ScopeValues = options?.scope ?? {};
    const activePolicy = options?.scopePolicy ?? scopePolicy;
    const t0 = Date.now();

    const hasRequest = validRequest.shape !== undefined && validRequest.shape !== null;
    if (validRequest.fingerprint === undefined && !hasRequest) {
      throw new VexError('invalid_request', 'Pass a fingerprint (replay) or intent + shape (generate) — or both (named slot).');
    }
    const requestHash = hasRequest ? computeRequestHash(validRequest) : undefined;
    const flightKey = requestHash !== undefined ? `${requestHash}:${computePolicyKey(activePolicy)}` : undefined;
    const negKey = flightKey !== undefined ? `neg:${flightKey}` : undefined;
    emit({
      type: 'query.start',
      intent: validRequest.intent,
      shape: validRequest.shape,
      fingerprint: validRequest.fingerprint,
      entities: options?.entities,
    });

    const cached = await resolveFingerprint(validRequest, hasRequest, requestHash, scope);
    emit({ type: 'query.cache', hit: cached.hit, fingerprint: cached.fingerprint, replaced: cached.replaced });

    let dsl = cached.dsl;
    let agentMs: number | undefined;
    if (dsl === undefined) {
      if (options?.locked === true) {
        throw new VexError('locked', 'This endpoint is replay-only — unknown or changed fingerprints cannot generate here.');
      }
      if (flightKey === undefined || negKey === undefined) {
        throw new VexError('invalid_request', 'Generation needs intent + shape.');
      }
      const negative = await cache.get(negKey);
      if (negative?.kind === 'unsatisfiable' && freshOrEvict(negative, negKey)) {
        emit({ type: 'query.error', code: 'unsatisfiable', message: negative.reason });
        throw new VexError('unsatisfiable', negative.reason);
      }
      const agentStart = Date.now();
      dsl = await generateMissingDsl(validRequest, flightKey, negKey, options?.entities, activePolicy, scope);
      agentMs = Date.now() - agentStart;
      emit({ type: 'query.dsl', dsl, agentMs });
    }

    const presence = presenceOf(validRequest.context);
    const shaped = pruneOptional(applySortContext(dsl, validRequest.context), presence);
    const { compiled, warnings, engineLimit } = runPipeline(shaped, activePolicy, cached.seeded === true);
    noteVariant(cached.fingerprint, presenceSignature(dsl, presence), warnings);
    emit({ type: 'query.sql', sql: compiled.sql, warnings });

    requireScope(compiled, scope);
    const context = validRequest.context;
    const missingKeys = findMissingContext(compiled, context);

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

    const effectiveRequest = hasRequest ? validRequest : { ...validRequest, shape: cached.shape };

    // Reactive only when the mapping is already compiled: a later answer must
    // never wait on a model.
    const reactiveIr = cached.cachedIr;
    if (cached.hit && cached.refresh === 'reactive' && (effectiveRequest.shape === undefined || reactiveIr !== undefined)) {
      const shape = effectiveRequest.shape;
      const shapeRows = (rows: Row[]): JsonValue =>
        shape === undefined || reactiveIr === undefined ? (rows as unknown as JsonValue) : mapRows(rows, shape, reactiveIr, context, scope);
      const params = await resolveParams(compiled.paramSlots, context, scope, embed);
      // The compiled SQL and its bound values: scope is inside both, so two
      // callers share rows exactly when they would get the same rows.
      const key = canonicalHash([compiled.sql, params]);
      const source: RowsSource = { tables: [...discoverEntities(shaped)], fetch: () => adapter.execute(compiled, params) };
      const execStart = Date.now();
      const rows = await live.read(key, source);
      const executionMs = Date.now() - execStart;
      emit({ type: 'query.rows', count: rows.length, executionMs });
      const result = shapeRows(rows);
      const metaOf = (rowCount: number): Omit<QueryResponse['meta'], 'timing'> => {
        const cut = cutNote(engineLimit, shaped.limit, rowCount, shape, validRequest.fingerprint);
        const said = cut === undefined ? warnings : [...warnings, cut];
        return {
          cache: {
            hit: cached.hit,
            fingerprint: cached.fingerprint,
            intent: cached.intent ?? validRequest.intent,
          },
          context: buildContextContract(compiled, optionalKeysOf(dsl)),
          warnings: said.length > 0 ? said : undefined,
        };
      };
      const { signal, onChange } = options ?? {};
      if (signal !== undefined && onChange !== undefined) {
        let lastHash = canonicalHash(result);
        live.follow(key, source, rows, {
          deliver: (next) => {
            const nextResult = shapeRows(next);
            const nextHash = canonicalHash(nextResult);
            if (nextHash === lastHash) return;
            lastHash = nextHash;
            onChange({ result: nextResult, meta: metaOf(next.length) });
          },
        }, signal);
      }
      emit({ type: 'query.done', totalMs: Date.now() - t0 });
      return { result, meta: { ...metaOf(rows.length), timing: { executionMs } } };
    }
    const { result, rowCount, executionMs, mappingMs, mappedIr, mappedConfig } = await executeAndMap(
      compiled, effectiveRequest, cached.cachedIr, context, scope,
    );
    const cut = cutNote(engineLimit, shaped.limit, rowCount, effectiveRequest.shape, validRequest.fingerprint);
    const said = cut === undefined ? warnings : [...warnings, cut];

    if (!cached.hit) {
      const now = Date.now();
      const entry: OkCacheEntry = {
        kind: 'ok',
        dsl,
        ...(mappedIr !== undefined ? { prismIr: mappedIr } : {}),
        ...(mappedConfig !== undefined ? { mapping: mappedConfig } : {}),
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
        warnings: said.length > 0 ? said : undefined,
      },
    };
  };

  const getDslSchema = (): object =>
    z.toJSONSchema(QuerySchema, { target: 'draft-7', reused: 'ref' });

  const getSchema = (): DatabaseSchema | undefined => cachedSchema;

  return {
    introspect,
    execute,
    compile,
    test,
    getDslSchema,
    getSchema,
    cache,
    invalidate: live.invalidate,
    rows: { stats: live.stats, stop: live.stop },
  };
};
