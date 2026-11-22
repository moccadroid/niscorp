import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createSignal } from '@niscorp/signal';
import { defineAgent, type CortexEvent } from '../src';

const replies = (turns: Array<{ content: string; finishReason: string }>) => {
  let at = 0;
  const create = async () => {
    const turn = turns[at];
    at += 1;
    if (!turn) throw new Error(`no scripted turn ${at - 1}`);
    return (async function* () {
      yield { choices: [{ index: 0, delta: { content: turn.content }, finish_reason: null }] };
      yield { choices: [{ index: 0, delta: {}, finish_reason: turn.finishReason }] };
    })();
  };
  const llm = createSignal(
    { baseUrl: 'https://fake.api.com/v1', apiKey: 'k', model: 'm', capabilities: { nativeTools: true } },
    { client: { chat: { completions: { create } } } },
  );
  return { llm, calls: () => at };
};

const Picks = z.object({ picks: z.array(z.string()) });
const cut = { content: '{"data":{"picks":["a","b","c', finishReason: 'length' };
const whole = { content: '{"data":{"picks":["a","b","c","d"]}}', finishReason: 'stop' };

describe('an agent whose reply the provider cut off', () => {
  it('is retried as a termination under output.refuseCutOff', async () => {
    const { llm, calls } = replies([cut, whole]);
    const retries: string[] = [];
    const agent = defineAgent({ id: 'picker', instructions: 'Pick.', output: { schema: Picks, strategy: 'emit', refuseCutOff: true } });
    const result = await agent.run('go', {
      llm,
      onEvent: (event: CortexEvent) => {
        if (event.type === 'retry') retries.push(`${event.kind}: ${event.issues}`);
      },
    }).result;
    expect(result.ok && result.output.data).toEqual({ picks: ['a', 'b', 'c', 'd'] });
    expect(retries).toEqual(['termination: the reply was cut off (finish reason "length") before its JSON closed. It began: {"data":{"picks":["a","b","c']);
    expect(calls()).toBe(2);
  });

  it('is accepted as far as it was written by default, as before', async () => {
    const { llm, calls } = replies([cut]);
    const agent = defineAgent({ id: 'picker', instructions: 'Pick.', output: { schema: Picks, strategy: 'emit' } });
    const result = await agent.run('go', { llm }).result;
    expect(result.ok && result.output.data).toEqual({ picks: ['a', 'b'] });
    expect(calls()).toBe(1);
  });
});

describe('an agent on Groq whose rejected attempt arrived cut short', () => {
  const groq = () => {
    let at = 0;
    const create = async () => {
      at += 1;
      if (at === 1) {
        throw Object.assign(new Error('400 tool_use_failed'), {
          error: { code: 'tool_use_failed', failed_generation: '{"name":"respond","arguments":{"data":{"picks":["a","b","c' },
        });
      }
      return (async function* () {
        yield { choices: [{ index: 0, delta: { content: whole.content }, finish_reason: null }] };
        yield { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
      })();
    };
    return { llm: createSignal('groq', { apiKey: 'k', client: { chat: { completions: { create } } } }), calls: () => at };
  };

  it('is retried under output.refuseCutOff', async () => {
    const { llm, calls } = groq();
    const agent = defineAgent({ id: 'picker', instructions: 'Pick.', output: { schema: Picks, refuseCutOff: true } });
    const result = await agent.run('go', { llm }).result;
    expect(result.ok && result.output.data).toEqual({ picks: ['a', 'b', 'c', 'd'] });
    expect(calls()).toBe(2);
  });

  it('is accepted as far as it was written by default, as before', async () => {
    const { llm, calls } = groq();
    const agent = defineAgent({ id: 'picker', instructions: 'Pick.', output: { schema: Picks } });
    const result = await agent.run('go', { llm }).result;
    expect(result.ok && result.output.data).toEqual({ picks: ['a', 'b'] });
    expect(calls()).toBe(1);
  });
});
