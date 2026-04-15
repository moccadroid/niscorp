// ask_agent node handler

import type { AskAgentNode } from '../../schemas';
import type { PlanExecutorDeps, PlanExecutorInput, NodeHandlerResult } from './types';
import { checkAgent } from '../gate';
import { now, denialMessage } from './types';

export const executeAskAgent = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  node: AskAgentNode,
): Promise<NodeHandlerResult> => {
  const start = now();
  const workflowId = input.workflow.workflowId;
  const targetId = node.agentId;
  const gate = checkAgent({
    workflow: input.workflow,
    registry: deps.registry,
    ledger: deps.ledger,
    agentId: targetId,
  });
  if (!gate.allowed) {
    return {
      observation: {
        stepKind: 'ask_agent',
        agentId: targetId,
        durationMs: now() - start,
        error: denialMessage(gate),
        timestamp: now(),
        workflowId,
        depth: input.depth,
        tick: input.tick,
      },
    };
  }
  const result = await deps.delegate({
    agentId: targetId,
    input: node.input,
    workflowId,
    parentDepth: input.depth,
  });
  if (!result.ok) {
    return {
      observation: {
        stepKind: 'ask_agent',
        agentId: targetId,
        durationMs: now() - start,
        error: result.error.message,
        timestamp: now(),
        workflowId,
        depth: input.depth,
        tick: input.tick,
      },
    };
  }
  return {
    observation: {
      stepKind: 'ask_agent',
      agentId: targetId,
      durationMs: now() - start,
      result: result.data,
      timestamp: now(),
      workflowId,
      depth: input.depth,
      tick: input.tick,
    },
  };
};
