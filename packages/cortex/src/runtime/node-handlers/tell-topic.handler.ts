// tell_topic node handler

import type { TellTopicNode } from '../../schemas';
import type { PlanExecutorDeps, PlanExecutorInput, NodeHandlerResult } from './types';
import { now } from './types';

export const executeTellTopic = async (
  _deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  node: TellTopicNode,
): Promise<NodeHandlerResult> => {
  const start = now();
  input.workflow.emit(node.topic, node.payload);
  return {
    observation: {
      stepKind: 'tell_topic',
      topic: node.topic,
      durationMs: now() - start,
      timestamp: now(),
      workflowId: input.workflow.workflowId,
      depth: input.depth,
      tick: input.tick,
    },
  };
};
