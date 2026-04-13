// ═══════════════════════════════════════════════════════════
// Shared observation recording utility
// ═══════════════════════════════════════════════════════════
//
// Used by both the tool loop and the plan executor to emit
// observation events on the bus. One function, one place.

import type { Bus } from '../types';
import type { Observation } from '../schemas';
import { CortexTopics } from '../topics';

export const recordObservation = (
  bus: Bus,
  workflowId: string,
  observation: Observation,
): void => {
  // All observations — every step kind.
  bus.emit({
    topic: CortexTopics.observationRecorded,
    payload: observation,
    meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
  });
  // Tool-specific — only when a tool was actually called.
  if (observation.stepKind === 'use_tool') {
    bus.emit({
      topic: CortexTopics.toolObserved,
      payload: observation,
      meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
    });
  }
};
