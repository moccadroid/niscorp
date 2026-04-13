// ═══════════════════════════════════════════════════════════
// PolicyConfig — agent constraints
// ═══════════════════════════════════════════════════════════
//
// PolicyConfig is hand-written (a function-parameter bag, not external
// data). This file exists as a placeholder so the schemas/ barrel
// stays consistent and so future serialized policy profiles have a
// schema to land in.

import { z } from 'zod';

const ToolPolicySchema = z.object({
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
  requireConfirmation: z.array(z.string()).optional(),
  maxRiskLevel: z.enum(['low', 'medium', 'high']).optional(),
}).partial();

const BudgetPolicySchema = z.object({
  maxTokensPerRun: z.number().int().positive().optional(),
  maxTicksPerRun: z.number().int().positive().optional(),
  maxPlanDepth: z.number().int().positive().optional(),
  maxDurationMs: z.number().int().positive().optional(),
  maxParallelBranches: z.number().int().positive().optional(),
}).partial();

const AgentPolicySchema = z.object({
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
}).partial();

export const PolicyConfigSchema = z.object({
  budget: BudgetPolicySchema.optional(),
  tools: ToolPolicySchema.optional(),
  agents: AgentPolicySchema.optional(),
  confirmationTimeoutMs: z.number().int().positive().optional(),
}).partial();

export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;
