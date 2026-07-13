import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineAgent, defineTool } from '../src';
import { stubSignal } from './helpers/stub-signal';

// The finish protocol is ONE cortex-owned system chunk stating how the
// run ends under the RESOLVED transport. Agents never author finish
// lines — they cannot know which transport resolution picked.

const Small = z.object({ value: z.string() });

const noopTool = defineTool({
  id: 'noop',
  name: 'noop',
  description: 'Does nothing.',
  input: z.object({}),
  execute: () => 'ok',
});

const systemTexts = (messages: ReadonlyArray<{ role: string; content: unknown }>): string[] =>
  messages.filter((m) => m.role === 'system' && typeof m.content === 'string').map((m) => m.content as string);

const finishChunk = (messages: ReadonlyArray<{ role: string; content: unknown }>): string | undefined =>
  systemTexts(messages).find((text) => text.startsWith('FINISH PROTOCOL'));

describe('finish protocol chunk', () => {
  it('respond: offers both doors — the tool and the emitted envelope', async () => {
    const agent = defineAgent({ id: 'a', instructions: 'x', output: { schema: Small } });
    const preview = await agent.preview('go');
    expect(preview.strategy).toBe('respond');
    const chunk = finishChunk(preview.messages);
    expect(chunk).toContain('`respond`');
    expect(chunk).toContain('ONLY that JSON envelope');
  });

  it('emit: the entire final message is the envelope; the respond tool is never mentioned', async () => {
    const agent = defineAgent({ id: 'a', instructions: 'x', output: { schema: Small, strategy: 'emit' } });
    const preview = await agent.preview('go');
    expect(preview.strategy).toBe('emit');
    const chunk = finishChunk(preview.messages);
    expect(chunk).toContain('ENTIRE final message');
    expect(chunk).toContain('no code fences');
    expect(chunk).not.toContain('respond');
    // No respond descriptor on the wire either.
    expect(preview.tools.some((tool) => tool.name === 'respond')).toBe(false);
  });

  it('is the LAST system chunk before the input, after the schema doc', async () => {
    const agent = defineAgent({ id: 'a', instructions: 'x', output: { schema: Small, strategy: 'emit' } });
    const preview = await agent.preview('go');
    const texts = systemTexts(preview.messages);
    expect(texts[texts.length - 1]).toContain('FINISH PROTOCOL');
    expect(texts[texts.length - 2]).toContain('OUTPUT SCHEMA');
  });

  it('chat agents (no schema) get an envelope without data', async () => {
    const agent = defineAgent({ id: 'a', instructions: 'x' });
    const preview = await agent.preview('go');
    const chunk = finishChunk(preview.messages);
    expect(chunk).toContain('"response": string');
    expect(chunk).not.toContain('"data"');
  });

  it('an arg-mangling provider auto-resolves the run to emit and finishes on content', async () => {
    const llm = stubSignal(
      [
        { toolCalls: [{ id: 'c1', name: 'noop', args: {} }] },
        { text: ['{ "data": { "value": "done" }, "reasoning": "why" }'] },
      ],
      { capabilities: { manglesNestedToolArgs: true } },
    );
    const agent = defineAgent({ id: 'a', instructions: 'x', tools: [noopTool], output: { schema: Small } });
    const result = await agent.run('go', { llm }).result;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.meta.strategy).toBe('emit');
      expect(result.output.data).toEqual({ value: 'done' });
    }
    // No respond tool was ever advertised.
    for (const request of llm.requests) {
      expect((request.tools ?? []).some((tool) => tool.name === 'respond')).toBe(false);
    }
  });

  it('forceTool cannot combine with emit — config error at run creation', () => {
    const llm = stubSignal([], { capabilities: { manglesNestedToolArgs: true } });
    const agent = defineAgent({
      id: 'a',
      instructions: 'x',
      tools: [noopTool],
      output: { schema: Small, forceTool: true },
    });
    expect(() => agent.run('go', { llm })).toThrow(/forceTool/);
  });
});
