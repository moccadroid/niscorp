import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createManifold } from '../../src/manifold/manifold';
import { defineAgent } from '../../src/agent/define-agent';
import { defineTool } from '../../src/tool/define-tool';

describe('Manifold (Phase A)', () => {
  it('registers and unregisters agents and tools', () => {
    const m = createManifold();
    const agent = defineAgent({
      id: 'echo',
      name: 'Echo',
      description: 'Echoes input',
      instructions: 'Repeat the user input verbatim.',
      outputMode: 'text',
    });
    const off = m.registerAgent(agent);
    expect(m._internal.registry.getAgent('echo')).toBeDefined();
    off();
    expect(m._internal.registry.getAgent('echo')).toBeUndefined();
  });

  it('throws on duplicate agent id (programmer error)', () => {
    const m = createManifold();
    const agent = defineAgent({
      id: 'dup',
      name: 'd',
      description: 'd',
      instructions: 'd',
      outputMode: 'text',
    });
    m.registerAgent(agent);
    expect(() => m.registerAgent(agent)).toThrow(/Duplicate agent id/);
  });

  it('throws when defineAgent is structured but no schema', () => {
    expect(() =>
      defineAgent({
        id: 'bad',
        name: 'bad',
        description: 'bad',
        instructions: 'bad',
        outputMode: 'structured',
      }),
    ).toThrow(/structured mode requires an outputSchema/);
  });

  it('previewContext returns chunks for a registered agent using the default spec', async () => {
    const m = createManifold();
    m.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: 'a',
        instructions: 'You are A.',
        outputMode: 'text',
      }),
    );
    const resolved = await m.previewContext('a', 'hello world');
    expect(resolved.chunks.length).toBeGreaterThan(0);
    const sources = resolved.chunks.map((c) => c.source);
    expect(sources).toContain('cortex.system');
    expect(sources).toContain('cortex.input');
  });

  it('previewContext includes registered tools via the default toolsProducer', async () => {
    const m = createManifold();
    m.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: 'a',
        instructions: 'sys',
        outputMode: 'text',
      }),
    );
    m.registerTool(
      defineTool({
        id: 'echo.tool',
        name: 'echo',
        description: 'returns its input',
        input: z.object({ text: z.string() }),
        execute: async (input) => input.text,
      }),
    );
    const resolved = await m.previewContext('a', 'hello');
    const toolChunk = resolved.chunks.find((c) => c.source === 'cortex.tools');
    expect(toolChunk).toBeDefined();
    expect(typeof toolChunk?.content === 'string' && toolChunk?.content.includes('echo.tool')).toBe(true);
  });

  it('execute returns Result.err when no llm client is configured', async () => {
    const m = createManifold();
    m.registerAgent(
      defineAgent({
        id: 'a',
        name: 'A',
        description: 'a',
        instructions: 'sys',
        outputMode: 'text',
      }),
    );
    const result = await m.execute('a', 'hi');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('model_call_failed');
  });

  it('execute returns Result.err when agent is not registered', async () => {
    const m = createManifold();
    const result = await m.execute('does-not-exist', 'hi');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('agent_not_registered');
  });

  it('teesz events into the in-memory event log', async () => {
    const m = createManifold();
    m.bus.emit({
      topic: 'test.topic',
      payload: { x: 1 },
      meta: { timestamp: Date.now(), correlationId: 'c1', workflowId: 'wf1' },
    });
    // Allow the async tee to flush.
    await new Promise<void>((r) => setTimeout(r, 0));
    const events = await m._internal.eventLog.read('wf1');
    expect(events.some((e) => e.topic === 'test.topic')).toBe(true);
  });
});
