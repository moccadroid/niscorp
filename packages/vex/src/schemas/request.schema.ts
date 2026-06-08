import { z } from 'zod';
import type { Row } from '../adapters/adapter.types.js';

export const QueryRequestSchema = z.object({
  intent: z.string().optional(),
  shape: z.unknown(),
  context: z.record(z.string(), z.unknown()).default({}),
});

export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export type CacheMeta = {
  hit: boolean;
  key?: string;
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
  result: Row[];
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
