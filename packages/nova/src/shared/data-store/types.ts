import type { Unsubscribe } from '../common';

// ═══════════════════════════════════════════════════════════
// Generic data store types.
// ═══════════════════════════════════════════════════════════

export type DataStore<T extends Record<string, unknown> = Record<string, unknown>> = {
  get: () => T;
  update: (updater: (current: T) => T) => void;
  subscribe: (handler: (data: T) => void) => Unsubscribe;
};

export type DataStoreView<T extends Record<string, unknown> = Record<string, unknown>> = {
  get: () => T;
  subscribe: (handler: (data: T) => void) => Unsubscribe;
};
