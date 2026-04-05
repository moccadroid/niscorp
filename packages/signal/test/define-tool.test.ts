import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineTool } from '../src';

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
