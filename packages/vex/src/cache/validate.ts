import { QuerySchema } from '../schemas/query.schema.js';
import { MutationDefinitionSchema } from '../mutations/schema.js';
import { depthRefusal, exceedsDepth } from '@niscorp/strata';
import type { CacheEntry } from './cache.types.js';
import { isRefresh } from './cache.types.js';

// Prism exports no schema for a compiled IR, so only its serializable skeleton is checked.
const isCompiledIr = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') return false;
  const ir = value as Record<string, unknown>;
  if (ir['irVersion'] !== 1) return false;
  if (!('core' in ir)) return false;
  const tables = ir['tables'];
  if (tables === null || typeof tables !== 'object') return false;
  const t = tables as Record<string, unknown>;
  return Array.isArray(t['paths']) && Array.isArray(t['strings']);
};

export const validateEntry = (entry: CacheEntry): string | null => {
  if (typeof entry.createdAt !== 'number') return 'createdAt must be a number';
  if (entry.expiresAt !== undefined && typeof entry.expiresAt !== 'number') {
    return 'expiresAt must be a number when present';
  }

  if (entry.kind === 'unsatisfiable') {
    return typeof entry.reason === 'string' && entry.reason.length > 0
      ? null
      : 'unsatisfiable entry requires a non-empty reason';
  }

  if (entry.kind === 'ok') {
    if (exceedsDepth(entry.dsl)) return `invalid dsl: ${depthRefusal()}`;
    const parsed = QuerySchema.safeParse(entry.dsl);
    if (!parsed.success) return `invalid dsl: ${parsed.error.message}`;
    if (entry.prismIr !== undefined && !isCompiledIr(entry.prismIr)) {
      return 'invalid prismIr: not a CompiledIr structure';
    }
    if (entry.refresh !== undefined && !isRefresh(entry.refresh)) {
      return `invalid refresh: ${String(entry.refresh)}`;
    }
    return null;
  }

  if (entry.kind === 'mutation') {
    if (exceedsDepth(entry.mutation)) return `invalid mutation: ${depthRefusal()}`;
    const parsed = MutationDefinitionSchema.safeParse(entry.mutation);
    return parsed.success ? null : `invalid mutation: ${parsed.error.message}`;
  }

  return `unknown cache entry kind: ${String((entry as { kind: unknown }).kind)}`;
};
