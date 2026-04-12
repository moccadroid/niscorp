// ═══════════════════════════════════════════════════════════
// Registry — agents, tools, producers, interceptors
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §10. Programmer errors throw (duplicate ids, missing
// lookups during execution). The registry is internally mutable but
// exposes a ReadonlyRegistry view to producers and tools.
//
// Producers and interceptors are stored with optional agent scoping:
// `addProducer(p, { agentId: 'foo' })` attaches only to that agent.
// `addProducer(p)` is a global producer attached to every agent.

import type { AgentDefinition } from '../agent/define-agent';
import type { ToolDefinition } from '../tool/define-tool';
import type {
  ContextProducer,
  ReadonlyRegistry,
  RegistryAgentView,
  RegistryToolView,
} from '../context/types';
import type { Unsubscribe } from '../types';
import { makeError, throwCortex } from '../errors/cortex.errors';

type ScopedProducer = {
  producer: ContextProducer;
  agentId?: string;
};

export type Registry = {
  // Mutation
  registerAgent: (agent: AgentDefinition) => Unsubscribe;
  registerTool: (tool: ToolDefinition) => Unsubscribe;
  addProducer: (producer: ContextProducer, scope?: { agentId?: string }) => Unsubscribe;

  // Lookup (programmer error if missing — these throw)
  requireAgent: (id: string) => AgentDefinition;
  requireTool: (id: string) => ToolDefinition;

  // Soft lookup
  getAgent: (id: string) => AgentDefinition | undefined;
  getTool: (id: string) => ToolDefinition | undefined;

  // Producer queries
  producersFor: (agentId: string) => ContextProducer[];
  allProducers: () => ContextProducer[];

  // Read-only view for context producers
  asReadonly: () => ReadonlyRegistry;
};

export const createRegistry = (): Registry => {
  const agents = new Map<string, AgentDefinition>();
  const tools = new Map<string, ToolDefinition>();
  const producers: ScopedProducer[] = [];

  const toolView = (def: ToolDefinition): RegistryToolView => ({
    id: def.toolId,
    name: def.config.name,
    description: def.config.description,
    ...(def.config.category !== undefined && { category: def.config.category }),
    ...(def.config.riskLevel !== undefined && { riskLevel: def.config.riskLevel }),
    inputSchema: def.config.input,
  });

  const agentView = (def: AgentDefinition): RegistryAgentView => ({
    id: def.agentId,
    name: def.config.name,
    description: def.config.description,
    outputMode: def.config.outputMode,
  });

  const registry: Registry = {
    registerAgent: (agent) => {
      if (agents.has(agent.agentId)) {
        throwCortex(
          makeError('agent_not_registered', `Duplicate agent id: ${agent.agentId}`, { agentId: agent.agentId }),
        );
      }
      agents.set(agent.agentId, agent);
      return () => {
        agents.delete(agent.agentId);
      };
    },
    registerTool: (tool) => {
      if (tools.has(tool.toolId)) {
        throwCortex(makeError('tool_not_registered', `Duplicate tool id: ${tool.toolId}`));
      }
      tools.set(tool.toolId, tool);
      return () => {
        tools.delete(tool.toolId);
      };
    },
    addProducer: (producer, scope) => {
      const entry: ScopedProducer = {
        producer,
        ...(scope?.agentId !== undefined && { agentId: scope.agentId }),
      };
      producers.push(entry);
      return () => {
        const idx = producers.indexOf(entry);
        if (idx >= 0) producers.splice(idx, 1);
      };
    },
    requireAgent: (id) => {
      const a = agents.get(id);
      if (!a) throwCortex(makeError('agent_not_registered', `No agent registered with id: ${id}`, { agentId: id }));
      return a;
    },
    requireTool: (id) => {
      const t = tools.get(id);
      if (!t) throwCortex(makeError('tool_not_registered', `No tool registered with id: ${id}`));
      return t;
    },
    getAgent: (id) => agents.get(id),
    getTool: (id) => tools.get(id),
    producersFor: (agentId) =>
      producers.filter((s) => s.agentId === undefined || s.agentId === agentId).map((s) => s.producer),
    allProducers: () => producers.map((s) => s.producer),
    asReadonly: () => ({
      listAgents: () => Array.from(agents.values()).map(agentView),
      listTools: () => Array.from(tools.values()).map(toolView),
      getAgent: (id) => {
        const a = agents.get(id);
        return a ? agentView(a) : undefined;
      },
      getTool: (id) => {
        const t = tools.get(id);
        return t ? toolView(t) : undefined;
      },
    }),
  };

  return registry;
};
