// ═══════════════════════════════════════════════════════════
// defineTool — declare a tool the runtime can register
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §4.x and STYLE_GUIDE: arrow-const, explicit return
// type on exports, single config object, factory pattern.
//
// A ToolDefinition is the result of defineTool. It carries the user's
// config plus a stable .toolId for the registry. We deliberately
// expose the config as readonly so consumers can introspect it
// (the tools producer in the context pipeline reads it to format
// the available-tools section of the prompt).

import type { ZodType } from 'zod';
import type { ToolRiskLevel } from '../schemas/tool-config.schema';
import type { Bus } from '../types';

export type ToolContext = {
  workflowId: string;
  agentId: string;
  signal: AbortSignal;
  bus: Bus;
};

// ToolConfig is the user-facing shape with full input/output types.
export type ToolConfig<TInput = unknown, TOutput = unknown> = {
  id: string;
  name: string;
  description: string;
  category?: string;
  riskLevel?: ToolRiskLevel;
  input: ZodType<TInput>;
  output?: ZodType<TOutput>;
  execute: (input: TInput, context: ToolContext) => Promise<TOutput> | TOutput;
};

// ToolDefinition is what the registry stores. The `execute` signature
// is widened to `(input: unknown) => unknown` so a definition with
// concrete types is assignable to the generic form (function params
// are contravariant). defineTool wraps the user's typed execute at
// registration time, so the widened form is never actually called
// with an unvalidated input in practice — the tool loop validates
// against the Zod schema before invoking it.
export type ToolDefinition = {
  readonly toolId: string;
  readonly config: {
    id: string;
    name: string;
    description: string;
    category?: string;
    riskLevel?: ToolRiskLevel;
    input: ZodType;
    output?: ZodType;
    execute: (input: unknown, context: ToolContext) => unknown;
  };
};

export const defineTool = <TInput, TOutput>(
  config: ToolConfig<TInput, TOutput>,
): ToolDefinition => {
  // The wrapper re-parses input through the user's Zod schema before
  // delegating to their typed execute function. This gives us a proper
  // `TInput` without resorting to `as`, and means tools are always
  // invoked with validated input regardless of what the caller passes.
  const execute = (input: unknown, context: ToolContext): unknown => {
    const parsed = config.input.parse(input);
    return config.execute(parsed, context);
  };
  const widened: ToolDefinition['config'] = {
    id: config.id,
    name: config.name,
    description: config.description,
    ...(config.category !== undefined && { category: config.category }),
    ...(config.riskLevel !== undefined && { riskLevel: config.riskLevel }),
    input: config.input,
    ...(config.output !== undefined && { output: config.output }),
    execute,
  };
  return { toolId: config.id, config: widened };
};
