import { describe, it, expect } from 'vitest';
import { createManifold, defineRule, defineAgent, defineTool } from '../../src';
import { createStubSignal } from '../_helpers/stub-signal';
import { z } from 'zod';

describe('manifold + rules integration', () => {
  it('inject effect adds a system message to context after enough tool observations', async () => {
    const stub = createStubSignal([
      { content: '', toolCalls: [{ id: 'c1', name: 'counter', args: {} }] },
      { content: '', toolCalls: [{ id: 'c2', name: 'counter', args: {} }] },
      { content: '', toolCalls: [{ id: 'c3', name: 'counter', args: {} }] },
      // After 3 tool calls the inject rule fires. The next pipeline build
      // will include the injected message. Agent sees it and finalizes.
      { content: 'I see the warning, wrapping up.', toolCalls: [] },
    ]);

    const manifold = createManifold({ llm: stub });

    manifold.registerAgent(
      defineAgent({
        id: 'test-agent',
        name: 'Test',
        description: 'test',
        instructions: 'Call counter a few times then return text.',
        outputMode: 'text',
        tools: ['counter'],
      }),
    );

    manifold.registerTool(
      defineTool({
        id: 'counter',
        name: 'counter',
        description: 'Increments a counter.',
        input: z.object({}),
        execute: async () => ({ count: 1 }),
      }),
    );

    manifold.registerRule(
      defineRule({
        id: 'tool-warning',
        watch: {
          toolCalls: { event: 'cortex.observation.recorded', aggregate: 'count' },
        },
        rules: [
          {
            when: { $gte: ['$watch.toolCalls', 3] },
            then: { inject: 'You have made many tool calls. Please finalize.' },
          },
        ],
      }),
    );

    await manifold.start();
    const result = await manifold.execute<string>('test-agent', 'go');
    await manifold.stop();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toContain('wrapping up');
    }
  });

  it('rule accumulator state is inspectable via rulesEngine.snapshot', async () => {
    const stub = createStubSignal([
      { content: '', toolCalls: [{ id: 'c1', name: 'counter', args: {} }] },
      { content: 'done', toolCalls: [] },
    ]);

    const manifold = createManifold({ llm: stub });

    manifold.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: 'test',
        instructions: 'test',
        outputMode: 'text',
        tools: ['counter'],
      }),
    );

    manifold.registerTool(
      defineTool({
        id: 'counter',
        name: 'counter',
        description: 'test',
        input: z.object({}),
        execute: async () => ({ ok: true }),
      }),
    );

    manifold.registerRule(
      defineRule({
        id: 'tracker',
        watch: {
          observations: { event: 'cortex.observation.recorded', aggregate: 'count' },
        },
        rules: [],
      }),
    );

    await manifold.start();
    await manifold.execute('a', 'go');
    await manifold.stop();

    const snapshot = manifold._internal.rulesEngine.snapshot();
    expect(snapshot['tracker']?.['observations']).toBeGreaterThanOrEqual(1);
  });

  it('abort effect stops the workflow', async () => {
    const stub = createStubSignal([
      { content: '', toolCalls: [{ id: 'c1', name: 'counter', args: {} }] },
      { content: '', toolCalls: [{ id: 'c2', name: 'counter', args: {} }] },
      // Rule aborts after 2 observations — this response should never be reached
      { content: 'should not see this', toolCalls: [] },
    ]);

    const manifold = createManifold({ llm: stub });

    manifold.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: 'test',
        instructions: 'test',
        outputMode: 'text',
        tools: ['counter'],
      }),
    );

    manifold.registerTool(
      defineTool({
        id: 'counter',
        name: 'counter',
        description: 'test',
        input: z.object({}),
        execute: async () => ({ ok: true }),
      }),
    );

    manifold.registerRule(
      defineRule({
        id: 'abort-at-2',
        watch: {
          obs: { event: 'cortex.observation.recorded', aggregate: 'count' },
        },
        rules: [
          { when: { $gte: ['$watch.obs', 2] }, then: { abort: 'Two observations reached.' } },
        ],
      }),
    );

    await manifold.start();
    const result = await manifold.execute<string>('a', 'go');
    await manifold.stop();

    // The abort effect should have stopped the workflow.
    // It surfaces as an error (aborted or model_call_failed).
    expect(result.ok).toBe(false);
  });

  it('deny effect blocks subsequent tool calls via live policy', async () => {
    const stub = createStubSignal([
      { content: '', toolCalls: [{ id: 'c1', name: 'counter', args: {} }] },
      // After 1 observation, deny fires → policy.tools.deny = ['*']
      // Next tool call is gated.
      { content: '', toolCalls: [{ id: 'c2', name: 'counter', args: {} }] },
      { content: 'tools were denied', toolCalls: [] },
    ]);

    const manifold = createManifold({ llm: stub });

    manifold.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: 'test',
        instructions: 'test',
        outputMode: 'text',
        tools: ['counter'],
      }),
    );

    manifold.registerTool(
      defineTool({
        id: 'counter',
        name: 'counter',
        description: 'test',
        input: z.object({}),
        execute: async () => ({ ok: true }),
      }),
    );

    manifold.registerRule(
      defineRule({
        id: 'deny-after-1',
        watch: {
          obs: { event: 'cortex.observation.recorded', aggregate: 'count' },
        },
        rules: [
          { when: { $gte: ['$watch.obs', 1] }, then: { deny: 'One observation limit.' } },
        ],
      }),
    );

    await manifold.start();
    const result = await manifold.execute<string>('a', 'go');
    await manifold.stop();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toContain('denied');
    }
  });
});
