import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineAgent, defineTool } from '../src';
import { stubSignal } from './helpers/stub-signal';

// The producer principle: context is owned by whoever owns the knowledge.
// Agents compose producers by spreading; RunOptions.producers attaches app
// knowledge to any agent without editing it; tools carry their own guides,
// assembled into one TOOL GUIDES section only when the tool is on the run.

const guidedTool = defineTool({
  id: 'lookup',
  name: 'lookup',
  description: 'Looks something up.',
  guide: 'Use lookup FIRST; pass the exact id, never a name.',
  input: z.object({ id: z.string() }),
  execute: ({ id }) => `found ${id}`,
});

const plainTool = defineTool({
  id: 'plain',
  name: 'plain',
  description: 'No guide.',
  input: z.object({}),
  execute: () => 'ok',
});

const systemTexts = (messages: ReadonlyArray<{ role: string; content: unknown }>): string[] =>
  messages.filter((m) => m.role === 'system' && typeof m.content === 'string').map((m) => m.content as string);

describe('producers', () => {
  it('run producers are appended after the agent\'s own, in order', async () => {
    const agent = defineAgent({
      id: 'a',
      instructions: 'IDENTITY',
      context: ['FIRST', 'SECOND'],
    });
    const preview = await agent.preview('go', { producers: ['ATTACHED'] });

    const texts = systemTexts(preview.messages);
    expect(texts.indexOf('IDENTITY')).toBeLessThan(texts.indexOf('FIRST'));
    expect(texts.indexOf('FIRST')).toBeLessThan(texts.indexOf('SECOND'));
    expect(texts.indexOf('SECOND')).toBeLessThan(texts.indexOf('ATTACHED'));
  });

  it('a tool\'s guide travels with the tool into one TOOL GUIDES section', async () => {
    const agent = defineAgent({ id: 'a', instructions: 'x', tools: [guidedTool, plainTool] });
    const preview = await agent.preview('go');

    const guides = systemTexts(preview.messages).find((text) => text.startsWith('TOOL GUIDES'));
    expect(guides).toBeDefined();
    expect(guides).toContain('── lookup ──');
    expect(guides).toContain('pass the exact id');
    // A guideless tool contributes nothing.
    expect(guides).not.toContain('plain');
  });

  it('no guided tools → no TOOL GUIDES section', async () => {
    const agent = defineAgent({ id: 'a', instructions: 'x', tools: [plainTool] });
    const preview = await agent.preview('go');
    expect(systemTexts(preview.messages).some((text) => text.startsWith('TOOL GUIDES'))).toBe(false);
  });

  it('per-run tools bring their guides too', async () => {
    const agent = defineAgent({ id: 'a', instructions: 'x' });
    const preview = await agent.preview('go', { tools: [guidedTool] });
    const guides = systemTexts(preview.messages).find((text) => text.startsWith('TOOL GUIDES'));
    expect(guides).toContain('── lookup ──');
  });

  it('a function guide is constructed at assembly (deferred composition)', async () => {
    let built = 0;
    const deferred = defineTool({
      id: 'lazy',
      name: 'lazy',
      description: 'd',
      guide: () => {
        built += 1;
        return 'LAZY GUIDE';
      },
      input: z.object({}),
      execute: () => 'ok',
    });
    const agent = defineAgent({ id: 'a', instructions: 'x', tools: [deferred] });
    expect(built).toBe(0);
    const preview = await agent.preview('go');
    expect(built).toBe(1);
    expect(systemTexts(preview.messages).some((text) => text.includes('LAZY GUIDE'))).toBe(true);
  });

  it('a producer may emit a GROUP — string[] becomes one system chunk per string', async () => {
    const agent = defineAgent({
      id: 'a',
      instructions: 'x',
      context: [() => ['FACT ONE', 'FACT TWO', ''], 'TAIL'],
    });
    const preview = await agent.preview('go');

    const texts = systemTexts(preview.messages);
    expect(texts).toContain('FACT ONE');
    expect(texts).toContain('FACT TWO');
    // Empty strings in a group are skipped; order is preserved.
    expect(texts.indexOf('FACT TWO')).toBe(texts.indexOf('FACT ONE') + 1);
    expect(texts.indexOf('TAIL')).toBe(texts.indexOf('FACT TWO') + 1);
  });

  it('a tool guide may be a string[] — joined as lines in its section', async () => {
    const listTool = defineTool({
      id: 'lines',
      name: 'lines',
      description: 'd',
      guide: ['first rule', 'second rule'],
      input: z.object({}),
      execute: () => 'ok',
    });
    const agent = defineAgent({ id: 'a', instructions: 'x', tools: [listTool] });
    const preview = await agent.preview('go');
    const guides = systemTexts(preview.messages).find((text) => text.startsWith('TOOL GUIDES'));
    expect(guides).toContain('first rule\nsecond rule');
  });

  it('the run itself sees producers + guides in its prefix', async () => {
    const llm = stubSignal([
      { toolCalls: [{ id: 'c1', name: 'respond', args: { response: 'done' } }] },
    ]);
    const agent = defineAgent({ id: 'a', instructions: 'x', tools: [guidedTool] });
    const result = await agent.run('go', { llm, producers: ['APP FACT'] }).result;
    expect(result.ok).toBe(true);

    const first = llm.requests[0];
    const texts = systemTexts(first?.messages ?? []);
    expect(texts).toContain('APP FACT');
    expect(texts.some((text) => text.startsWith('TOOL GUIDES'))).toBe(true);
  });
});
