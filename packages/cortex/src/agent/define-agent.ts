// ═══════════════════════════════════════════════════════════
// defineAgent — declare an agent the runtime can register
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §4.2. Three execution modes:
//   - 'text'       → output is string
//   - 'structured' → output is T (validated by outputSchema)
//   - 'plan'       → output is ActionPlan (validated by ActionPlanSchema)
//
// The serializable config fields are Zod-validated at definition
// time. Non-serializable fields (outputSchema, context) are
// separate parameters that carry live objects (ZodType, functions).
//
// Programmer-error guard: structured mode without outputSchema throws
// at definition time, not at runtime. This is the kind of bug we want
// to catch early per DESIGN.md §11.

import type { ZodType } from 'zod';
import {
  AgentConfigSchema,
  type AgentConfigInput,
  type AgentConfigParsed,
  type AgentOutputMode,
} from '../schemas/agent-config.schema';
import type { ContextSpec } from '../context/types';
import { makeError, throwCortex } from '../errors/cortex.errors';

// ───────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────

// The full config including non-serializable fields. This is what
// users pass to defineAgent(). The serializable subset is validated
// by AgentConfigSchema; the rest is attached as-is.
export type AgentConfig<TOutput = unknown> = AgentConfigInput & {
  outputSchema?: ZodType<TOutput>;
  context?: ContextSpec;
};

// What defineAgent returns. The parsed config carries the Zod-validated
// serializable fields plus the non-serializable attachments.
export type AgentDefinition<TOutput = unknown> = {
  readonly agentId: string;
  readonly config: AgentConfigParsed & {
    outputSchema?: ZodType<TOutput>;
    context?: ContextSpec;
  };
};

// ───────────────────────────────────────────────────────────
// Factory
// ───────────────────────────────────────────────────────────

export const defineAgent = <TOutput>(
  config: AgentConfig<TOutput>,
): AgentDefinition<TOutput> => {
  // Validate the serializable fields against the Zod schema.
  const { outputSchema, context, ...serializable } = config;
  const parsed = AgentConfigSchema.parse(serializable);

  // Programmer-error guard: structured mode needs outputSchema.
  if (parsed.outputMode === 'structured' && !outputSchema) {
    throwCortex(
      makeError(
        'output_validation_failed',
        `defineAgent('${parsed.id}'): structured mode requires an outputSchema`,
        { agentId: parsed.id },
      ),
    );
  }

  return {
    agentId: parsed.id,
    config: {
      ...parsed,
      ...(outputSchema !== undefined && { outputSchema }),
      ...(context !== undefined && { context }),
    },
  };
};
