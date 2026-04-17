// ═══════════════════════════════════════════════════════════
// toolsProducer — formats the registry's tool list for the model
// ═══════════════════════════════════════════════════════════
//
// A compact text format listed in the prompt. The tool loop also
// passes tool definitions to the provider as native function-calling
// metadata; this producer only contributes the *prose* description.

import type { ContextProducer, RegistryToolView } from '../types';

export type ToolsProducerOptions = {
  filter?: (tool: RegistryToolView) => boolean;
  format?: 'compact' | 'full';
  // Per-agent tool whitelist (from AgentConfig.tools).
  // If undefined, all registry tools are eligible.
  allowedIds?: ReadonlyArray<string>;
};

const formatTool = (tool: RegistryToolView, format: 'compact' | 'full'): string => {
  if (format === 'compact') {
    return `- ${tool.id} — ${tool.description}`;
  }
  const risk = tool.riskLevel ? ` (risk: ${tool.riskLevel})` : '';
  const cat = tool.category ? ` [${tool.category}]` : '';
  return `### ${tool.id}${cat}${risk}\n${tool.description}`;
};

export const toolsProducer = (opts: ToolsProducerOptions = {}): ContextProducer => {
  const format = opts.format ?? 'compact';
  return {
    id: 'cortex.tools',
    priority: 90,
    build: ({ registry }) => {
      let tools = registry.listTools();
      if (opts.allowedIds) {
        const allow = new Set(opts.allowedIds);
        tools = tools.filter((t) => allow.has(t.id));
      }
      if (opts.filter) tools = tools.filter(opts.filter);
      if (tools.length === 0) return [];
      const lines = tools.map((t) => formatTool(t, format));
      const header = format === 'compact' ? '## Available Tools' : '## Available Tools\n';
      return [
        {
          role: 'system',
          content: `${header}\n${lines.join('\n')}`,
          source: 'cortex.tools',
          tags: ['tools'],
        },
      ];
    },
  };
};
