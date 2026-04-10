import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createManifold } from '../../src/manifold/manifold';
import { defineAgent } from '../../src/agent/define-agent';
import { defineTool } from '../../src/tool/define-tool';
import { runAgentStandalone } from '../../src/agent/standalone';
import { createStubSignal } from '../_helpers/stub-signal';

describe('executeAgent (manifold mode)', () => {
  it('runs a text-mode agent and returns the model content', async () => {
    const llm = createStubSignal([{ content: 'hello from the model' }]);
    const m = createManifold({ llm });
    m.registerAgent(
      defineAgent({
        id: 'greeter',
        name: 'Greeter',
        description: 'Greets',
        instructions: 'Be brief.',
        outputMode: 'text',
      }),
    );
    const result = await m.execute('greeter', 'hi');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('hello from the model');
    expect(llm.calls.length).toBe(1);
  });

  it('runs a structured-mode agent and validates output', async () => {
    const llm = createStubSignal([{ content: '{"greeting":"hi","name":"world"}' }]);
    const m = createManifold({ llm });
    const schema = z.object({ greeting: z.string(), name: z.string() });
    m.registerAgent(
      defineAgent({
        id: 'struct',
        name: 'Struct',
        description: 'structured',
        instructions: 'Return JSON.',
        outputMode: 'structured',
        outputSchema: schema,
      }),
    );
    const result = await m.execute<{ greeting: string; name: string }>('struct', 'hi');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ greeting: 'hi', name: 'world' });
  });

  it('strips markdown code fences before parsing structured output', async () => {
    const llm = createStubSignal([{ content: '```json\n{"x":1}\n```' }]);
    const m = createManifold({ llm });
    const schema = z.object({ x: z.number() });
    m.registerAgent(
      defineAgent({
        id: 's',
        name: 'S',
        description: 'S',
        instructions: '',
        outputMode: 'structured',
        outputSchema: schema,
      }),
    );
    const result = await m.execute<{ x: number }>('s', 'hi');
    expect(result.ok).toBe(true);
  });

  it('returns Result.err with output_validation_failed on bad JSON', async () => {
    const llm = createStubSignal([{ content: 'not json at all' }]);
    const m = createManifold({ llm });
    const schema = z.object({ x: z.number() });
    m.registerAgent(
      defineAgent({
        id: 's',
        name: 'S',
        description: 'S',
        instructions: '',
        outputMode: 'structured',
        outputSchema: schema,
      }),
    );
    const result = await m.execute('s', 'hi');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('output_validation_failed');
  });

  it('executes a tool call and surfaces the result as an observation', async () => {
    const llm = createStubSignal([
      {
        content: '',
        toolCalls: [{ id: 'c1', name: 'add', args: { a: 2, b: 3 } }],
      },
      { content: 'the answer is 5' },
    ]);
    const m = createManifold({ llm });
    m.registerTool(
      defineTool({
        id: 'add',
        name: 'add',
        description: 'add two numbers',
        input: z.object({ a: z.number(), b: z.number() }),
        execute: async ({ a, b }) => ({ sum: a + b }),
      }),
    );
    m.registerAgent(
      defineAgent({
        id: 'calc',
        name: 'Calculator',
        description: 'math',
        instructions: 'Use tools.',
        outputMode: 'text',
        tools: ['add'],
      }),
    );
    const result = await m.execute('calc', 'what is 2+3?');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('the answer is 5');
    // Two step() calls: one that returned a tool call, one that returned final content.
    expect(llm.calls.length).toBe(2);
  });

  it('records an observation with an error when the model calls an unknown tool', async () => {
    const llm = createStubSignal([
      {
        content: '',
        toolCalls: [{ id: 'c1', name: 'missing', args: {} }],
      },
      { content: 'ok done' },
    ]);
    const m = createManifold({ llm });
    m.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: 'A',
        instructions: '',
        outputMode: 'text',
      }),
    );
    const result = await m.execute('a', 'hi');
    expect(result.ok).toBe(true);
  });

  it('returns tool_iterations_exceeded when the model loops forever', async () => {
    const llm = createStubSignal();
    // Script infinite tool calls.
    for (let i = 0; i < 20; i += 1) {
      llm.enqueue({ content: '', toolCalls: [{ id: `c${i}`, name: 'echo', args: { n: i } }] });
    }
    const m = createManifold({ llm });
    m.registerTool(
      defineTool({
        id: 'echo',
        name: 'echo',
        description: 'echo',
        input: z.object({ n: z.number() }),
        execute: async (i) => i,
      }),
    );
    m.registerAgent(
      defineAgent({
        id: 'loopy',
        name: 'loopy',
        description: 'loopy',
        instructions: '',
        outputMode: 'text',
        tools: ['echo'],
        maxToolIterations: 3,
      }),
    );
    const result = await m.execute('loopy', 'go');
    // The loop hits the cap and returns a real Result.err with the
    // structured error code (no synthetic content marker).
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('tool_iterations_exceeded');
    }
  });
});

describe('runAgentStandalone parity', () => {
  it('produces the same output as manifold.execute for a text agent', async () => {
    const agent = defineAgent({
      id: 'echo',
      name: 'E',
      description: 'e',
      instructions: 'echo',
      outputMode: 'text',
    });

    // Manifold run
    const llmManifold = createStubSignal([{ content: 'same-output' }]);
    const m = createManifold({ llm: llmManifold });
    m.registerAgent(agent);
    const resManifold = await m.execute('echo', 'hello');

    // Standalone run
    const llmStandalone = createStubSignal([{ content: 'same-output' }]);
    const resStandalone = await runAgentStandalone(agent, 'hello', { llm: llmStandalone });

    expect(resManifold.ok).toBe(true);
    expect(resStandalone.ok).toBe(true);
    if (resManifold.ok && resStandalone.ok) {
      expect(resManifold.data).toBe(resStandalone.data);
    }
  });

  it('standalone executes tools registered via options.tools', async () => {
    const agent = defineAgent({
      id: 'calc',
      name: 'C',
      description: 'c',
      instructions: '',
      outputMode: 'text',
      tools: ['mul'],
    });
    const tool = defineTool({
      id: 'mul',
      name: 'mul',
      description: 'multiply',
      input: z.object({ a: z.number(), b: z.number() }),
      execute: async ({ a, b }) => ({ product: a * b }),
    });
    const llm = createStubSignal([
      { content: '', toolCalls: [{ id: 'c1', name: 'mul', args: { a: 6, b: 7 } }] },
      { content: '42' },
    ]);
    const result = await runAgentStandalone(agent, 'multiply 6 by 7', {
      llm,
      tools: [tool],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('42');
  });
});
