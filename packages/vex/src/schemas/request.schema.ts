import { z } from 'zod';
import type { JsonValue } from '@niscorp/prism';

// Context keys the engine consumes directly (for ORDER BY) instead of binding as
// SQL parameters. A `{ $context: 'sortBy' }` ref is rejected at compile so these
// can never reach the param path.
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
  intent: z.string().optional(),
  shape: z.unknown(),
  context: ContextSchema.default({}),
});

export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export type CacheMeta = {
  hit: boolean;
  key?: string;
  // The intent stored with the cached query (on a hit) or the request's own intent
  // (on a miss) — descriptive only, so a caller can see what the query is for.
  intent?: string;
};

export type TimingMeta = {
  agentMs?: number;
  executionMs: number;
  mappingMs?: number;
  transformMs?: number;
};

export type ContextMeta = {
  type: 'string' | 'number' | 'boolean' | 'string[]' | 'number[]';
  kind: 'context' | 'scope' | 'semantic';
};

export type QueryResponse = {
  // Whatever the Prism mapping produced over the full row set: an array (the
  // common case — a `$map` or identity over `$.result`), a single object (a
  // detail picking `$.result[0]`), or a scalar (an aggregate). Vex no longer
  // forces an array — the mapping owns the output shape.
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
  | 'unsatisfiable';
