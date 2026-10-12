import { z } from 'zod';
import type { Envelope, SignalClient } from '../types';
import type { CortexEvent } from '../events/types';
import { defineTool, type ToolDefinition } from '../tool/define-tool';
import { trustErased } from '../utils/trust';
import type { AgentDefinition } from '../agent/define-agent';
import type { RunHandle } from '../agent/run';
import type { ErasedAgent, ErasedRunOptions } from './types';

const DEFAULT_AGENT_TOOL_TIMEOUT_MS = 300_000;

export type AgentToolStartContext = {
  signal: AbortSignal;
  agentPath: ReadonlyArray<string>;
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

export const asTool = <TData, TDeps>(
  agent: AgentDefinition<TData, TDeps>,
  ...args: undefined extends TDeps ? [options?: AsToolOptions<TData, TDeps>] : [options: AsToolOptions<TData, TDeps>]
): ToolDefinition => {
  const options = args[0];
  // AgentDefinition.run cannot be called while TDeps is unresolved: its argument
  // tuple is conditional on it. AsToolOptions has already type-checked the deps.
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
