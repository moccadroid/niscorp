// tell_topic node handler

import type { TellTopicNode } from '../../schemas';
import type { PlanExecutorDeps, PlanExecutorInput, NodeHandlerResult } from './types';
import { now } from './types';

export const executeTellTopic = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  node: TellTopicNode,
): Promise<NodeHandlerResult> => {
  const start = now();
  const workflowId = input.workflow.workflowId;
  deps.bus.emit({
    topic: node.topic,
    payload: node.payload,
    meta: { timestamp: now(), correlationId: workflowId, workflowId },
  });
  return {
    observation: {
      stepKind: 'tell_topic',
      topic: node.topic,
      durationMs: now() - start,
      timestamp: now(),
      workflowId,
      depth: input.depth,
      tick: input.tick,
    },
  };
};
