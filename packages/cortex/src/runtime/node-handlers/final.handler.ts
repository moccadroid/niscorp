// final node handler

import type { FinalNode } from '../../schemas';
import type { PlanExecutorInput, NodeHandlerResult } from './types';
import { now } from './types';

export const executeFinal = (
  input: PlanExecutorInput,
  node: FinalNode,
): NodeHandlerResult => {
  const workflowId = input.workflow.workflowId;
  return {
    observation: {
      stepKind: 'final',
      durationMs: 0,
      result: node.result,
      timestamp: now(),
      workflowId,
      depth: input.depth,
      tick: input.tick,
    },
  };
};
