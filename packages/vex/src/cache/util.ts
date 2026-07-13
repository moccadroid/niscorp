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

/**
 * Lifetime = usage. Evicts unprotected entries that have not been
 * replayed within `maxIdleMs` (falling back to createdAt for entries
 * never touched). Protected entries never sweep. Run it on whatever
 * cadence suits the app (startup, a timer, a cron) — it is hygiene,
 * not a correctness requirement: entries are single-digit KB.
 */
export const sweepCache = async (
  cache: {
    entries?: () => Promise<Array<{ key: string; entry: CacheEntry }>>;
    keys: () => Promise<string[]>;
    get: (key: string) => Promise<CacheEntry | undefined>;
    delete: (key: string) => Promise<void>;
  },
  options: { maxIdleMs: number },
): Promise<number> => {
  const cutoff = Date.now() - options.maxIdleMs;
  const rows = cache.entries !== undefined
    ? await cache.entries()
    : await Promise.all((await cache.keys()).map(async (key) => ({ key, entry: await cache.get(key) })));

  let evicted = 0;
  for (const { key, entry } of rows) {
    if (entry === undefined) continue;
    if (entry.kind === 'ok' && entry.protected === true) continue;
    const lastAlive = entry.lastUsedAt ?? entry.createdAt;
    if (lastAlive < cutoff) {
      await cache.delete(key);
      evicted += 1;
    }
  }
  return evicted;
};
