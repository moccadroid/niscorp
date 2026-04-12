// ═══════════════════════════════════════════════════════════
// AgentConfig schema — Zod-validated, serializable agent metadata
// ═══════════════════════════════════════════════════════════
//
// The serializable parts of an agent definition. Validated by Zod
// at defineAgent() time. Non-serializable fields (outputSchema,
// context) are separate parameters — they carry live objects
// (ZodType, functions) that can't round-trip through JSON.
//
// This schema is the source of truth for agent config shape.
// The hand-written AgentConfig type is derived from it via z.infer.

import { z } from 'zod';
import { PolicyConfigSchema } from './policy.schema';

export const AgentOutputModeSchema = z.enum(['text', 'structured', 'plan']);
export type AgentOutputMode = z.infer<typeof AgentOutputModeSchema>;

export const AgentConfigSchema = z.object({
  id: z.string().describe('Unique agent identifier.'),
  name: z.string().describe('Human-readable agent name.'),
  description: z.string().describe('What this agent does, in one sentence.'),
  instructions: z.string().describe('System prompt — the agent\'s instructions.'),
  outputMode: AgentOutputModeSchema.describe('Execution mode: text, structured, or plan.'),
  model: z.string().optional().describe('Model override. If unset, uses the manifold default.'),
  tools: z.array(z.string()).optional().describe('Tool ID whitelist. If unset, all registered tools are available.'),
  policy: PolicyConfigSchema.optional().describe('Per-agent policy overrides.'),
  maxToolIterations: z.number().int().positive().optional().describe('Max tool-loop iterations per invocation. Default: 10.'),
  maxTicks: z.number().int().positive().optional().describe('Max tick-loop iterations (plan mode only). Default: 20.'),
  maxOutputRetries: z.number().int().nonnegative().optional().describe('Max output validation retries. Default: 2.'),
}).strict();

// The Zod-inferred type for the serializable config fields.
export type AgentConfigInput = z.input<typeof AgentConfigSchema>;
export type AgentConfigParsed = z.infer<typeof AgentConfigSchema>;
