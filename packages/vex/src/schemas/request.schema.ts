import { z } from 'zod';
import type { JsonValue } from '@niscorp/prism';

export const RESERVED_CONTEXT_KEYS = new Set<string>(['sortBy', 'sortDir']);

export const ContextSchema = z
  .object({
    sortBy: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .catchall(z.unknown())
  .describe(
    'Caller runtime values. Keys referenced from the DSL via { $context: "key" } are bound as SQL parameters. `sortBy` (an entity.field, schema-validated) and `sortDir` ("asc"|"desc") are reserved keys that drive ORDER BY directly and are never bound as parameters.',
  );

export const QueryRequestSchema = z.object({
  fingerprint: z.string().min(1).optional(),
  intent: z.string().optional(),
  shape: z.unknown().optional(),
  context: ContextSchema.default({}),
});

export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export type CacheMeta = {
  hit: boolean;
  fingerprint?: string;
  replaced?: boolean;
  intent?: string;
};

export type TimingMeta = {
  agentMs?: number;
  executionMs: number;
  mappingMs?: number;
  transformMs?: number;
};

export type ContextMeta = {
  // Mirrors ParamSlot['type'] (adapters/adapter.types.ts). Absent on an optional
  // key that was not supplied: no slot bound it.
  type?: 'string' | 'number' | 'boolean' | 'string[]' | 'number[]' | 'json';
  kind: 'context' | 'scope' | 'semantic';
  optional?: true;
  absent?: true;
};

export type QueryResponse = {
  result: JsonValue;
  meta: {
    cache: CacheMeta;
    context: Record<string, ContextMeta>;
    timing?: TimingMeta;
    warnings?: string[];
    missingContext?: string[];
  };
};

export type QueryErrorResponse = {
  error: string;
  message: string;
  details?: {
    suggestion?: string;
    options?: string[];
  };
};

export type QueryErrorCode =
  | 'invalid_request'
  | 'invalid_dsl'
  | 'missing_scope'
  | 'scope_denied'
  | 'missing_context'
  | 'execution_error'
  | 'agent_failed'
  | 'cache_miss'
  | 'fingerprint_protected'
  | 'locked'
  | 'unsatisfiable';
