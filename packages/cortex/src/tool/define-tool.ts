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
  forward: (event: CortexEvent) => void;
};

export type ToolConfig<TInput = unknown, TOutput = unknown> = ToolConfigInput & {
  input: ZodType<TInput>;
  output?: ZodType<TOutput>;
  guide?: string | string[] | (() => string | string[]);
  execute: (input: TInput, context: ToolContext) => Promise<TOutput> | TOutput;
};

export type ToolDefinition = {
  readonly toolId: string;
  readonly config: ToolConfigParsed & {
    input: ZodType;
    output?: ZodType;
    guide?: string | string[] | (() => string | string[]);
    execute: (input: unknown, context: ToolContext) => unknown;
  };
};

export const defineTool = <TInput, TOutput>(
  config: ToolConfig<TInput, TOutput>,
): ToolDefinition => {
  const { input, output, guide, execute, ...serializable } = config;
  const parsed = ToolConfigSchema.parse(serializable);

  // Parsed here although the loop has already parsed: this is what gives
  // `execute` a TInput without a cast, whoever the caller is.
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
