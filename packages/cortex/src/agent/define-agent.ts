import type { ZodType } from 'zod';
import type { SignalClient } from '../types';
import type { ContextEntry, Producer, ProducerArgs, RunInput } from '../context/assemble';
import type { PrepareStep, StopCondition, ToolGate, ToolResultHook } from '../gates/types';
import type { ToolPolicy } from '../gates/policy';
import type { ToolDefinition } from '../tool/define-tool';
import type { OutputValidator } from '../loop/loop';
import type { OutputStrategy } from '../types';
import type { ResponseMode } from '../schemas/envelope.schema';
import { throwConfig } from '../errors/cortex.errors';
import { createRun, type RunHandle, type RunOptions } from './run';
import { previewAgent, type ResolvedPreview } from './preview';

export type OutputConfig<TData> = {
  schema?: ZodType<TData>;
  response?: ResponseMode;
  strategy?: 'auto' | OutputStrategy;
  forceTool?: boolean;
  doc?: 'auto' | 'off' | string;
  validate?: OutputValidator<TData>;
};

export type AgentConfig<TData, TDeps> = {
  id: string;
  description?: string;
  llm?: SignalClient;
  // 'step' makes non-streaming calls: some provider and model pairs assemble
  // tool-call arguments more reliably outside streaming.
  transport?: 'stream' | 'step';
  instructions: string | ((args: ProducerArgs<TDeps>) => string);
  context?: ReadonlyArray<ContextEntry | Producer<TDeps>>;
  tools?: ReadonlyArray<ToolDefinition>;
  output?: OutputConfig<TData>;
  toolGates?: ReadonlyArray<ToolGate<TDeps>>;
  onToolResult?: ReadonlyArray<ToolResultHook<TDeps>>;
  prepareStep?: PrepareStep<TDeps>;
  stopWhen?: ReadonlyArray<StopCondition>;
  policy?: ToolPolicy;
};

export type RunArgs<TDeps> = undefined extends TDeps
  ? [options?: RunOptions<TDeps>]
  : [options: RunOptions<TDeps>];

export type AgentDefinition<TData = undefined, TDeps = undefined> = {
  readonly agentId: string;
  readonly config: AgentConfig<TData, TDeps>;
  run: (input: RunInput, ...args: RunArgs<TDeps>) => RunHandle<TData>;
  preview: (input: RunInput, ...args: RunArgs<TDeps>) => Promise<ResolvedPreview>;
};

export const defineAgent = <TData = undefined, TDeps = undefined>(
  config: AgentConfig<TData, TDeps>,
): AgentDefinition<TData, TDeps> => {
  if (config.id.length === 0) throwConfig('agent id must not be empty');
  const seen = new Set<string>();
  for (const tool of config.tools ?? []) {
    if (seen.has(tool.config.id)) {
      throwConfig(`duplicate tool id "${tool.config.id}" on agent "${config.id}"`);
    }
    seen.add(tool.config.id);
  }

  const definition: AgentDefinition<TData, TDeps> = {
    agentId: config.id,
    config,
    run: (input, ...args) => createRun(definition, input, args[0]),
    preview: (input, ...args) => previewAgent(definition, input, args[0]),
  };
  return definition;
};
