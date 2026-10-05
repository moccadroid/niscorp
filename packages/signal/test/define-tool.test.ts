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

    // Valid input
    const parsed = tool.inputSchema.safeParse({ a: 1, b: 2 });
    expect(parsed.success).toBe(true);

    // Invalid input
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

// What DOCS.md says of a tool's input schema: the model is sent its JSON
// Schema, so a schema that has none is refused when the request is built.
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
