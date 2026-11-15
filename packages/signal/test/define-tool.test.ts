import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createSignal, defineTool, SignalError } from '../src';

describe('defineTool', () => {
  it('creates a tool with typed input', () => {
    const tool = defineTool({
      name: 'greet',
      description: 'Greet someone',
      input: z.object({ name: z.string() }),
      execute: ({ name }) => `Hello, ${name}!`,
    });

    expect(tool.name).toBe('greet');
    expect(tool.description).toBe('Greet someone');
    expect(tool.inputSchema).toBeDefined();
  });

  it('validates input via Zod schema', () => {
    const tool = defineTool({
      name: 'add',
      description: 'Add numbers',
      input: z.object({ a: z.number(), b: z.number() }),
      execute: ({ a, b }) => a + b,
    });

    const parsed = tool.inputSchema.safeParse({ a: 1, b: 2 });
    expect(parsed.success).toBe(true);

    const bad = tool.inputSchema.safeParse({ a: 'not a number', b: 2 });
    expect(bad.success).toBe(false);
  });

  it('execute can be sync or async', async () => {
    const syncTool = defineTool({
      name: 'sync',
      description: 'Sync tool',
      input: z.object({}),
      execute: () => 'sync result',
    });

    const asyncTool = defineTool({
      name: 'async',
      description: 'Async tool',
      input: z.object({}),
      execute: async () => 'async result',
    });

    expect(syncTool.execute({})).toBe('sync result');
    expect(await asyncTool.execute({})).toBe('async result');
  });
});

describe('a tool input schema with no JSON Schema', () => {
  const cases: [string, z.ZodType][] = [
    ['a transform', z.object({ when: z.string().transform((text) => text.length) })],
    ['a date', z.object({ when: z.date() })],
  ];
  it.each(cases)('%s rejects the call before any request, with the schema library\'s own error', async (_label, input) => {
    let asked = 0;
    const client = {
      chat: {
        completions: {
          create: async () => {
            asked += 1;
            throw new Error('the provider was asked');
          },
        },
      },
    };
    const signal = createSignal(
      { baseUrl: 'https://fake.api.com/v1', apiKey: 'k', model: 'm', capabilities: { nativeTools: true } },
      { client },
    );
    const tool = defineTool({ name: 't', description: 'A tool', input, execute: () => 'ok' });

    const refusal: unknown = await signal.tools([tool]).complete('go').catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(Error);
    expect(refusal).not.toBeInstanceOf(SignalError);
    expect(String(refusal)).toContain('cannot be represented in JSON Schema');
    expect(asked).toBe(0);
  });
});

describe('a tool that takes no arguments', () => {
  it('runs when the provider streams its call with no argument text', async () => {
    let turn = 0;
    const client = {
      chat: {
        completions: {
          create: async () => {
            turn += 1;
            const chunk = turn === 1
              ? { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'now' } }] }, finish_reason: 'tool_calls' }] }
              : { choices: [{ delta: { content: 'It is noon.' }, finish_reason: 'stop' }] };
            return (async function* () {
              yield chunk;
            })();
          },
        },
      },
    };
    const signal = createSignal(
      { baseUrl: 'https://fake.api.com/v1', apiKey: 'k', model: 'm', capabilities: { nativeTools: true } },
      { client },
    );
    const now = defineTool({ name: 'now', description: 'The time.', input: z.object({}), execute: () => '12:00' });

    const { response, meta } = await signal.tools([now]).complete('What time is it?');
    expect(meta.toolCalls.map((call) => call.result)).toEqual(['12:00']);
    expect(response).toBe('It is noon.');
  });
});
