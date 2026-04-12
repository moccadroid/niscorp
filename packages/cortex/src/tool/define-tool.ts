// ═══════════════════════════════════════════════════════════
// defineTool — declare a tool the runtime can register
// ═══════════════════════════════════════════════════════════
//
// The serializable config fields are Zod-validated at definition
// time. Non-serializable fields (input schema, execute function)
// are separate parameters that carry live objects.
//
// A ToolDefinition is the result of defineTool. It carries the
// validated config plus a stable .toolId for the registry.

import type { ZodType } from 'zod';
import {
  ToolConfigSchema,
  type ToolConfigInput,
  type ToolConfigParsed,
  type ToolRiskLevel,
} from '../schemas/tool-config.schema';
import type { Bus } from '../types';

export type ToolContext = {
  workflowId: string;
  agentId: string;
  signal: AbortSignal;
  bus: Bus;
};

// ───────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────

// The full config including non-serializable fields. This is what
// users pass to defineTool(). The serializable subset is validated
// by ToolConfigSchema; the rest is attached as-is.
export type ToolConfig<TInput = unknown, TOutput = unknown> = ToolConfigInput & {
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
  readonly config: ToolConfigParsed & {
    input: ZodType;
    output?: ZodType;
    execute: (input: unknown, context: ToolContext) => unknown;
  };
};

// ───────────────────────────────────────────────────────────
// Factory
// ───────────────────────────────────────────────────────────

export const defineTool = <TInput, TOutput>(
  config: ToolConfig<TInput, TOutput>,
): ToolDefinition => {
  // Validate the serializable fields against the Zod schema.
  const { input, output, execute, ...serializable } = config;
  const parsed = ToolConfigSchema.parse(serializable);

  // The wrapper re-parses input through the user's Zod schema before
  // delegating to their typed execute function. This gives us a proper
  // `TInput` without resorting to `as`, and means tools are always
  // invoked with validated input regardless of what the caller passes.
  const wrappedExecute = (rawInput: unknown, context: ToolContext): unknown => {
    const validated = input.parse(rawInput);
    return execute(validated, context);
  };

  return {
    toolId: parsed.id,
    config: {
      ...parsed,
      input,
      ...(output !== undefined && { output }),
      execute: wrappedExecute,
    },
  };
};
