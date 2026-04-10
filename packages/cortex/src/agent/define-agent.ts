// ═══════════════════════════════════════════════════════════
// defineAgent — declare an agent the runtime can register
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §4.2. Three execution modes:
//   - 'text'       → output is string
//   - 'structured' → output is T (validated by outputSchema)
//   - 'plan'       → output is ActionPlan (validated by ActionPlanSchema)
//
// Programmer-error guard: structured mode without outputSchema throws
// at definition time, not at runtime. This is the kind of bug we want
// to catch early per DESIGN.md §11.

import type { ZodType } from 'zod';
import type { AgentOutputMode } from '../schemas/agent-config.schema';
import type { ContextSpec } from '../context/types';
import type { PolicyConfig } from '../schemas/policy.schema';
import { makeError, throwCortex } from '../errors/cortex.errors';

export type AgentConfig<TOutput = unknown> = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  outputMode: AgentOutputMode;
  outputSchema?: ZodType<TOutput>;
  model?: string;
  tools?: string[];
  context?: ContextSpec;
  policy?: PolicyConfig;
  maxToolIterations?: number;
  /**
   * For text/structured/plan modes: when output validation fails
   * (bad JSON, schema mismatch, invalid plan), how many times to
   * re-call the agent with the prior attempt + validation issues
   * fed back into the prompt. Default: 2 (one initial call + up
   * to 2 corrective retries = 3 total attempts).
   */
  maxOutputRetries?: number;
};

export type AgentDefinition<TOutput = unknown> = {
  readonly agentId: string;
  readonly config: AgentConfig<TOutput>;
};

export const defineAgent = <TOutput>(
  config: AgentConfig<TOutput>,
): AgentDefinition<TOutput> => {
  if (config.outputMode === 'structured' && !config.outputSchema) {
    throwCortex(
      makeError(
        'output_validation_failed',
        `defineAgent('${config.id}'): structured mode requires an outputSchema`,
        { agentId: config.id },
      ),
    );
  }
  return { agentId: config.id, config };
};
