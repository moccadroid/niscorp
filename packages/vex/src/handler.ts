import { z } from 'zod';
import type { QueryEngine } from './types.js';
import type { ScopePolicy, ScopeValues } from './scope/scope.types.js';
import type { DatabaseSchema, EntitySchema } from './schemas/database.schema.js';
import { QueryRequestSchema } from './schemas/request.schema.js';
import { QuerySchema } from './schemas/query.schema.js';
import { isEntryFresh, fireAndForget } from './cache/util.js';
import { computeSchemaFingerprint } from './cache/hash.js';
import { executeMutation } from './mutations/engine.js';
import type { MutationClient } from './mutations/engine.js';
import { collectMutationContext, collectQueryContext, mutationEffect } from './mutations/signature.js';
import type { ContextSignature, MutationEffect } from './mutations/signature.js';
import type { CacheEntry } from './cache/cache.types.js';
import type { Query } from './schemas/query.schema.js';
import { VexError } from './errors.js';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type VexHandlerConfig = {
  engine: QueryEngine;
  entities?: string[];
  // Replay-only posture (production): requests needing generation fail
  // with 'locked'; fingerprint management (PATCH/DELETE) is refused too.
  // Mutation replay is unaffected — writes are ALWAYS replay-only.
  locked?: boolean;
  // Per-request read policy — overrides the engine default for reads on
  // this request (the read-side twin of `mutations.policy`). A host that
  // resolves a policy per principal passes the SAME policy here and in
  // `mutations.policy`, so reads and writes enforce one principal's phases.
  scopePolicy?: ScopePolicy;
  // Enables replay of `kind: 'mutation'` cache entries. The client is
  // structural (PGlite, a pg wrapper, a test double); the policy is the
  // same ScopePolicy reads use, its `write` rules applied by the engine.
  mutations?: {
    client: MutationClient;
    policy: ScopePolicy;
  };
};

export type DiscoveryFingerprint = {
  fingerprint: string;
  kind: 'query' | 'mutation';
  protected: boolean;
  schemaFresh: boolean;
  intent?: string;
  createdAt: number;
  lastUsedAt?: number;
  // The derived input contract: every `$context` key the stored def binds,
  // typed from the schema by its position. Computed, never authored.
  context?: ContextSignature;
  // Reads: the stored result shape. Mutations: what the write changes.
  shape?: unknown;
  effect?: MutationEffect[];
};

export type DiscoveryResponse = {
  vex: string;
  description: string;
  entities: DiscoveryEntity[];
  // Governance summary + the endpoint's known queries — self-description
  // an agent (or a management UI) can read before generating anything.
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
    via: string;
  }>;
  rowCount?: number;
};

type DiscoveryField = {
  type: string;
  required: boolean;
  description: string;
};
// (queryParams are gone — the request body carries all cache semantics.)

// ═══════════════════════════════════════════════════════════════
// Discovery
// ═══════════════════════════════════════════════════════════════

const filterSchema = (schema: DatabaseSchema | undefined, entities?: string[]): EntitySchema[] => {
  if (schema === undefined) return [];
  if (entities === undefined || entities.length === 0) return schema.entities;
  return schema.entities.filter(e => entities.includes(e.name));
};

// ─── Visibility under a policy — discovery advertises only what the
// policy can touch. These mirror the ENFORCEMENT semantics (applyScope /
// scopeMutation) as pure predicates: a phase exists, is public, or falls
// to the default. Enforcement still runs on every request; this only
// keeps the catalog honest per principal. ───────────────────────
const canReadTable = (policy: ScopePolicy, table: string): boolean => {
  const rule = policy.entities[table];
  if (rule === undefined) return policy.default === 'allow';
  if ('public' in rule) return true;
  if ('deny' in rule) return false;
  return rule.read !== undefined || policy.default === 'allow';
};

const canWriteTable = (policy: ScopePolicy, table: string, op: string): boolean => {
  const rule = policy.entities[table];
  if (rule === undefined) return policy.default === 'allow';
  if ('public' in rule) return true;
  if ('deny' in rule) return false;
  if (rule.write !== undefined || policy.default === 'allow') return true;
  if (op === 'insert') return rule.insert !== undefined;
  if (op === 'update') return rule.update !== undefined;
  if (op === 'delete') return rule.delete !== undefined;
  // upsert desugars to insert or update per call — advertise if either exists
  if (op === 'upsert') return rule.insert !== undefined || rule.update !== undefined;
  return false;
};

// Every table a read touches — string sources, recursing into subquery
// sources (`{ as, query }`).
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
      // The derived contract — what to pass, straight from the stored def.
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
  // Under a scopePolicy, discovery is per-principal: entities and entries
  // the policy cannot touch are not advertised (what you can't reach
  // doesn't exist for you — deny by absence, in the catalog too).
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
        via: r.localField,
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

// ═══════════════════════════════════════════════════════════════
// Query execution
// ═══════════════════════════════════════════════════════════════

export type QueryResult = {
  status: number;
  body: unknown;
};

export const handleQuery = async (
  config: VexHandlerConfig,
  body: unknown,
  scope: ScopeValues,
): Promise<QueryResult> => {
  const { engine } = config;

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

  try {
    // ONE wire shape: `{ fingerprint, context }`. The entry's kind decides
    // the pipeline — a mutation fingerprint replays the write path; anything
    // else is the read path (which owns misses, generation, and locked).
    if (parsed.data.fingerprint !== undefined) {
      const entry = await engine.cache.get(parsed.data.fingerprint);
      if (entry !== undefined && entry.kind === 'mutation') {
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
        const rows = await executeMutation(config.mutations.client, entry.mutation, {
          context: parsed.data.context,
          scope,
          policy: config.mutations.policy,
          schema,
        });
        // Lifetime = usage, for writes exactly as for reads: stamp
        // lastUsedAt (off the hot path) so the GC sweep sees replays.
        fireAndForget(engine.cache.set(parsed.data.fingerprint, { ...entry, lastUsedAt: Date.now() }));
        // A single statement returns its one affected row; a batch returns
        // the array — the same `{ result }` envelope a query reply uses.
        return { status: 200, body: { result: rows.length === 1 ? rows[0] : rows } };
      }
    }

    const response = await engine.execute(parsed.data, {
      scope,
      entities: config.entities,
      ...(config.locked === true ? { locked: true } : {}),
      ...(config.scopePolicy !== undefined ? { scopePolicy: config.scopePolicy } : {}),
    });
    return { status: 200, body: response };
  } catch (err) {
    if (err instanceof VexError) {
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

// ═══════════════════════════════════════════════════════════════
// Fingerprint management — protect (PATCH) and evict (DELETE).
// The ONLY writers of the `protected` bit besides the seed path.
// ═══════════════════════════════════════════════════════════════

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
  if (entry.kind === 'ok' && entry.protected === true) {
    return { status: 409, body: { error: 'fingerprint_protected', message: `"${fingerprint}" is protected — unprotect it first.` } };
  }
  await config.engine.cache.delete(fingerprint);
  return { status: 200, body: { fingerprint, deleted: true } };
};
