// use_tool node handler

import type { UseToolNode, Observation } from '../../schemas';
import type { ToolContext } from '../../tool/define-tool';
import type { PlanExecutorDeps, PlanExecutorInput, NodeHandlerResult } from './types';
import { checkTool } from '../gate';
import { withTimeout, DEFAULT_TOOL_TIMEOUT_MS } from '../../utils/timeout';
import { now, denialMessage } from './types';

export const executeUseTool = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  node: UseToolNode,
): Promise<NodeHandlerResult> => {
  const start = now();
  const workflowId = input.workflow.workflowId;
  const gate = checkTool({
    workflow: input.workflow,
    registry: deps.registry,
    ledger: deps.ledger,
    toolId: node.toolId,
  });
  if (!gate.allowed) {
    return {
      observation: {
        stepKind: 'use_tool',
        toolId: node.toolId,
        durationMs: now() - start,
        error: denialMessage(gate),
        timestamp: now(),
        workflowId,
        depth: input.depth,
        tick: input.tick,
      },
    };
  }
  const tool = deps.registry.requireTool(node.toolId);
  const ctx: ToolContext = {
    workflowId,
    agentId: input.agentId,
    signal: input.workflow.abort.signal,
    bus: deps.bus,
  };
  try {
    const parsed = tool.config.input.safeParse(node.input);
    if (!parsed.success) {
      return {
        observation: {
          stepKind: 'use_tool',
          toolId: tool.toolId,
          durationMs: now() - start,
          error: `input_invalid: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
          timestamp: now(),
          workflowId,
          depth: input.depth,
          tick: input.tick,
        },
      };
    }
    const timeout = node.timeoutMs ?? tool.config.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
    const result = await withTimeout(
      tool.config.execute(parsed.data, ctx),
      timeout,
      `tool ${node.toolId}`,
    );
    deps.ledger.addToolCall(workflowId);
    return {
      observation: {
        stepKind: 'use_tool',
        toolId: tool.toolId,
        durationMs: now() - start,
        result,
        timestamp: now(),
        workflowId,
        depth: input.depth,
        tick: input.tick,
      },
    };
  } catch (e) {
    return {
      observation: {
        stepKind: 'use_tool',
        toolId: tool.toolId,
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
