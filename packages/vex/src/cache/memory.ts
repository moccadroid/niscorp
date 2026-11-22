import type { CacheBackend, CacheEntry } from './cache.types.js';

export const createMemoryCache = (): CacheBackend => {
  const store = new Map<string, CacheEntry>();

  const get = async (key: string): Promise<CacheEntry | undefined> => {
    return store.get(key);
  };

  const set = async (key: string, entry: CacheEntry): Promise<void> => {
    store.set(key, entry);
  };

  const del = async (key: string): Promise<void> => {
    store.delete(key);
  };

  const clear = async (): Promise<void> => {
    store.clear();
  };

  const keys = async (): Promise<string[]> => {
    return [...store.keys()];
  };

  const entries = async (): Promise<Array<{ key: string; entry: CacheEntry }>> => {
    return [...store.entries()].map(([key, entry]) => ({ key, entry }));
  };

  const touch = async (key: string, lastUsedAt: number): Promise<void> => {
    const entry = store.get(key);
    if (entry !== undefined) store.set(key, { ...entry, lastUsedAt });
  };

  return { get, set, delete: del, clear, keys, entries, touch };
};
