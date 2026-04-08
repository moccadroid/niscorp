import type { Unsubscribe } from '../common';
import type { DataStore } from './types';

// ═══════════════════════════════════════════════════════════
// createDataStore — mutations live outside the store and are
// applied via `store.update(curr => applyMutations(curr, list))`.
// ═══════════════════════════════════════════════════════════

export const createDataStore = <T extends Record<string, unknown> = Record<string, unknown>>(
  initial: T,
): DataStore<T> => {
  let current: T = { ...initial };
  const subscribers: Array<(data: T) => void> = [];

  const get = (): T => current;

  const update = (updater: (current: T) => T): void => {
    current = updater(current);
    for (const handler of subscribers.slice()) {
      try {
        handler(current);
      } catch {
        // handler errors must not crash the store
      }
    }
  };

  const subscribe = (handler: (data: T) => void): Unsubscribe => {
    subscribers.push(handler);
    return (): void => {
      const idx = subscribers.indexOf(handler);
      if (idx >= 0) subscribers.splice(idx, 1);
    };
  };

  return { get, update, subscribe };
};
