// reflect node handler

import type { ReflectNode } from '../../schemas';
import type { PlanExecutorDeps, PlanExecutorInput, NodeHandlerResult } from './types';
import { now } from './types';

export const executeReflect = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  node: ReflectNode,
): Promise<NodeHandlerResult> => {
  const start = now();
  const workflowId = input.workflow.workflowId;
  const content = node.content;
  const key = 'cortex.scratch.reflections';
  const existing = (await deps.stateStore.get(workflowId, key)) ?? [];
  const list = Array.isArray(existing) ? existing : [];
  list.push({ content, tick: input.tick, timestamp: now() });
  await deps.stateStore.set(workflowId, key, list);
  return {
    observation: {
      stepKind: 'reflect',
      durationMs: now() - start,
      result: { content },
      timestamp: now(),
      workflowId,
      depth: input.depth,
      tick: input.tick,
    },
  };
};
