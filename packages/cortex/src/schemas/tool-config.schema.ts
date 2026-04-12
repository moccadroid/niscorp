// ═══════════════════════════════════════════════════════════
// ToolConfig schema — Zod-validated, serializable tool metadata
// ═══════════════════════════════════════════════════════════
//
// The serializable parts of a tool definition. Validated by Zod
// at defineTool() time. Non-serializable fields (input schema,
// execute function) are separate parameters — they carry live
// objects that can't round-trip through JSON.
//
// This schema is the source of truth for tool config shape.

import { z } from 'zod';

export const ToolRiskLevelSchema = z.enum(['low', 'medium', 'high']);
export type ToolRiskLevel = z.infer<typeof ToolRiskLevelSchema>;

export const ToolConfigSchema = z.object({
  id: z.string().describe('Unique tool identifier.'),
  name: z.string().describe('Human-readable tool name.'),
  description: z.string().describe('What this tool does, for the model to read.'),
  category: z.string().optional().describe('Tool category for grouping.'),
  riskLevel: ToolRiskLevelSchema.optional().describe('Risk level: low, medium, or high.'),
}).strict();

export type ToolConfigInput = z.input<typeof ToolConfigSchema>;
export type ToolConfigParsed = z.infer<typeof ToolConfigSchema>;
