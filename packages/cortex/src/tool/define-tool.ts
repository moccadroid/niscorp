// ═══════════════════════════════════════════════════════════
// defineTool — declare a tool the loop can execute
// ═══════════════════════════════════════════════════════════
//
// The serializable config fields are Zod-validated at definition
// time. Non-serializable fields (input schema, execute function)
// are separate parameters that carry live objects.

import type { ZodType } from 'zod';
import {
  ToolConfigSchema,
  type ToolConfigInput,
  type ToolConfigParsed,
} from '../schemas/tool-config.schema';
import type { CortexEvent } from '../events/types';

export type ToolContext = {
  runId: string;
  agentId: string;
  agentPath: ReadonlyArray<string>;
  signal: AbortSignal;
  // Forward a child run's events into this run's stream — pass it as
  // the child's RunOptions.onEvent so it subscribes BEFORE the child's
  // run-start fires. asTool does this; a delegate agent's whole tree
  // becomes visible on the parent.
  forward: (event: CortexEvent) => void;
};

// ───────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────

export type ToolConfig<TInput = unknown, TOutput = unknown> = ToolConfigInput & {
  input: ZodType<TInput>;
  output?: ZodType<TOutput>;
  // The tool's OWN usage knowledge — how and when to use it, beyond the
  // one-line wire `description`. Assembled into a TOOL GUIDES context
  // section on every run that carries the tool, so the knowledge travels
  // WITH the tool: add the tool, its guide arrives; change it, every
  // agent updates; remove it, the guide leaves. Agents never hand-copy
  // tool usage into their instructions. A string[] joins as lines; a
  // function defers construction (e.g. composing a library's exported
  // guide).
  guide?: string | string[] | (() => string | string[]);
  execute: (input: TInput, context: ToolContext) => Promise<TOutput> | TOutput;
};

// ToolDefinition is what the loop (and manifold catalog) stores. The
// `execute` signature is widened to accept `unknown` — defineTool
// wraps the user's typed execute so the widened form always
// re-validates through the Zod schema before delegating.
export type ToolDefinition = {
  readonly toolId: string;
  readonly config: ToolConfigParsed & {
    input: ZodType;
    output?: ZodType;
    guide?: string | string[] | (() => string | string[]);
    execute: (input: unknown, context: ToolContext) => unknown;
  };
};

// ───────────────────────────────────────────────────────────
// Factory
// ───────────────────────────────────────────────────────────

export const defineTool = <TInput, TOutput>(
  config: ToolConfig<TInput, TOutput>,
): ToolDefinition => {
  const { input, output, guide, execute, ...serializable } = config;
  const parsed = ToolConfigSchema.parse(serializable);

  // Re-parse through the user's Zod schema before delegating to their
  // typed execute — a proper TInput without `as`, and tools are always
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
      ...(guide !== undefined && { guide }),
      execute: wrappedExecute,
    },
  };
};
