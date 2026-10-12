import type { CacheBackend, CacheEntry } from './cache.types.js';
import { validateEntry } from './validate.js';
import { fireAndForget } from './util.js';

export type WarmupMode =
  | 'full'
  | 'lazy'
  | { mode: 'partial'; fingerprints: string[] };

export type TieredCacheConfig = {
  l1: CacheBackend;
  l2: CacheBackend;
  warmup?: WarmupMode;
  onError?: (err: unknown) => void;
};

export type TieredCache = CacheBackend & {
  init: () => Promise<void>;
};

export const createTieredCache = (config: TieredCacheConfig): TieredCache => {
  const { l1, l2, onError } = config;
  const warmup: WarmupMode = config.warmup ?? 'full';

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
      for (const key of warmup.fingerprints) {
        const entry = await l2.get(key);
        if (entry !== undefined) await promote(key, entry);
      }
      return;
    }

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

  const keys = async (): Promise<string[]> => l1.keys();

  return { init, get, set, delete: del, clear, keys, ...(l2.sequence !== undefined ? { sequence: l2.sequence } : {}) };
};
