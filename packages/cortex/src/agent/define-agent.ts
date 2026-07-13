// ═══════════════════════════════════════════════════════════
// defineAgent — an agent is configuration, not a class
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §11. Strict generics: TData is the payload type
// (inferred from output.schema; undefined without one), TDeps is
// the per-invocation dependency type consumed by context entries,
// gates and hooks. Deps are what kill the v1 rebuild-the-agent-
// per-call pattern.

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
  // 'required' forces a human-facing text answer; default is
  // 'required' without a schema (chat agents), 'optional' with one.
  response?: ResponseMode;
  strategy?: 'auto' | OutputStrategy;
  // toolChoice:'required' hardening — every turn must be a tool call,
  // so respond becomes the only exit. Opt-in; some models get
  // tool-happy under it.
  forceTool?: boolean;
  // Schema-docs injection when the schema can't ride the wire
  // ('auto' default). 'off' when the prompt hand-authors its own
  // guide; a string replaces the generated docs entirely.
  doc?: 'auto' | 'off' | string;
  // Async output validation (may do I/O — e.g. mount a Nova action in
  // a throwaway shell). A { retry } verdict feeds back as a correction
  // in the same run, tools still warm.
  validate?: OutputValidator<TData>;
};

export type AgentConfig<TData, TDeps> = {
  id: string;
  description?: string;
  // Per-agent model binding. Precedence: RunOptions.llm > agent.llm >
  // manifold default.
  llm?: SignalClient;
  // 'stream' (default) consumes stepStream — live deltas, solid
  // partials. 'step' makes non-streaming calls: no deltas, but some
  // provider/model combos assemble tool-call arguments more reliably
  // outside streaming (observed: GLM 5.2 via OpenRouter).
  transport?: 'stream' | 'step';
  instructions: string | ((args: ProducerArgs<TDeps>) => string);
  // The agent's knowledge sources, in placement order: entries (values)
  // and producers (functions that make them). Annotate shared producers
  // `satisfies Producer` at their definition site.
  context?: ReadonlyArray<ContextEntry | Producer<TDeps>>;
  tools?: ReadonlyArray<ToolDefinition>;
  output?: OutputConfig<TData>;
  toolGates?: ReadonlyArray<ToolGate<TDeps>>;
  onToolResult?: ReadonlyArray<ToolResultHook<TDeps>>;
  prepareStep?: PrepareStep<TDeps>;
  stopWhen?: ReadonlyArray<StopCondition>;
  policy?: ToolPolicy;
};

// Rest-tuple trick: options are optional exactly when TDeps can be
// undefined; agents with real deps cannot be run without them.
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
