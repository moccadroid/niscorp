// ═══════════════════════════════════════════════════════════
// ToolConfig — defineTool input shape
// ═══════════════════════════════════════════════════════════
//
// We do NOT runtime-validate ToolConfig with Zod (the input is
// trusted code, not external data). The schema below exists for
// JSON-Schema generation and documentation. Hand-written types
// are the source of truth for code that consumes ToolConfig.

import { z } from 'zod';

export const ToolRiskLevelSchema = z.enum(['low', 'medium', 'high']);
export type ToolRiskLevel = z.infer<typeof ToolRiskLevelSchema>;
