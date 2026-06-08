import type { CacheBackend, CacheEntry } from './cache.types.js';
import { validateEntry } from './validate.js';
import { computeShapeHash } from './hash.js';
import { fireAndForget } from './util.js';

// ═══════════════════════════════════════════════════════════════
// Tiered cache (L1 in-memory + L2 durable)
//
// Read-through / write-through:
//   - get:   L1 → on miss, L2 → validate → promote into L1.
//   - set:   L1 synchronously + L2 fire-and-forget (off the hot path).
//   - init:  warm-up, per the configured mode (see WarmupMode).
//
// The hot read never validates and never touches L2: every entry in L1
// was validated on the way in (at promotion or at write). Validation
// cost lands only at startup and the occasional L1 miss. An L2 entry
// that fails validation (corrupt / schema-drifted) is evicted from L2,
// not just skipped, so it can't keep failing.
//
// Single-instance only. Multiple processes sharing one L2 would each
// keep their own L1; an entry written by process A is invisible to
// process B's L1 until B restarts (a TTL-based L1 refresh would fix
// this — deliberately deferred).
// ═══════════════════════════════════════════════════════════════

export type WarmupMode =
  /** Load all of L2 into L1 on init (default). Start fully hot. */
  | 'full'
  /** Don't preload; L1 fills on demand via get→promote. Bounded memory. */
  | 'lazy'
  /** Preload only these shapes (by shape hash); lazy-fill the rest. */
  | { mode: 'partial'; shapes: unknown[] };

export type TieredCacheConfig = {
  /** Fast, volatile tier (e.g. createMemoryCache()). */
  l1: CacheBackend;
  /** Durable source of truth (e.g. createPostgresCache(...)). */
  l2: CacheBackend;
  /** Warm-up strategy run by init(). Default: 'full'. */
  warmup?: WarmupMode;
  /** Called on background failures (async L2 writes) and dropped invalid entries. */
  onError?: (err: unknown) => void;
};

export type TieredCache = CacheBackend & {
  init: () => Promise<void>;
};

export const createTieredCache = (config: TieredCacheConfig): TieredCache => {
  const { l1, l2, onError } = config;
  const warmup: WarmupMode = config.warmup ?? 'full';

  // Validate, then lift an entry into L1. Returns false if the L2 entry
  // is corrupt or schema-drifted — and evicts it from L2 so it can't
  // keep failing future reads.
  const promote = async (key: string, entry: CacheEntry): Promise<boolean> => {
    const error = validateEntry(entry);
    if (error !== null) {
      const wrapped = new Error(`[vex:cache:tiered] evicting invalid L2 entry for key "${key}": ${error}`);
      if (onError) onError(wrapped);
      else console.error(wrapped);
      fireAndForget(l2.delete(key), onError);
      return false;
    }
    await l1.set(key, entry);
    return true;
  };

  const init = async (): Promise<void> => {
    await l2.init?.();
    await l1.init?.();

    if (warmup === 'lazy') return;

    if (typeof warmup === 'object' && warmup.mode === 'partial') {
      for (const shape of warmup.shapes) {
        const key = computeShapeHash(shape);
        const entry = await l2.get(key);
        if (entry !== undefined) await promote(key, entry);
      }
      return;
    }

    // 'full' — load everything. Prefer a bulk read (no N+1) when L2
    // supports it; otherwise fall back to key-by-key.
    if (l2.entries) {
      const all = await l2.entries();
      for (const { key, entry } of all) await promote(key, entry);
      return;
    }
    const keys = await l2.keys();
    for (const key of keys) {
      const entry = await l2.get(key);
      if (entry !== undefined) await promote(key, entry);
    }
  };

  const get = async (key: string): Promise<CacheEntry | undefined> => {
    const hit = await l1.get(key);
    if (hit !== undefined) return hit;

    const fromL2 = await l2.get(key);
    if (fromL2 === undefined) return undefined;

    const ok = await promote(key, fromL2);
    return ok ? fromL2 : undefined;
  };

  const set = async (key: string, entry: CacheEntry): Promise<void> => {
    await l1.set(key, entry);
    fireAndForget(l2.set(key, entry), onError);
  };

  const del = async (key: string): Promise<void> => {
    await l1.delete(key);
    fireAndForget(l2.delete(key), onError);
  };

  const clear = async (): Promise<void> => {
    await l1.clear();
    fireAndForget(l2.clear(), onError);
  };

  // L1 holds the full set after warm-up and receives every write, so it
  // is the authoritative key list for the running process.
  const keys = async (): Promise<string[]> => l1.keys();

  return { init, get, set, delete: del, clear, keys };
};
