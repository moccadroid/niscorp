import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkBudget, checkTool, checkAgent } from '../../src/runtime/gate';
import { createRegistry } from '../../src/manifold/registry';
import { createLedger } from '../../src/manifold/ledger';
import { defineTool } from '../../src/tool/define-tool';
import { defineAgent } from '../../src/agent/define-agent';

const wf = 'wf-test';

const setup = (): { registry: ReturnType<typeof createRegistry>; ledger: ReturnType<typeof createLedger> } => {
  const registry = createRegistry();
  const ledger = createLedger({
    defaultBudget: { maxTokens: 1_000, maxTicks: 5, maxToolCalls: 10, maxDurationMs: 60_000 },
  });
  ledger.open(wf);
  registry.registerTool(
    defineTool({
      id: 'low.tool',
      name: 'low',
      description: 'd',
      riskLevel: 'low',
      input: z.object({}),
      execute: async () => null,
    }),
  );
  registry.registerTool(
    defineTool({
      id: 'high.tool',
      name: 'high',
      description: 'd',
      riskLevel: 'high',
      input: z.object({}),
      execute: async () => null,
    }),
  );
  registry.registerAgent(
    defineAgent({
      id: 'specialist',
      name: 'S',
      description: 's',
      instructions: '',
      outputMode: 'text',
    }),
  );
  return { registry, ledger };
};

describe('checkBudget', () => {
  it('allows when budget remains', () => {
    const { registry, ledger } = setup();
    void registry;
    expect(checkBudget({ policy: undefined, registry, ledger, workflowId: wf }).allowed).toBe(true);
  });
  it('denies when tokens exhausted', () => {
    const { registry, ledger } = setup();
    ledger.addTokens(wf, 1_000);
    const r = checkBudget({ policy: undefined, registry, ledger, workflowId: wf });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe('budget_tokens_exceeded');
  });
});

describe('checkTool', () => {
  it('allows registered tools by default', () => {
    const { registry, ledger } = setup();
    const r = checkTool({ policy: undefined, registry, ledger, workflowId: wf, toolId: 'low.tool' });
    expect(r.allowed).toBe(true);
  });
  it('denies unregistered tools', () => {
    const { registry, ledger } = setup();
    const r = checkTool({ policy: undefined, registry, ledger, workflowId: wf, toolId: 'nope' });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe('tool_not_registered');
  });
  it('honors deny lists with prefix patterns', () => {
    const { registry, ledger } = setup();
    const r = checkTool({
      policy: { tools: { deny: ['high.*'] } },
      registry,
      ledger,
      workflowId: wf,
      toolId: 'high.tool',
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe('tool_denied_by_policy');
  });
  it('honors maxRiskLevel', () => {
    const { registry, ledger } = setup();
    const r = checkTool({
      policy: { tools: { maxRiskLevel: 'low' } },
      registry,
      ledger,
      workflowId: wf,
      toolId: 'high.tool',
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe('risk_level_exceeded');
  });
  it('denies confirmation-required tools (Phase B placeholder)', () => {
    const { registry, ledger } = setup();
    const r = checkTool({
      policy: { tools: { requireConfirmation: ['low.tool'] } },
      registry,
      ledger,
      workflowId: wf,
      toolId: 'low.tool',
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe('confirmation_required');
  });
});

describe('checkAgent', () => {
  it('allows registered agents by default', () => {
    const { registry, ledger } = setup();
    const r = checkAgent({ policy: undefined, registry, ledger, workflowId: wf, agentId: 'specialist' });
    expect(r.allowed).toBe(true);
  });
  it('honors agent deny lists', () => {
    const { registry, ledger } = setup();
    const r = checkAgent({
      policy: { agents: { deny: ['specialist'] } },
      registry,
      ledger,
      workflowId: wf,
      agentId: 'specialist',
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe('agent_denied_by_policy');
  });
});
