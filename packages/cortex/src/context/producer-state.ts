// ═══════════════════════════════════════════════════════════
// ProducerState — small per-producer mutable map
// ═══════════════════════════════════════════════════════════
//
// One ProducerState per (producer.id, workflowId). Lives in memory
// for the lifetime of the workflow. The runtime creates and disposes
// these on workflow start / end.

import type { ProducerState } from './types';

export const createProducerState = (): ProducerState => {
  const map = new Map<string, unknown>();
  const FLAG = Symbol('flag');
  return {
    get: (key) => map.get(key),
    set: (key, value) => {
      map.set(key, value);
    },
    has: (key) => map.has(key),
    flag: (key) => {
      map.set(key, FLAG);
    },
    delete: (key) => {
      map.delete(key);
    },
    toObject: () => Object.fromEntries(map.entries()),
  };
};
