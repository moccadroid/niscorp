import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createManifold } from '../../src/manifold/manifold';
import { defineAgent } from '../../src/agent/define-agent';
import { defineTool } from '../../src/tool/define-tool';
import { createStubSignal } from '../_helpers/stub-signal';

// ═══════════════════════════════════════════════════════════
// Tool-loop gate enforcement
// ═══════════════════════════════════════════════════════════
//
// Phase B added budget + tool gating to the Cortex tool loop so
// structured-mode-with-tools agents enforce policy the same way
// plan-mode agents do. These tests cover the new path.

describe('tool loop — policy gate', () => {
  it('denies a tool call when the agent policy explicitly denies the tool', async () => {
    const llm = createStubSignal([
      // Iteration 1: model wants to call the denied tool.
      { content: '', toolCalls: [{ id: 'c1', name: 'forbidden', args: {} }] },
      // Iteration 2: with the denial observation in context, model finalizes.
      { content: 'recovered' },
    ]);
    const m = createManifold({ llm });
    m.registerTool(
      defineTool({
        id: 'forbidden',
        name: 'forbidden',
        description: 'a forbidden tool',
        input: z.object({}),
        execute: async () => ({ executed: true }),
      }),
    );
    m.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: '',
        instructions: '',
        outputMode: 'text',
        tools: ['forbidden'],
        policy: { tools: { deny: ['forbidden'] } },
      }),
    );
    const result = await m.execute('a', 'go');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('recovered');
    // Two model calls: the tool call was denied, the model got the
    // denial observation, then produced final content.
    expect(llm.calls).toHaveLength(2);
  });

  it('blows the workflow when token budget is exhausted before the next iteration', async () => {
    const llm = createStubSignal([
      // First iteration: model returns a tool call AND eats the entire token budget.
      {
        content: '',
        toolCalls: [{ id: 'c1', name: 'expensive', args: {} }],
        usage: { inputTokens: 60, outputTokens: 60, totalTokens: 120 },
      },
    ]);
    const m = createManifold({
      llm,
      defaultBudget: { maxTokens: 100, maxTicks: 5, maxToolCalls: 10, maxDurationMs: 60_000 },
    });
    m.registerTool(
      defineTool({
        id: 'expensive',
        name: 'expensive',
        description: 'a tool',
        input: z.object({}),
        execute: async () => ({ done: true }),
      }),
    );
    m.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: '',
        instructions: '',
        outputMode: 'text',
        tools: ['expensive'],
      }),
    );
    const result = await m.execute('a', 'go');
    // The first iteration runs (model call + tool call). The next
    // iteration's budget gate denies. The loop bails with a real
    // Result.err carrying the budget_exceeded error code — no
    // synthetic content marker, no parser dance.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('budget_exceeded');
      expect(result.error.message).toContain('budget_tokens_exceeded');
    }
  });

  it('honors maxRiskLevel — high-risk tool denied when policy caps at low', async () => {
    const llm = createStubSignal([
      { content: '', toolCalls: [{ id: 'c1', name: 'risky', args: {} }] },
      { content: 'safe-fallback' },
    ]);
    const m = createManifold({ llm });
    m.registerTool(
      defineTool({
        id: 'risky',
        name: 'risky',
        description: 'a risky tool',
        riskLevel: 'high',
        input: z.object({}),
        execute: async () => ({ ran: true }),
      }),
    );
    m.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: '',
        instructions: '',
        outputMode: 'text',
        tools: ['risky'],
        policy: { tools: { maxRiskLevel: 'low' } },
      }),
    );
    const result = await m.execute('a', 'go');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('safe-fallback');
  });
});
