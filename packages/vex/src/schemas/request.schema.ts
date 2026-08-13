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
  // The ONE cache identity. Server-minted (`fp_…`) when absent — returned in
  // meta.cache.fingerprint, an immutable pin. Caller-chosen strings are
  // mutable named slots: the name is yours, its content follows your request.
  // Alone → replay-or-error. With intent/shape → hit when the stored request
  // matches, regenerate-and-replace when it differs (409 when protected).
  fingerprint: z.string().min(1).optional(),
  intent: z.string().optional(),
  shape: z.unknown().optional(),
  context: ContextSchema.default({}),
});

export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export type CacheMeta = {
  hit: boolean;
  // The entry's identity — minted (`fp_…`) or the caller's own name.
  fingerprint?: string;
  // True when this execution regenerated and REPLACED a named slot whose
  // stored request no longer matched.
  replaced?: boolean;
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
  // Mirrors ParamSlot['type'] (adapters/adapter.types.ts) — the contract a
  // caller reads is built from the slots the compiler bound, one for one.
  type: 'string' | 'number' | 'boolean' | 'string[]' | 'number[]' | 'json';
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
  | 'fingerprint_protected'
  | 'locked'
  | 'unsatisfiable';
