// ═══════════════════════════════════════════════════════════
// Pluggable persistence interfaces
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §10: state and event log are pluggable. The
// in-memory implementations in this directory are for development
// and tests. Production wires its own backends.

import type { BusEvent } from '../types';

export type StateStore = {
  get: (workflowId: string, key: string) => Promise<unknown>;
  set: (workflowId: string, key: string, value: unknown) => Promise<void>;
  delete: (workflowId: string, key: string) => Promise<void>;
  clear: (workflowId: string) => Promise<void>;
  // Returns a snapshot of all keys for a workflow. Used by producers
  // (BuildContext.state) and by debugging tools.
  snapshot: (workflowId: string) => Promise<ReadonlyMap<string, unknown>>;
};

export type EventLogReadOptions = {
  since?: number;
  limit?: number;
};

export type EventLog = {
  append: (event: BusEvent) => Promise<void>;
  read: (workflowId: string, options?: EventLogReadOptions) => Promise<BusEvent[]>;
};
