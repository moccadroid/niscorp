import { z } from 'zod';
import type { QueryEngine } from './types.js';
import type { ScopePolicy, ScopeValues } from './scope/scope.types.js';
import type { DatabaseSchema, EntitySchema } from './schemas/database.schema.js';
import { QueryRequestSchema } from './schemas/request.schema.js';
import { QuerySchema } from './schemas/query.schema.js';
import { isEntryFresh, isTouchDue, fireAndForget } from './cache/util.js';
import { computeSchemaFingerprint } from './cache/hash.js';
import { executeWrites } from './mutations/engine.js';
import type { MutationClient, WriteResult } from './mutations/engine.js';
import { collectMutationContext, collectQueryContext, mutationEffect } from './mutations/signature.js';
import type { ContextSignature, MutationEffect } from './mutations/signature.js';
import type { CacheEntry } from './cache/cache.types.js';
import type { QueryResponse } from './schemas/request.schema.js';
import type { Query } from './schemas/query.schema.js';
import { isVexError } from './errors.js';
import { depthRefusal, exceedsDepth } from '@niscorp/strata';
import { canReadTable } from './scope/apply.js';

export type VexHandlerConfig = {
  engine: QueryEngine;
  entities?: string[];
  locked?: boolean;
  // Reads and discovery, over the engine's default. Writes are enforced under `mutations.policy`.
  scopePolicy?: ScopePolicy;
  // The same principal's policy compiled at a named reach, for entries that
  // declare one. `undefined` refuses the request rather than serve it at the
  // caller's own, wider reach.
  policyForReach?: (reach: string) => Promise<ScopePolicy | undefined> | ScopePolicy | undefined;
  mutations?: {
    client: MutationClient;
    policy: ScopePolicy;
    onWrite?: (event: WriteEvent) => void;
  };
  onExecute?: (record: ExecuteRecord) => void;
};

export type WriteEvent = { fingerprint: string; writes: WriteResult[]; scope: ScopeValues };

export type VexLive = {
  signal: AbortSignal;
  onChange: (response: QueryResponse) => void;
};

// A delete is taken to change every table that references its own,
// transitively: ON DELETE CASCADE or SET NULL changes rows vex never wrote,
// and the introspected schema carries the reference but not its rule.
export const tablesChangedBy = (writes: readonly WriteResult[], schema: DatabaseSchema | undefined): string[] => {
  const changed = new Set<string>();
  const referencing = (table: string): string[] =>
    (schema?.entities.find((entity) => entity.name === table)?.relations ?? [])
      .filter((relation) => relation.type !== 'belongsTo')
      .map((relation) => relation.entity);
  for (const write of writes) {
    if (write.rows.length === 0) continue;
    changed.add(write.table);
    if (write.op !== 'delete') continue;
    const pending = [write.table];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      for (const table of referencing(next)) {
        if (changed.has(table)) continue;
        changed.add(table);
        pending.push(table);
      }
    }
  }
  return [...changed];
};

export type ExecuteRecord = {
  kind: 'query' | 'mutation';
  status: 'ok' | 'error' | 'refused';
  fingerprint?: string;
  reach?: string;
  cacheHit?: boolean;
  rows?: number;
  startUnixNano: number;
  endUnixNano: number;
  scope: ScopeValues;
};

type ExecuteProbe = {
  kind: 'query' | 'mutation';
  fingerprint?: string;
  reach?: string;
  cacheHit?: boolean;
  rows?: number;
};

export type DiscoveryFingerprint = {
  fingerprint: string;
  kind: 'query' | 'mutation';
  protected: boolean;
  schemaFresh: boolean;
  intent?: string;
  createdAt: number;
  lastUsedAt?: number;
  context?: ContextSignature;
  shape?: unknown;
  effect?: MutationEffect[];
};

export type DiscoveryResponse = {
  vex: string;
  description: string;
  entities: DiscoveryEntity[];
  protection: 'all' | 'some' | 'none';
  locked: boolean;
  fingerprints: DiscoveryFingerprint[];
  query: {
    method: string;
    accepts: string;
    body: Record<string, DiscoveryField>;
  };
  dsl: object;
};

type DiscoveryEntity = {
  name: string;
  fields: Array<{
    name: string;
    type: string;
    nullable: boolean;
    primaryKey: boolean;
  }>;
  relations: Array<{
    entity: string;
    type: string;
    via: string[];
  }>;
  rowCount?: number;
};

type DiscoveryField = {
  type: string;
  required: boolean;
  description: string;
};

const filterSchema = (schema: DatabaseSchema | undefined, entities?: string[]): EntitySchema[] => {
  if (schema === undefined) return [];
  if (entities === undefined || entities.length === 0) return schema.entities;
  return schema.entities.filter(e => entities.includes(e.name));
};

