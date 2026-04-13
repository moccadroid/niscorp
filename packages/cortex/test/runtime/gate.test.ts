import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkBudget, checkTool, checkAgent } from '../../src/runtime/gate';
import { createRegistry } from '../../src/manifold/registry';
import { createLedger } from '../../src/manifold/ledger';
import { createWorkflowContext } from '../../src/manifold/workflow-context';
import { defineTool } from '../../src/tool/define-tool';
import { defineAgent } from '../../src/agent/define-agent';
import type { PolicyConfig } from '../../src/schemas/policy.schema';

const wf = 'wf-test';

const setup = (policy?: PolicyConfig): {
  registry: ReturnType<typeof createRegistry>;
  ledger: ReturnType<typeof createLedger>;
  gate: ReturnType<typeof createWorkflowContext>;
} => {
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
  const gate = createWorkflowContext(wf, policy ?? {});
  return { registry, ledger, gate };
};

describe('checkBudget', () => {
  it('allows when budget remains', () => {
    const { registry, ledger, gate } = setup();
    expect(checkBudget({ workflow: gate, registry, ledger }).allowed).toBe(true);
  });
  it('denies when tokens exhausted', () => {
    const { registry, ledger, gate } = setup();
    ledger.addTokens(wf, 1_000);
    const r = checkBudget({ workflow: gate, registry, ledger });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe('budget_tokens_exceeded');
  });
});

describe('checkTool', () => {
  it('allows registered tools by default', () => {
    const { registry, ledger, gate } = setup();
    const r = checkTool({ workflow: gate, registry, ledger, toolId: 'low.tool' });
    expect(r.allowed).toBe(true);
  });
  it('denies unregistered tools', () => {
    const { registry, ledger, gate } = setup();
    const r = checkTool({ workflow: gate, registry, ledger, toolId: 'nope' });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe('tool_not_registered');
  });
  it('honors deny lists with prefix patterns', () => {
    const { registry, ledger, gate } = setup({ tools: { deny: ['high.*'] } });
    const r = checkTool({ workflow: gate, registry, ledger, toolId: 'high.tool' });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe('tool_denied_by_policy');
  });
  it('honors maxRiskLevel', () => {
    const { registry, ledger, gate } = setup({ tools: { maxRiskLevel: 'low' } });
    const r = checkTool({ workflow: gate, registry, ledger, toolId: 'high.tool' });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe('risk_level_exceeded');
  });
  it('returns confirmation_required for tools needing confirmation', () => {
    const { registry, ledger, gate } = setup({ tools: { requireConfirmation: ['low.tool'] } });
    const r = checkTool({ workflow: gate, registry, ledger, toolId: 'low.tool' });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe('confirmation_required');
  });
  it('reads live policy — rule deny effects are visible immediately', () => {
    const { registry, ledger, gate } = setup();
    // Initially allowed
    expect(checkTool({ workflow: gate, registry, ledger, toolId: 'low.tool' }).allowed).toBe(true);
    // Rule adds a deny
    gate.updatePolicy((p) => ({ ...p, tools: { ...p.tools, deny: ['*'] } }));
    // Now denied — gate reads live policy
    const r = checkTool({ workflow: gate, registry, ledger, toolId: 'low.tool' });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe('tool_denied_by_policy');
  });
});

describe('checkAgent', () => {
  it('allows registered agents by default', () => {
    const { registry, ledger, gate } = setup();
    const r = checkAgent({ workflow: gate, registry, ledger, agentId: 'specialist' });
    expect(r.allowed).toBe(true);
  });
  it('honors agent deny lists', () => {
    const { registry, ledger, gate } = setup({ agents: { deny: ['specialist'] } });
    const r = checkAgent({ workflow: gate, registry, ledger, agentId: 'specialist' });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe('agent_denied_by_policy');
  });
});
