import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineAgent } from '../../src';

describe('defineAgent', () => {
  it('validates serializable config via Zod', () => {
    const agent = defineAgent({
      id: 'test',
      name: 'Test',
      description: 'A test agent.',
      instructions: 'Be helpful.',
      outputMode: 'text',
    });
    expect(agent.agentId).toBe('test');
    expect(agent.config.name).toBe('Test');
    expect(agent.config.outputMode).toBe('text');
  });

  it('rejects invalid outputMode', () => {
    expect(() =>
      defineAgent({
        id: 'bad',
        name: 'Bad',
        description: 'test',
        instructions: 'test',
        outputMode: 'invalid' as 'text',
      }),
    ).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() =>
      defineAgent({
        id: 'bad',
        name: 'Bad',
        // missing description and instructions
      } as never),
    ).toThrow();
  });

  it('throws when structured mode lacks outputSchema', () => {
    expect(() =>
      defineAgent({
        id: 'bad',
        name: 'Bad',
        description: 'test',
        instructions: 'test',
        outputMode: 'structured',
        // no outputSchema
      }),
    ).toThrow(/outputSchema/);
  });

  it('accepts structured mode with outputSchema', () => {
    const schema = z.object({ name: z.string() });
    const agent = defineAgent({
      id: 'ok',
      name: 'OK',
      description: 'test',
      instructions: 'test',
      outputMode: 'structured',
      outputSchema: schema,
    });
    expect(agent.config.outputSchema).toBe(schema);
  });

  it('passes through optional fields', () => {
    const agent = defineAgent({
      id: 'full',
      name: 'Full',
      description: 'test',
      instructions: 'test',
      outputMode: 'text',
      model: 'gpt-4',
      tools: ['tool-a', 'tool-b'],
      maxToolIterations: 5,
      maxTicks: 10,
      maxOutputRetries: 3,
    });
    expect(agent.config.model).toBe('gpt-4');
    expect(agent.config.tools).toEqual(['tool-a', 'tool-b']);
    expect(agent.config.maxToolIterations).toBe(5);
    expect(agent.config.maxTicks).toBe(10);
    expect(agent.config.maxOutputRetries).toBe(3);
  });
});
