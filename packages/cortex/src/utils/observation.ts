// ═══════════════════════════════════════════════════════════
// Shared observation recording utility
// ═══════════════════════════════════════════════════════════
//
// Used by both the tool loop and the plan executor to emit
// observation events. Always workflow-scoped — emits via
// workflow.emit so meta is bound consistently.

import type { Observation } from '../schemas';
import type { WorkflowContext } from '../manifold/workflow-context';
import { CortexTopics } from '../topics';

export const recordObservation = (
  workflow: WorkflowContext,
  observation: Observation,
): void => {
  workflow.emit(CortexTopics.observationRecorded, observation);
  if (observation.stepKind === 'use_tool') {
    workflow.emit(CortexTopics.toolObserved, observation);
  }
};
