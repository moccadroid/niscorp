import type { CacheEntry } from './cache.types.js';

/**
 * Run a promise we don't want to await (background writes, hit bumps,
 * evictions). Failures are routed to `onError` or logged, never thrown
 * into the caller's path.
 */
export const fireAndForget = (p: Promise<unknown>, onError?: (err: unknown) => void): void => {
  void p.catch((err) => {
    if (onError) onError(err);
    else console.error('[vex:cache]', err);
  });
};

/**
 * Pure freshness check (no side effects). An entry is fresh when it is
 * not past its TTL and was written against the current schema. A
 * different fingerprint means the entry's DSL may reference columns that
 * have since changed. Callers decide whether to evict a non-fresh entry.
 */
export const isEntryFresh = (entry: CacheEntry, currentFingerprint?: string): boolean => {
  const expired = entry.expiresAt !== undefined && entry.expiresAt <= Date.now();
  const stale =
    entry.schemaFingerprint !== undefined &&
    currentFingerprint !== undefined &&
    entry.schemaFingerprint !== currentFingerprint;
  return !expired && !stale;
};
