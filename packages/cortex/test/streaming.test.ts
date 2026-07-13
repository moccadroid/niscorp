import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineAgent, defineTool, type CortexEvent } from '../src';
import { stubSignal } from './helpers/stub-signal';

const OutSchema = z.object({ answer: z.number() });

describe('streaming — respond strategy', () => {
  it('streams respond args as output-delta and solid output-partial events', async () => {
    const agent = defineAgent({
      id: 'streamy',
      instructions: 'respond',
      output: { schema: OutSchema },
    });
    const llm = stubSignal([
      {
        toolCalls: [
          { id: 'c1', name: 'respond', args: { response: 'the answer is 42', data: { answer: 42 } } },
        ],
      },
    ]);

    const events: CortexEvent[] = [];
    const result = await agent.run('go', { llm, onEvent: (event) => events.push(event) }).result;
    expect(result.ok).toBe(true);

    // output-delta fragments reassemble into the respond args JSON.
    const deltas = events.filter((event) => event.type === 'output-delta');
    expect(deltas.length).toBeGreaterThan(1);
    const joined = deltas.map((event) => (event.type === 'output-delta' ? event.text : '')).join('');
    expect(JSON.parse(joined)).toEqual({ response: 'the answer is 42', data: { answer: 42 } });

    // solid produced progressively parsed envelopes.
    const partials = events.filter((event) => event.type === 'output-partial');
    expect(partials.length).toBeGreaterThan(0);
    const last = partials[partials.length - 1];
    expect(last?.type).toBe('output-partial');
    if (last?.type === 'output-partial') {
      expect(JSON.stringify(last.output)).toContain('the answer is 42');
    }
  });

  it('does not stream domain tool args as output', async () => {
    const noise = defineTool({
      id: 'noise',
      name: 'noise',
      description: 'noise',
      input: z.object({ n: z.number() }),
      execute: () => 'ok',
    });
    const agent = defineAgent({
      id: 'quiet',
      instructions: 'respond',
      output: { schema: OutSchema },
      tools: [noise],
    });
    const llm = stubSignal([
      { toolCalls: [{ id: 'c1', name: 'noise', args: { n: 1 } }] },
      { toolCalls: [{ id: 'c2', name: 'respond', args: { data: { answer: 1 } } }] },
    ]);

    const events: CortexEvent[] = [];
    await agent.run('go', { llm, onEvent: (event) => events.push(event) }).result;

    const deltas = events
      .filter((event) => event.type === 'output-delta')
      .map((event) => (event.type === 'output-delta' ? event.text : ''))
      .join('');
    // Only the respond call streamed as output.
    expect(deltas).not.toContain('"n"');
    expect(deltas).toContain('"answer"');
  });
});

describe('streaming — text strategy', () => {
  it('mirrors model text as output-delta and validates the final envelope', async () => {
    const agent = defineAgent({
      id: 'texty',
      instructions: 'reply with the envelope JSON',
      output: { schema: OutSchema, strategy: 'emit' },
    });
    const payload = JSON.stringify({ data: { answer: 9 }, reasoning: 'because' });
    const llm = stubSignal([{ text: [payload.slice(0, 12), payload.slice(12)] }]);

    const events: CortexEvent[] = [];
    const result = await agent.run('go', { llm, onEvent: (event) => events.push(event) }).result;

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.data.answer).toBe(9);
    expect(result.meta.strategy).toBe('emit');

    const deltas = events
      .filter((event) => event.type === 'output-delta')
      .map((event) => (event.type === 'output-delta' ? event.text : ''))
      .join('');
    expect(deltas).toBe(payload);

    // text strategy injects the schema docs as a system chunk.
    const firstRequest = llm.requests[0];
    const systemContents = (firstRequest?.messages ?? [])
      .filter((message) => message.role === 'system')
      .map((message) => (typeof message.content === 'string' ? message.content : ''));
    expect(systemContents.some((content) => content.includes('OUTPUT SCHEMA'))).toBe(true);
  });

  it('retry resets and re-streams (fence-wrapped then corrected)', async () => {
    const agent = defineAgent({
      id: 'fency',
      instructions: 'reply with the envelope JSON',
      output: { schema: OutSchema, strategy: 'emit' },
    });
    const bad = 'no json here at all';
    const good = JSON.stringify({ data: { answer: 3 } });
    const llm = stubSignal([{ text: [bad] }, { text: ['```json\n', good, '\n```'] }]);

    const events: CortexEvent[] = [];
    const result = await agent.run('go', { llm, onEvent: (event) => events.push(event) }).result;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.data.answer).toBe(3);

    const retries = events.filter((event) => event.type === 'retry');
    expect(retries).toHaveLength(1);
    // Prose is a transport failure (could not deliver) — kind
    // 'termination', uncounted against the revision budget.
    expect(retries[0]?.type === 'retry' && retries[0].kind).toBe('termination');
  });
});
