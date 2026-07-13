// ═══════════════════════════════════════════════════════════
// asTool — consume an agent as an ordinary tool
// ═══════════════════════════════════════════════════════════
//
// Delegation is a tool call (DESIGN.md §8): the wrapped agent runs
// with the parent's agentPath extended, its events forward into the
// parent's stream, and its envelope maps to the tool result —
// `data` when present, else `response`. No plan-node interpreter.

import { z } from 'zod';
import type { Envelope, SignalClient } from '../types';
import type { CortexEvent } from '../events/types';
import { defineTool, type ToolDefinition } from '../tool/define-tool';
import { trustErased } from '../utils/trust';
import type { AgentDefinition } from '../agent/define-agent';
import type { RunHandle } from '../agent/run';
import type { ErasedAgent, ErasedRunOptions } from './types';

// Agents are slow tools — give them real time by default.
const DEFAULT_AGENT_TOOL_TIMEOUT_MS = 300_000;

export type AgentToolStartContext = {
  signal: AbortSignal;
  agentPath: ReadonlyArray<string>;
  // The parent's forward sink — pass as the child's RunOptions.onEvent
  // so it subscribes before the child's run-start fires.
  onEvent: (event: CortexEvent) => void;
};

export type AgentToolCore<TData> = {
  id: string;
  description: string;
  timeoutMs: number;
  start: (input: string, context: AgentToolStartContext) => RunHandle<TData>;
  select?: (output: Envelope<TData>) => unknown;
};

export const buildAgentTool = <TData>(core: AgentToolCore<TData>): ToolDefinition =>
  defineTool({
    id: core.id,
    name: core.id,
    description: core.description,
    timeoutMs: core.timeoutMs,
    input: z.object({
      input: z.string().describe('The task for the delegate agent, fully self-contained.'),
    }),
    execute: async ({ input }, ctx) => {
      const handle = core.start(input, {
        signal: ctx.signal,
        agentPath: ctx.agentPath,
        onEvent: ctx.forward,
      });
      const result = await handle.result;
      if (!result.ok) return `error: ${result.error.message}`;
      if (core.select) return core.select(result.output);
      return result.output.data !== undefined ? result.output.data : (result.output.response ?? '');
    },
  });

export type AsToolOptions<TData, TDeps> = {
  id?: string;
  description?: string;
  llm?: SignalClient;
  timeoutMs?: number;
  select?: (output: Envelope<TData>) => unknown;
} & (undefined extends TDeps ? { deps?: TDeps } : { deps: TDeps });

// Typed variant for direct composition (vex agent → architect tool).
export const asTool = <TData, TDeps>(
  agent: AgentDefinition<TData, TDeps>,
  ...args: undefined extends TDeps ? [options?: AsToolOptions<TData, TDeps>] : [options: AsToolOptions<TData, TDeps>]
): ToolDefinition => {
  const options = args[0];
  // Erased call: the rest-tuple signature of AgentDefinition.run cannot
  // be invoked with an unresolved TDeps; the erased view can. Deps were
  // type-checked at THIS boundary via AsToolOptions.
  const erased = trustErased<ErasedAgent<TData>>(agent);
  return buildAgentTool<TData>({
    id: options?.id ?? agent.agentId,
    description:
      options?.description ?? agent.config.description ?? `Delegate the task to agent "${agent.agentId}".`,
    timeoutMs: options?.timeoutMs ?? DEFAULT_AGENT_TOOL_TIMEOUT_MS,
    ...(options?.select && { select: options.select }),
    start: (input, context) => {
      const runOptions: ErasedRunOptions = {
        ...(options?.deps !== undefined && { deps: options.deps }),
        ...(options?.llm && { llm: options.llm }),
        signal: context.signal,
        agentPath: context.agentPath,
        onEvent: context.onEvent,
      };
      return erased.run(input, runOptions);
    },
  });
};
