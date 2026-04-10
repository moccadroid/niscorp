// ═══════════════════════════════════════════════════════════
// In-memory EventLog — default implementation
// ═══════════════════════════════════════════════════════════

import type { BusEvent } from '../types';
import type { EventLog, EventLogReadOptions } from './types';

export const createMemoryEventLog = (): EventLog => {
  const byWorkflow = new Map<string, BusEvent[]>();
  // Events without a workflowId are kept in a single bucket so they
  // can still be inspected globally for debugging.
  const orphans: BusEvent[] = [];

  return {
    append: async (event) => {
      const wf = event.meta.workflowId;
      if (wf === undefined) {
        orphans.push(event);
        return;
      }
      let bucket = byWorkflow.get(wf);
      if (!bucket) {
        bucket = [];
        byWorkflow.set(wf, bucket);
      }
      bucket.push(event);
    },
    read: async (workflowId, options: EventLogReadOptions = {}) => {
      const bucket = byWorkflow.get(workflowId) ?? [];
      const since = options.since;
      const limit = options.limit;
      let view = since !== undefined ? bucket.filter((e) => e.meta.timestamp >= since) : bucket;
      if (limit !== undefined) view = view.slice(0, limit);
      return view;
    },
  };
};
