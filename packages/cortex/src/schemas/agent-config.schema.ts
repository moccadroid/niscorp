// ═══════════════════════════════════════════════════════════
// AgentConfig schema marker
// ═══════════════════════════════════════════════════════════
//
// Like ToolConfig, AgentConfig is trusted code and is not
// runtime-validated by Zod. This file holds a small enum schema
// for the execution mode so it can be referenced from JSON-Schema
// outputs and from the Zod-defined parts of the API surface.

import { z } from 'zod';

export const AgentOutputModeSchema = z.enum(['text', 'structured', 'plan']);
export type AgentOutputMode = z.infer<typeof AgentOutputModeSchema>;
