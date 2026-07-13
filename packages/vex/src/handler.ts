import { z } from 'zod';
import type { QueryEngine } from './types.js';
import type { ScopeValues } from './scope/scope.types.js';
import type { DatabaseSchema, EntitySchema } from './schemas/database.schema.js';
import { QueryRequestSchema } from './schemas/request.schema.js';
import { QuerySchema } from './schemas/query.schema.js';
import { isEntryFresh } from './cache/util.js';
import { computeSchemaFingerprint } from './cache/hash.js';
import { VexError } from './errors.js';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type VexHandlerConfig = {
  engine: QueryEngine;
  entities?: string[];
  // Replay-only posture (production): requests needing generation fail
  // with 'locked'; fingerprint management (PATCH/DELETE) is refused too.
  locked?: boolean;
};

export type DiscoveryFingerprint = {
  fingerprint: string;
  protected: boolean;
  schemaFresh: boolean;
  intent?: string;
  createdAt: number;
  lastUsedAt?: number;
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

const listFingerprints = async (engine: QueryEngine): Promise<DiscoveryFingerprint[]> => {
  if (engine.cache.entries === undefined) return [];
  const schema = engine.getSchema();
  const current = schema !== undefined ? computeSchemaFingerprint(schema) : undefined;
  const rows = await engine.cache.entries();
  return rows
    .filter(({ key, entry }) => entry.kind === 'ok' && !key.startsWith('neg:'))
    .map(({ key, entry }) => ({
      fingerprint: key,
      protected: entry.protected === true,
      schemaFresh: isEntryFresh(entry, current),
      ...(entry.intent !== undefined ? { intent: entry.intent } : {}),
      createdAt: entry.createdAt,
      ...(entry.lastUsedAt !== undefined ? { lastUsedAt: entry.lastUsedAt } : {}),
    }));
};

export const handleDiscovery = async (config: VexHandlerConfig): Promise<DiscoveryResponse> => {
  const { engine, entities: entityFilter } = config;
  const filtered = filterSchema(engine.getSchema(), entityFilter);
  const fingerprints = await listFingerprints(engine);
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
    const response = await engine.execute(parsed.data, {
      scope,
      entities: config.entities,
      ...(config.locked === true ? { locked: true } : {}),
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
  if (entry === undefined || entry.kind !== 'ok') {
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
