// ═══════════════════════════════════════════════════════════
// In-memory StateStore — default implementation
// ═══════════════════════════════════════════════════════════
//
// One Map per workflow. Simple, sufficient for dev and tests.
// Production users provide their own implementation of StateStore.

import type { StateStore } from './types';

export const createMemoryStateStore = (): StateStore => {
  const stores = new Map<string, Map<string, unknown>>();

  const getStore = (workflowId: string): Map<string, unknown> => {
    let s = stores.get(workflowId);
    if (!s) {
      s = new Map<string, unknown>();
      stores.set(workflowId, s);
    }
    return s;
  };

  return {
    get: async (workflowId, key) => getStore(workflowId).get(key),
    set: async (workflowId, key, value) => {
      getStore(workflowId).set(key, value);
    },
    delete: async (workflowId, key) => {
      getStore(workflowId).delete(key);
    },
    clear: async (workflowId) => {
      stores.delete(workflowId);
    },
    snapshot: async (workflowId) => {
      const s = stores.get(workflowId);
      return s ? new Map(s) : new Map<string, unknown>();
    },
  };
};
