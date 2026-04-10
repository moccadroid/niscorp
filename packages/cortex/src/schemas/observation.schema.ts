// ═══════════════════════════════════════════════════════════
// Observation schema
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §2 / §17: every plan-step execution and tool call
// produces an Observation. Observations are passed to agents as
// context (next tick), emitted on the bus, and logged.
//
// Schemas use .describe() everywhere — they double as LLM-facing docs.

import { z } from 'zod';

export const PlanNodeKindSchema = z.enum([
  'use_tool',
  'ask_agent',
  'tell_topic',
  'wait',
  'parallel',
  'reflect',
  'final',
]);
export type PlanNodeKind = z.infer<typeof PlanNodeKindSchema>;

export const ObservationSchema = z
  .object({
    stepKind: PlanNodeKindSchema.describe('The kind of plan node that produced this observation.'),
    agentId: z.string().optional().describe('For ask_agent: the agent that was delegated to.'),
    toolId: z.string().optional().describe('For use_tool: the tool that was invoked.'),
    topic: z.string().optional().describe('For tell_topic / wait: the topic involved.'),
    durationMs: z.number().nonnegative().describe('Wall-clock execution time in milliseconds.'),
    result: z.unknown().optional().describe('The output of the step, if any.'),
    error: z.string().optional().describe('Error message if the step failed.'),
    timestamp: z.number().describe('Unix epoch ms when the observation was recorded.'),
    workflowId: z.string().describe('The workflow this observation belongs to.'),
    depth: z.number().int().nonnegative().describe('Plan-tree depth at which this step ran.'),
    tick: z.number().int().nonnegative().describe('Tick number within the workflow.'),
    tokensUsed: z.number().nonnegative().optional().describe('Tokens consumed by this step, if applicable.'),
  })
  .strict();

export type Observation = z.infer<typeof ObservationSchema>;
