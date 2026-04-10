// ═══════════════════════════════════════════════════════════
// agentsProducer — lists delegate agents available via ask_agent
// ═══════════════════════════════════════════════════════════
//
// Plan-mode agents need to know which other agents they can ask.
// This producer reads the registry and emits a compact directory.

import type { ContextProducer, RegistryAgentView } from '../types';

export type AgentsProducerOptions = {
  filter?: (agent: RegistryAgentView) => boolean;
  // Restrict to a whitelist (e.g. an agent's allowed delegate list).
  allowedIds?: ReadonlyArray<string>;
  // Exclude self from the directory (an agent should not delegate
  // to itself, but the runtime allows it; we hide it by default).
  excludeSelf?: boolean;
};

const formatAgent = (a: RegistryAgentView): string => `- ${a.id} (${a.outputMode}) — ${a.description}`;

export const agentsProducer = (opts: AgentsProducerOptions = {}): ContextProducer => {
  const excludeSelf = opts.excludeSelf ?? true;
  return {
    id: 'cortex.agents',
    priority: 80,
    build: ({ registry, agentId }) => {
      let list = registry.listAgents();
      if (excludeSelf) list = list.filter((a) => a.id !== agentId);
      if (opts.allowedIds) {
        const allow = new Set(opts.allowedIds);
        list = list.filter((a) => allow.has(a.id));
      }
      if (opts.filter) list = list.filter(opts.filter);
      if (list.length === 0) return [];
      return [
        {
          role: 'system',
          content: `## Available Agents\n${list.map(formatAgent).join('\n')}`,
          source: 'cortex.agents',
          tags: ['agents'],
        },
      ];
    },
  };
};
