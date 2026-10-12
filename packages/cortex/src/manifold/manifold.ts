import type { Envelope, SignalClient } from '../types';
import type { RunInput } from '../context/assemble';
import type { ToolGate } from '../gates/types';
import type { ToolDefinition } from '../tool/define-tool';
import type { RunHandle } from '../agent/run';
import type { ResolvedPreview } from '../agent/preview';
import { throwConfig } from '../errors/cortex.errors';
import { trustErased } from '../utils/trust';
import { buildAgentTool } from './as-tool';
import type { ErasedAgent, ErasedRunOptions, RunTap } from './types';

export type ManifoldConfig = {
  llm?: SignalClient;
  gates?: ReadonlyArray<ToolGate<unknown>>;
  onRun?: RunTap;
};

export type Registrable = { agentId: string } | { toolId: string };

export type ManifoldAsToolOptions = {
  id?: string;
  description?: string;
  llm?: SignalClient;
  timeoutMs?: number;
  deps?: unknown;
  select?: (output: Envelope<unknown>) => unknown;
};

export type Manifold = {
  register: (...definitions: ReadonlyArray<Registrable>) => void;
  run: <TData = unknown>(agentId: string, input: RunInput, options?: ErasedRunOptions) => RunHandle<TData>;
  preview: (agentId: string, input: RunInput, options?: ErasedRunOptions) => Promise<ResolvedPreview>;
  asTool: (agentId: string, options?: ManifoldAsToolOptions) => ToolDefinition;
  agent: (agentId: string) => ErasedAgent;
  tool: (toolId: string) => ToolDefinition;
  agents: () => ReadonlyArray<ErasedAgent>;
  tools: () => ReadonlyArray<ToolDefinition>;
};

const DEFAULT_AGENT_TOOL_TIMEOUT_MS = 300_000;

export const createManifold = (config: ManifoldConfig = {}): Manifold => {
  const agents = new Map<string, ErasedAgent>();
  const tools = new Map<string, ToolDefinition>();

  const requireAgent = (agentId: string): ErasedAgent => {
    const agent = agents.get(agentId);
    if (!agent) throwConfig(`agent "${agentId}" is not registered on this manifold`);
    return agent;
  };

  const mergedOptions = (agent: ErasedAgent, options: ErasedRunOptions | undefined): ErasedRunOptions => {
    const llm = options?.llm ?? agent.config.llm ?? config.llm;
    const gates = [...(config.gates ?? []), ...(options?.gates ?? [])];
    return {
      ...options,
      ...(llm && { llm }),
      ...(gates.length > 0 && { gates }),
    };
  };

  const run = <TData = unknown>(
    agentId: string,
    input: RunInput,
    options?: ErasedRunOptions,
  ): RunHandle<TData> => {
    const agent = requireAgent(agentId);
    const handle = agent.run(input, mergedOptions(agent, options));
    config.onRun?.(handle);
    return trustErased<RunHandle<TData>>(handle);
  };

  return {
    register: (...definitions): void => {
      for (const definition of definitions) {
        if ('agentId' in definition) {
          if (agents.has(definition.agentId)) throwConfig(`duplicate agent id "${definition.agentId}"`);
          agents.set(definition.agentId, trustErased<ErasedAgent>(definition));
          continue;
        }
        if (tools.has(definition.toolId)) throwConfig(`duplicate tool id "${definition.toolId}"`);
        tools.set(definition.toolId, trustErased<ToolDefinition>(definition));
      }
    },

    run,

    preview: (agentId, input, options) => {
      const agent = requireAgent(agentId);
      return agent.preview(input, mergedOptions(agent, options));
    },

    asTool: (agentId, options): ToolDefinition => {
      const agent = requireAgent(agentId);
      return buildAgentTool<unknown>({
        id: options?.id ?? agent.agentId,
        description:
          options?.description ?? agent.config.description ?? `Delegate the task to agent "${agent.agentId}".`,
        timeoutMs: options?.timeoutMs ?? DEFAULT_AGENT_TOOL_TIMEOUT_MS,
        ...(options?.select && { select: options.select }),
        start: (input, context) => {
          const handle = run(agent.agentId, input, {
            ...(options?.deps !== undefined && { deps: options.deps }),
            ...(options?.llm && { llm: options.llm }),
            signal: context.signal,
            agentPath: context.agentPath,
            onEvent: context.onEvent,
          });
          return handle;
        },
      });
    },

    agent: requireAgent,
    tool: (toolId): ToolDefinition => {
      const tool = tools.get(toolId);
      if (!tool) throwConfig(`tool "${toolId}" is not registered on this manifold`);
      return tool;
    },
    agents: () => [...agents.values()],
    tools: () => [...tools.values()],
  };
};