// For discovery only: it mirrors what scopeMutation enforces on every request.
const canWriteTable = (policy: ScopePolicy, table: string, op: string): boolean => {
  const rule = policy.entities[table];
  if (rule === undefined) return policy.default === 'allow';
  if ('public' in rule) return true;
  if ('deny' in rule) return false;
  if (rule.write !== undefined || policy.default === 'allow') return true;
  if (op === 'insert' || op === 'insertEach') return rule.insert !== undefined;
  if (op === 'update') return rule.update !== undefined;
  if (op === 'delete') return rule.delete !== undefined;
  // An upsert runs as an insert or as an update, per call.
  if (op === 'upsert') return rule.insert !== undefined || rule.update !== undefined;
  return false;
};

const collectTables = (dsl: Query): string[] => {
  const out: string[] = [];
  const walk = (q: Query): void => {
    for (const src of q.from) {
      if (typeof src === 'string') out.push(src);
      else walk(src.query);
    }
  };
  walk(dsl);
  return out;
};

const entryVisible = (policy: ScopePolicy, entry: CacheEntry): boolean => {
  if (entry.kind === 'ok') return collectTables(entry.dsl).every((t) => canReadTable(policy, t));
  if (entry.kind === 'mutation') return mutationEffect(entry.mutation).every((e) => canWriteTable(policy, e.table, e.op));
  return false;
};

const listFingerprints = async (engine: QueryEngine, policy?: ScopePolicy): Promise<DiscoveryFingerprint[]> => {
  if (engine.cache.entries === undefined) return [];
  const schema = engine.getSchema();
  const current = schema !== undefined ? computeSchemaFingerprint(schema) : undefined;
  const rows = await engine.cache.entries();
  return rows
    .filter(({ key, entry }) => (entry.kind === 'ok' || entry.kind === 'mutation') && !key.startsWith('neg:'))
    .filter(({ entry }) => policy === undefined || entryVisible(policy, entry))
    .map(({ key, entry }) => ({
      fingerprint: key,
      kind: entry.kind === 'mutation' ? ('mutation' as const) : ('query' as const),
      protected: entry.protected === true,
      schemaFresh: isEntryFresh(entry, current),
      ...(entry.intent !== undefined ? { intent: entry.intent } : {}),
      createdAt: entry.createdAt,
      ...(entry.lastUsedAt !== undefined ? { lastUsedAt: entry.lastUsedAt } : {}),
      ...(entry.kind === 'ok'
        ? {
            context: collectQueryContext(entry.dsl, schema),
            ...(entry.shape !== undefined ? { shape: entry.shape } : {}),
          }
        : entry.kind === 'mutation'
          ? {
              context: collectMutationContext(entry.mutation, schema),
              effect: mutationEffect(entry.mutation),
            }
          : {}),
    }));
};

export const handleDiscovery = async (config: VexHandlerConfig): Promise<DiscoveryResponse> => {
  const { engine, entities: entityFilter, scopePolicy } = config;
  const filtered = filterSchema(engine.getSchema(), entityFilter).filter(
    (e) => scopePolicy === undefined || canReadTable(scopePolicy, e.name),
  );
  const fingerprints = await listFingerprints(engine, scopePolicy);
  const protectedCount = fingerprints.filter((f) => f.protected).length;

  return {
    protection: protectedCount === 0 ? 'none' : protectedCount === fingerprints.length ? 'all' : 'some',
    locked: config.locked === true,
    fingerprints,
    vex: '1.0',
    description: 'Query this resource using natural language or structured DSL',
    entities: filtered.map(e => ({
      name: e.name,
      fields: e.fields.map(f => ({
        name: f.name,
        type: f.normalizedType,
        nullable: f.nullable,
        primaryKey: f.primaryKey,
      })),
      relations: e.relations.map(r => ({
        entity: r.entity,
        type: r.type,
        via: r.localFields,
      })),
      rowCount: e.rowCount,
    })),
    query: {
      method: 'POST',
      accepts: 'application/json',
      body: {
        fingerprint: {
          type: 'string',
          required: false,
          description:
            'Cache identity. Alone → replay a known query (no generation). With intent+shape → a named slot: ' +
            'matching request hits, differing request regenerates and replaces (409 when protected). ' +
            'Omitted → generate fresh; the minted fingerprint returns in meta.cache.fingerprint.',
        },
        intent: {
          type: 'string',
          required: false,
          description: 'Natural language description of what data you need',
        },
        shape: {
          type: 'any',
          required: false,
          description: 'Example of the response structure — use empty strings, zeros, booleans as type indicators. Required unless replaying by fingerprint.',
        },
        context: {
          type: 'Record<string, unknown>',
          required: false,
          description: 'Runtime parameters referenced in filters as { $context: "key" }',
        },
      },
    },
    dsl: z.toJSONSchema(QuerySchema, { target: 'draft-7', reused: 'ref' }),
  };
};

