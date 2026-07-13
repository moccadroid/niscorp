import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineAgent, defineTool } from '../src';
import { stubSignal } from './helpers/stub-signal';

describe('defineTool', () => {
  it('validates serializable config strictly', () => {
    expect(() =>
      defineTool({
        id: 't',
        name: 't',
        description: 'd',
        // @ts-expect-error — unknown config keys are rejected at runtime too
        bogus: true,
        input: z.object({}),
        execute: () => 'ok',
      }),
    ).toThrow();
  });

  it('re-validates input through the schema before execute', async () => {
    const tool = defineTool({
      id: 'strict',
      name: 'strict',
      description: 'd',
      input: z.object({ n: z.number() }),
      execute: ({ n }) => n * 2,
    });
    const context = {
      runId: 'r',
      agentId: 'a',
      agentPath: ['a'],
      signal: new AbortController().signal,
      forward: () => () => undefined,
    };
    expect(tool.config.execute({ n: 21 }, context)).toBe(42);
    expect(() => tool.config.execute({ n: 'x' }, context)).toThrow();
  });
});

describe('defineAgent', () => {
  it('rejects empty ids and duplicate tool ids', () => {
    expect(() => defineAgent({ id: '', instructions: 'x' })).toThrow(/empty/);

    const tool = defineTool({
      id: 'dup',
      name: 'dup',
      description: 'd',
      input: z.object({}),
      execute: () => 'ok',
    });
    expect(() =>
      defineAgent({ id: 'a', instructions: 'x', tools: [tool, tool] }),
    ).toThrow(/duplicate/);
  });

  it('throws when no llm is available anywhere', () => {
    const agent = defineAgent({ id: 'a', instructions: 'x' });
    expect(() => agent.run('go')).toThrow(/no llm/);
  });

  it('instructions can be a function of deps', async () => {
    type Deps = { name: string };
    const agent = defineAgent<undefined, Deps>({
      id: 'depsy',
      instructions: ({ deps }) => `You are ${deps.name}.`,
      context: [({ deps }) => `Extra for ${deps.name}.`],
    });
    const llm = stubSignal([
      { toolCalls: [{ id: 'c1', name: 'respond', args: { response: 'hi' } }] },
    ]);

    const result = await agent.run('hello', { llm, deps: { name: 'Ray' } }).result;
    expect(result.ok).toBe(true);

    const systems = (llm.requests[0]?.messages ?? [])
      .filter((message) => message.role === 'system')
      .map((message) => (typeof message.content === 'string' ? message.content : ''));
    expect(systems[0]).toBe('You are Ray.');
    expect(systems[1]).toBe('Extra for Ray.');
  });

  it('preview shows messages, tools (incl. respond) and the resolved strategy', async () => {
    const agent = defineAgent({
      id: 'previewable',
      instructions: 'do things',
      output: { schema: z.object({ ok: z.boolean() }) },
    });
    const preview = await agent.preview('what would you send?');

    expect(preview.strategy).toBe('respond');
    expect(preview.tools.some((tool) => tool.name === 'respond')).toBe(true);
    expect(preview.messages[0]?.role).toBe('system');
    expect(preview.messages[preview.messages.length - 1]?.role).toBe('user');
    expect(preview.estimatedTokens).toBeGreaterThan(0);
  });
});
