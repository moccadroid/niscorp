// wait node handler

import type { WaitNode } from '../../schemas';
import type { PlanExecutorDeps, PlanExecutorInput, NodeHandlerResult } from './types';
import { now } from './types';

export const executeWait = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  node: WaitNode,
): Promise<NodeHandlerResult> => {
  const start = now();
  const workflowId = input.workflow.workflowId;
  const topic = node.topic;
  const timeoutMs = node.timeoutMs ?? 30_000;
  try {
    const event = await deps.bus.waitFor(topic, {
      timeoutMs,
      signal: input.workflow.abort.signal,
    });
    return {
      observation: {
        stepKind: 'wait',
        topic,
        durationMs: now() - start,
        result: event.payload,
        timestamp: now(),
        workflowId,
        depth: input.depth,
        tick: input.tick,
      },
    };
  } catch (e) {
    return {
      observation: {
        stepKind: 'wait',
        topic,
        durationMs: now() - start,
        error: e instanceof Error ? e.message : String(e),
        timestamp: now(),
        workflowId,
        depth: input.depth,
        tick: input.tick,
      },
    };
  }
};
