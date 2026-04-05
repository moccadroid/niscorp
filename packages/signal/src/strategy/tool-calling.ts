import { z } from 'zod';
import type { Capabilities, Tool } from '../types';

// ═══════════════════════════════════════════════════════════
// Strategy: How to handle tool calling
// ═══════════════════════════════════════════════════════════

export type ToolCallingStrategy = 'native' | 'unified_schema';

export const selectToolCallingStrategy = (capabilities: Capabilities): ToolCallingStrategy => {
  if (capabilities.nativeTools) return 'native';
  return 'unified_schema';
};

export const toolsToProviderFormat = (tools: Tool[]): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> =>
  tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.inputSchema, { target: 'draft-7' }) as Record<string, unknown>,
    },
  }));