export type QueryResult = {
  status: number;
  body: unknown;
};

const rowsOf = (result: unknown): number =>
  Array.isArray(result) ? result.length : result === null || result === undefined ? 0 : 1;

export const handleQuery = async (
  config: VexHandlerConfig,
  body: unknown,
  scope: ScopeValues,
  live?: VexLive,
): Promise<QueryResult> => {
  if (config.onExecute === undefined) return runQuery(config, body, scope, undefined, live);

  const startUnixNano = Date.now() * 1e6;
  const t0 = elapsedClock();
  const probe: ExecuteProbe = { kind: 'query' };
  const result = await runQuery(config, body, scope, probe, live);
  const record: ExecuteRecord = {
    kind: probe.kind,
    status: result.status === 200 ? 'ok' : result.status === 403 ? 'refused' : 'error',
    startUnixNano,
    endUnixNano: startUnixNano + (elapsedClock() - t0) * 1e6,
    scope,
    ...(probe.fingerprint !== undefined ? { fingerprint: probe.fingerprint } : {}),
    ...(probe.reach !== undefined ? { reach: probe.reach } : {}),
    ...(probe.cacheHit !== undefined ? { cacheHit: probe.cacheHit } : {}),
    ...(probe.rows !== undefined ? { rows: probe.rows } : {}),
  };
  try {
    config.onExecute(record);
  } catch (err) {
    console.error('[vex:onExecute]', err);
  }
  return result;
};

