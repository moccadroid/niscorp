import type { CacheEntry } from './cache.types.js';

export const fireAndForget = (p: Promise<unknown>, onError?: (err: unknown) => void): void => {
  void p.catch((err) => {
    if (onError) onError(err);
    else console.error('[vex:cache]', err);
  });
};

export const TOUCH_EVERY_MS = 60_000;

export const isTouchDue = (entry: CacheEntry, now: number): boolean =>
  entry.lastUsedAt === undefined || now - entry.lastUsedAt >= TOUCH_EVERY_MS;

export const isEntryFresh = (entry: CacheEntry, currentFingerprint?: string): boolean => {
  const expired = entry.expiresAt !== undefined && entry.expiresAt <= Date.now();
  const stale =
    entry.schemaFingerprint !== undefined &&
    currentFingerprint !== undefined &&
    entry.schemaFingerprint !== currentFingerprint;
  return !expired && !stale;
};

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
    if (entry.protected === true) continue;
    const lastAlive = entry.lastUsedAt ?? entry.createdAt;
    if (lastAlive < cutoff) {
      await cache.delete(key);
      evicted += 1;
    }
  }
  return evicted;
};
