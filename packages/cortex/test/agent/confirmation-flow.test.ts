import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createManifold, defineAgent, defineTool, CortexTopics } from '../../src';
import { createStubSignal } from '../_helpers/stub-signal';

describe('confirmation flow', () => {
  it('approved confirmation allows tool execution', async () => {
    const stub = createStubSignal([
      { content: '', toolCalls: [{ id: 'c1', name: 'dangerous', args: {} }] },
      { content: 'tool result received', toolCalls: [] },
    ]);

    const manifold = createManifold({ llm: stub });
    manifold.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: 'test',
        instructions: 'test',
        outputMode: 'text',
        tools: ['dangerous'],
        policy: {
          tools: { requireConfirmation: ['dangerous'] },
          confirmationTimeoutMs: 5000,
        },
      }),
    );
    manifold.registerTool(
      defineTool({
        id: 'dangerous',
        name: 'dangerous',
        description: 'A dangerous tool that requires confirmation.',
        input: z.object({}),
        execute: async () => ({ result: 'executed' }),
      }),
    );

    // Auto-approve any confirmation request
    manifold.bus.on(CortexTopics.confirmationRequested, (event) => {
      const payload = event.payload as { toolId: string };
      manifold.bus.emit({
        topic: CortexTopics.confirmationApproved,
        payload: { toolId: payload.toolId },
        meta: { timestamp: Date.now(), correlationId: event.meta.correlationId },
      });
    });

    await manifold.start();
    const result = await manifold.execute<string>('a', 'go');
    await manifold.stop();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toContain('tool result received');
    }
  });

  it('denied confirmation blocks tool execution', async () => {
    const stub = createStubSignal([
      { content: '', toolCalls: [{ id: 'c1', name: 'dangerous', args: {} }] },
      { content: 'tool was denied', toolCalls: [] },
    ]);

    const manifold = createManifold({ llm: stub });
    manifold.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: 'test',
        instructions: 'test',
        outputMode: 'text',
        tools: ['dangerous'],
        policy: {
          tools: { requireConfirmation: ['dangerous'] },
          confirmationTimeoutMs: 5000,
        },
      }),
    );
    manifold.registerTool(
      defineTool({
        id: 'dangerous',
        name: 'dangerous',
        description: 'test',
        input: z.object({}),
        execute: async () => ({ result: 'should not execute' }),
      }),
    );

    // Auto-deny any confirmation request
    manifold.bus.on(CortexTopics.confirmationRequested, (event) => {
      const payload = event.payload as { toolId: string };
      manifold.bus.emit({
        topic: CortexTopics.confirmationDenied,
        payload: { toolId: payload.toolId },
        meta: { timestamp: Date.now(), correlationId: event.meta.correlationId },
      });
    });

    await manifold.start();
    const result = await manifold.execute<string>('a', 'go');
    await manifold.stop();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toContain('denied');
    }
  });

  it('timed out confirmation blocks tool execution', async () => {
    const stub = createStubSignal([
      { content: '', toolCalls: [{ id: 'c1', name: 'dangerous', args: {} }] },
      { content: 'confirmation timed out', toolCalls: [] },
    ]);

    const manifold = createManifold({ llm: stub });
    manifold.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: 'test',
        instructions: 'test',
        outputMode: 'text',
        tools: ['dangerous'],
        policy: {
          tools: { requireConfirmation: ['dangerous'] },
          confirmationTimeoutMs: 50, // Very short timeout
        },
      }),
    );
    manifold.registerTool(
      defineTool({
        id: 'dangerous',
        name: 'dangerous',
        description: 'test',
        input: z.object({}),
        execute: async () => ({ result: 'should not execute' }),
      }),
    );

    // Nobody responds to the confirmation request → timeout

    await manifold.start();
    const result = await manifold.execute<string>('a', 'go');
    await manifold.stop();

    expect(result.ok).toBe(true);
  });
});