const elapsedClock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const runQuery = async (
  config: VexHandlerConfig,
  body: unknown,
  scope: ScopeValues,
  probe: ExecuteProbe | undefined,
  live: VexLive | undefined,
): Promise<QueryResult> => {
  const { engine } = config;

  // Before the schema: a deep enough body overflows the stack when parsed.
  if (exceedsDepth(body)) return { status: 400, body: { error: 'invalid_request', message: depthRefusal() } };
  const parsed = QueryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      status: 400,
      body: {
        error: 'invalid_request',
        message: parsed.error.message,
      },
    };
  }

  const hasShape = parsed.data.shape !== undefined && parsed.data.shape !== null;
  if (!hasShape && parsed.data.fingerprint === undefined) {
    return {
      status: 400,
      body: {
        error: 'invalid_request',
        message: 'Pass a fingerprint (replay) or intent + shape (generate) — or both (named slot).',
      },
    };
  }

  if (probe !== undefined && parsed.data.fingerprint !== undefined) probe.fingerprint = parsed.data.fingerprint;

  try {
    let entryReach: string | undefined;
    if (parsed.data.fingerprint !== undefined) {
      const entry = await engine.cache.get(parsed.data.fingerprint, scope);
      if (entry !== undefined && entry.kind === 'ok') entryReach = entry.reach;
      if (probe !== undefined && entryReach !== undefined) probe.reach = entryReach;
      if (entry !== undefined && entry.kind === 'mutation') {
        if (probe !== undefined) {
          probe.kind = 'mutation';
          if (entry.reach !== undefined) probe.reach = entry.reach;
        }
        if (config.mutations === undefined) {
          return {
            status: 500,
            body: { error: 'execution_error', message: 'This endpoint serves no mutations — handler has no mutation client configured.' },
          };
        }
        const schema = engine.getSchema();
        if (schema === undefined) {
          return { status: 500, body: { error: 'execution_error', message: 'Vex schema not introspected.' } };
        }
        let writePolicy = config.mutations.policy;
        if (entry.reach !== undefined) {
          if (config.policyForReach === undefined) {
            return {
              status: 500,
              body: {
                error: 'execution_error',
                message: `Entry "${parsed.data.fingerprint ?? ''}" requires reach "${entry.reach}" and this handler has no policyForReach.`,
              },
            };
          }
          const narrowed = await config.policyForReach(entry.reach);
          if (narrowed === undefined) {
            return {
              status: 403,
              body: { error: 'scope_denied', message: `Reach "${entry.reach}" is not available to this principal.` },
            };
          }
          writePolicy = narrowed;
        }

        const writes = await executeWrites(config.mutations.client, entry.mutation, {
          context: parsed.data.context,
          scope,
          policy: writePolicy,
          schema,
        });
        const rows = writes.flatMap((w) => w.rows);
        engine.invalidate(tablesChangedBy(writes, schema));
        // The write is committed: a throwing observer must not fail the response.
        if (config.mutations.onWrite !== undefined) {
          try {
            config.mutations.onWrite({ fingerprint: parsed.data.fingerprint, writes, scope });
          } catch (err) {
            console.error('[vex:onWrite]', err);
          }
        }
        const now = Date.now();
        if (isTouchDue(entry, now)) fireAndForget(engine.cache.set(parsed.data.fingerprint, { ...entry, lastUsedAt: now }));
        if (probe !== undefined) probe.rows = rows.length;
        return { status: 200, body: { result: rows.length === 1 ? rows[0] : rows } };
      }
    }

    let readPolicy = config.scopePolicy;
    if (entryReach !== undefined) {
      if (config.policyForReach === undefined) {
        return {
          status: 500,
          body: {
            error: 'execution_error',
            message: `Entry "${parsed.data.fingerprint ?? ''}" requires reach "${entryReach}" and this handler has no policyForReach.`,
          },
        };
      }
      readPolicy = await config.policyForReach(entryReach);
      if (readPolicy === undefined) {
        return {
          status: 403,
          body: { error: 'scope_denied', message: `Reach "${entryReach}" is not available to this principal.` },
        };
      }
    }

    const response = await engine.execute(parsed.data, {
      scope,
      entities: config.entities,
      ...(config.locked === true ? { locked: true } : {}),
      ...(readPolicy !== undefined ? { scopePolicy: readPolicy } : {}),
      ...(live !== undefined ? { signal: live.signal, onChange: live.onChange } : {}),
    });
    if (probe !== undefined) {
      probe.cacheHit = response.meta.cache.hit;
      if (response.meta.cache.fingerprint !== undefined) probe.fingerprint = response.meta.cache.fingerprint;
      probe.rows = rowsOf(response.result);
    }
    return { status: 200, body: response };
  } catch (err) {
    // The names of the missing scope keys are the host's business: they go to
    // the log, not over the wire.
    if (isVexError(err) && err.code === 'missing_scope') {
      console.error('[vex] refused a statement the host did not scope:', err.message);
      return { status: 500, body: { error: 'missing_scope', message: 'The server did not supply the scope this request needs.' } };
    }
    if (isVexError(err)) {
      const status = err.code === 'fingerprint_protected' ? 409 : err.code === 'cache_miss' ? 404 : 400;
      return {
        status,
        body: {
          error: err.code,
          message: err.message,
          details: err.details,
        },
      };
    }
    console.error('[vex] unhandled error:', err);
    const errObj = err as Record<string, unknown> | null;
    const message = err instanceof Error
      ? err.message
      : (typeof errObj?.message === 'string' ? errObj.message : 'Unknown error');
    const code = typeof errObj?.code === 'string' ? errObj.code : 'execution_error';
    return {
      status: 500,
      body: { error: code, message },
    };
  }
};

export const handleFingerprintPatch = async (
  config: VexHandlerConfig,
  fingerprint: string,
  patch: { protected?: boolean },
): Promise<QueryResult> => {
  if (config.locked === true) {
    return { status: 403, body: { error: 'locked', message: 'This endpoint is locked — fingerprints cannot be managed here.' } };
  }
  const entry = await config.engine.cache.get(fingerprint);
  if (entry === undefined || (entry.kind !== 'ok' && entry.kind !== 'mutation')) {
    return { status: 404, body: { error: 'cache_miss', message: `Unknown fingerprint "${fingerprint}"` } };
  }
  if (typeof patch.protected !== 'boolean') {
    return { status: 400, body: { error: 'invalid_request', message: 'Body must be { protected: boolean }' } };
  }
  await config.engine.cache.set(fingerprint, { ...entry, protected: patch.protected });
  return { status: 200, body: { fingerprint, protected: patch.protected } };
};

export const handleFingerprintDelete = async (
  config: VexHandlerConfig,
  fingerprint: string,
): Promise<QueryResult> => {
  if (config.locked === true) {
    return { status: 403, body: { error: 'locked', message: 'This endpoint is locked — fingerprints cannot be managed here.' } };
  }
  const entry = await config.engine.cache.get(fingerprint);
  if (entry === undefined) {
    return { status: 404, body: { error: 'cache_miss', message: `Unknown fingerprint "${fingerprint}"` } };
  }
  if ((entry.kind === 'ok' || entry.kind === 'mutation') && entry.protected === true) {
    return { status: 409, body: { error: 'fingerprint_protected', message: `"${fingerprint}" is protected — unprotect it first.` } };
  }
  await config.engine.cache.delete(fingerprint);
  return { status: 200, body: { fingerprint, deleted: true } };
};
