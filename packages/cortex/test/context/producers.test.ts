import { describe, it, expect } from 'vitest';
import type { BuildContext } from '../../src/context/types';
import { systemProducer } from '../../src/context/producers/system.producer';
import { inputProducer } from '../../src/context/producers/input.producer';
import { budgetProducer } from '../../src/context/producers/budget.producer';
import { toolsProducer } from '../../src/context/producers/tools.producer';
import { historyProducer } from '../../src/context/producers/history.producer';
import { observationsProducer } from '../../src/context/producers/observations.producer';
import { agentsProducer } from '../../src/context/producers/agents.producer';
import { actionContractProducer } from '../../src/context/producers/action-contract.producer';

const baseCtx: BuildContext = {
  agentId: 'test-agent',
  workflowId: 'wf-1',
  tick: 0,
  input: 'Hello world',
  observations: [],
  registry: {
    listAgents: () => [],
    listTools: () => [],
    getAgent: () => undefined,
    getTool: () => undefined,
  },
  state: new Map(),
  budget: {
    tokensUsed: 500,
    tokensRemaining: 9500,
    ticksUsed: 1,
    ticksRemaining: 19,
    toolCallsUsed: 2,
  },
};

describe('systemProducer', () => {
  it('returns a single system chunk with the instructions', () => {
    const producer = systemProducer('You are a helpful assistant.');
    const chunks = producer.build(baseCtx);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.role).toBe('system');
    expect(chunks[0]?.content).toBe('You are a helpful assistant.');
    expect(chunks[0]?.source).toBe('cortex.system');
  });

  it('has priority 100 (pinned)', () => {
    const producer = systemProducer('test');
    expect(producer.priority).toBe(100);
  });
});

describe('inputProducer', () => {
  it('returns a user chunk with the input', () => {
    const producer = inputProducer();
    const chunks = producer.build(baseCtx);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.role).toBe('user');
    expect(chunks[0]?.content).toContain('Hello world');
  });

  it('has priority 100 (pinned)', () => {
    const producer = inputProducer();
    expect(producer.priority).toBe(100);
  });
});

describe('budgetProducer', () => {
  it('returns a system chunk with budget info', () => {
    const producer = budgetProducer();
    const chunks = producer.build(baseCtx);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.role).toBe('system');
    const content = chunks[0]?.content;
    expect(typeof content).toBe('string');
    if (typeof content === 'string') {
      expect(content).toContain('500');
      expect(content).toContain('9500');
    }
  });
});

describe('toolsProducer', () => {
  it('returns empty when no tools registered', () => {
    const producer = toolsProducer();
    const chunks = producer.build(baseCtx);
    expect(chunks).toHaveLength(0);
  });

  it('returns a system chunk listing tools', () => {
    const producer = toolsProducer();
    const ctx = {
      ...baseCtx,
      registry: {
        ...baseCtx.registry,
        listTools: () => [
          { id: 'search', name: 'search', description: 'Search the web', inputSchema: {} },
        ],
      },
    };
    const chunks = producer.build(ctx);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const content = chunks[0]?.content;
    if (typeof content === 'string') {
      expect(content).toContain('search');
    }
  });
});

describe('historyProducer', () => {
  it('returns empty when no observations', () => {
    const producer = historyProducer();
    const chunks = producer.build(baseCtx);
    expect(chunks).toHaveLength(0);
  });
});

describe('observationsProducer', () => {
  it('returns empty when no observations', () => {
    const producer = observationsProducer();
    const chunks = producer.build(baseCtx);
    expect(chunks).toHaveLength(0);
  });

  it('returns chunks for observations', () => {
    const producer = observationsProducer();
    const ctx = {
      ...baseCtx,
      observations: [
        {
          stepKind: 'use_tool' as const,
          toolId: 'search',
          durationMs: 10,
          result: { data: 'found it' },
          timestamp: Date.now(),
          workflowId: 'wf-1',
          depth: 0,
          tick: 0,
        },
      ],
    };
    const chunks = producer.build(ctx);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('agentsProducer', () => {
  it('returns empty when no agents registered', () => {
    const producer = agentsProducer();
    const chunks = producer.build(baseCtx);
    expect(chunks).toHaveLength(0);
  });

  it('returns chunks when agents are available', () => {
    const producer = agentsProducer();
    const ctx = {
      ...baseCtx,
      registry: {
        ...baseCtx.registry,
        listAgents: () => [
          { id: 'helper', name: 'Helper', description: 'Helps with things', outputMode: 'text' as const },
        ],
      },
    };
    const chunks = producer.build(ctx);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('actionContractProducer', () => {
  it('returns a system chunk with plan node documentation', () => {
    const producer = actionContractProducer();
    const chunks = producer.build(baseCtx);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.role).toBe('system');
    const content = chunks[0]?.content;
    if (typeof content === 'string') {
      expect(content).toContain('use_tool');
      expect(content).toContain('ask_agent');
      expect(content).toContain('final');
    }
  });

  it('has priority 100 (pinned)', () => {
    const producer = actionContractProducer();
    expect(producer.priority).toBe(100);
  });
});
