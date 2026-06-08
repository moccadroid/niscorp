import { z } from 'zod';
import type { QueryEngine } from './types.js';
import type { ScopeValues } from './scope/scope.types.js';
import type { CacheMode } from './cache/cache.types.js';
import type { DatabaseSchema, EntitySchema } from './schemas/database.schema.js';
import { QueryRequestSchema } from './schemas/request.schema.js';
import { QuerySchema } from './schemas/query.schema.js';
import { VexError } from './errors.js';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type VexHandlerConfig = {
  engine: QueryEngine;
  entities?: string[];
};

export type DiscoveryResponse = {
  vex: string;
  description: string;
  entities: DiscoveryEntity[];
  query: {
    method: string;
    accepts: string;
    body: Record<string, DiscoveryField>;
    queryParams: Record<string, DiscoveryParam>;
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

type DiscoveryParam = {
  values: string[];
  default: string;
  description: string;
};

// ═══════════════════════════════════════════════════════════════
// Discovery
// ═══════════════════════════════════════════════════════════════

const filterSchema = (schema: DatabaseSchema | undefined, entities?: string[]): EntitySchema[] => {
  if (schema === undefined) return [];
  if (entities === undefined || entities.length === 0) return schema.entities;
  return schema.entities.filter(e => entities.includes(e.name));
};

export const handleDiscovery = (config: VexHandlerConfig): DiscoveryResponse => {
  const { engine, entities: entityFilter } = config;
  const filtered = filterSchema(engine.getSchema(), entityFilter);

  return {
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
        intent: {
          type: 'string',
          required: false,
          description: 'Natural language description of what data you need',
        },
        shape: {
          type: 'any',
          required: true,
          description: 'Example of the response structure — use empty strings, zeros, booleans as type indicators',
        },
        context: {
          type: 'Record<string, unknown>',
          required: false,
          description: 'Runtime parameters referenced in filters as { $context: "key" }',
        },
      },
      queryParams: {
        cache: {
          values: ['use', 'refresh', 'bypass', 'only'],
          default: 'use',
          description: 'Cache behavior — use (default), refresh (regenerate), bypass (skip), only (fail on miss)',
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
  cacheMode: CacheMode,
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

  if (parsed.data.shape === undefined || parsed.data.shape === null) {
    return {
      status: 400,
      body: {
        error: 'invalid_request',
        message: 'Missing required field: shape',
      },
    };
  }

  try {
    const response = await engine.execute(parsed.data, { scope, cache: cacheMode, entities: config.entities });
    return { status: 200, body: response };
  } catch (err) {
    if (err instanceof VexError) {
      return {
        status: 400,
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
