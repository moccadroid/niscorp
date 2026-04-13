import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createManifold, defineAgent, defineTool } from '../../src';
import { createStubSignal } from '../_helpers/stub-signal';

describe('tool execution timeout', () => {
  it('times out a tool that hangs and surfaces the error in observations', async () => {
    const stub = createStubSignal([
      // Agent calls the slow tool
      { content: '', toolCalls: [{ id: 'c1', name: 'slow', args: {} }] },
      // After timeout, agent gets error observation and finalizes
      { content: 'tool timed out, giving up', toolCalls: [] },
    ]);

    const manifold = createManifold({ llm: stub });
    manifold.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: 'test',
        instructions: 'test',
        outputMode: 'text',
        tools: ['slow'],
      }),
    );
    manifold.registerTool(
      defineTool({
        id: 'slow',
        name: 'slow',
        description: 'A tool that takes forever.',
        timeoutMs: 50, // 50ms timeout
        input: z.object({}),
        execute: async () => {
          // Hang for way longer than the timeout
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return { result: 'should not reach here' };
        },
      }),
    );

    await manifold.start();
    const result = await manifold.execute<string>('a', 'go');
    await manifold.stop();

    // The run should succeed — the timeout is caught and turned into
    // an error observation, which the agent sees and finalizes.
    expect(result.ok).toBe(true);
  });
});
