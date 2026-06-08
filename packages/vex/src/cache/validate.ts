import { QuerySchema } from '../schemas/query.schema.js';
import type { CacheEntry } from './cache.types.js';

// ───────────────────────────────────────────────────────────────
// Entry validation
//
// Every persisted (jsonb) write is validated before it lands, and every
// entry promoted from a durable backend into memory is validated before
// it is trusted. This is the guard that keeps a corrupt or
// schema-drifted row from poisoning the cache. It is deliberately cheap
// and synchronous so it can sit on the write path and the promotion
// path without adding a round-trip.
// ───────────────────────────────────────────────────────────────

// Prism does not export a Zod schema for the *compiled* IR (only for
// the input Config), so we validate structurally. The runtime-attached
// `__op`/`__segments` handlers are non-enumerable and do not survive a
// JSON round-trip — that is fine, Prism's evaluator falls back to its
// discriminant chain when they are absent. We only assert the
// serializable skeleton is intact.
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

/**
 * Returns `null` if the entry is valid, or a human-readable reason
 * string if it is not.
 */
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
    const parsed = QuerySchema.safeParse(entry.dsl);
    if (!parsed.success) return `invalid dsl: ${parsed.error.message}`;
    if (entry.prismIr !== undefined && !isCompiledIr(entry.prismIr)) {
      return 'invalid prismIr: not a CompiledIr structure';
    }
    return null;
  }

  return `unknown cache entry kind: ${String((entry as { kind: unknown }).kind)}`;
};
