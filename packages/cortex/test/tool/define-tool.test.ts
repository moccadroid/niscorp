import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineTool } from '../../src';

describe('defineTool', () => {
  it('validates serializable config via Zod', () => {
    const tool = defineTool({
      id: 'search',
      name: 'search',
      description: 'Searches the web.',
      input: z.object({ query: z.string() }),
      execute: async ({ query }) => ({ results: [query] }),
    });
    expect(tool.toolId).toBe('search');
    expect(tool.config.name).toBe('search');
    expect(tool.config.description).toBe('Searches the web.');
  });

  it('rejects missing required fields', () => {
    expect(() =>
      defineTool({
        id: 'bad',
        // missing name, description
        input: z.object({}),
        execute: async () => ({}),
      } as never),
    ).toThrow();
  });

  it('passes through optional fields', () => {
    const tool = defineTool({
      id: 'db',
      name: 'db',
      description: 'Database query.',
      category: 'data',
      riskLevel: 'high',
      timeoutMs: 5000,
      input: z.object({ sql: z.string() }),
      execute: async ({ sql }) => ({ rows: [sql] }),
    });
    expect(tool.config.category).toBe('data');
    expect(tool.config.riskLevel).toBe('high');
    expect(tool.config.timeoutMs).toBe(5000);
  });

  it('wraps execute with input validation', () => {
    const tool = defineTool({
      id: 'calc',
      name: 'calc',
      description: 'Calculator.',
      input: z.object({ a: z.number(), b: z.number() }),
      execute: ({ a, b }) => ({ sum: a + b }),
    });
    // Valid input works
    const validResult = tool.config.execute({ a: 1, b: 2 }, {
      workflowId: 'w', agentId: 'a', signal: new AbortController().signal, bus: {} as never,
    });
    expect(validResult).toEqual({ sum: 3 });

    // Invalid input throws (Zod validation)
    expect(() =>
      tool.config.execute({ a: 'not a number' }, {
        workflowId: 'w', agentId: 'a', signal: new AbortController().signal, bus: {} as never,
      }),
    ).toThrow();
  });

  it('rejects invalid riskLevel', () => {
    expect(() =>
      defineTool({
        id: 'bad',
        name: 'bad',
        description: 'test',
        riskLevel: 'critical' as 'high',
        input: z.object({}),
        execute: async () => ({}),
      }),
    ).toThrow();
  });
});
