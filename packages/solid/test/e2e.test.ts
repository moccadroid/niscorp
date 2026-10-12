import { describe, it, expect, vi } from 'vitest';
import { at, lastOf } from './helpers/at';
import { z } from 'zod';
import { createStream } from '../src/create-stream';
import { simulateStream, simulateAsyncStream, generatePayload } from './helpers/simulate-stream';

const LLMResponseSchema = z.object({
  widget: z.object({
    type: z.string(),
    title: z.string(),
  }),
  response: z.string(),
  reasoning: z.string(),
  items: z.array(z.object({
    id: z.number(),
    label: z.string(),
    score: z.number(),
    tags: z.array(z.string()),
  })),
  meta: z.object({
    model: z.string(),
    temperature: z.number(),
    tokens: z.number(),
  }),
});

type LLMResponse = z.infer<typeof LLMResponseSchema>;

const INITIAL: LLMResponse = {
  widget: { type: '', title: '' },
  response: '',
  reasoning: '',
  items: [],
  meta: { model: '', temperature: 0, tokens: 0 },
};

describe('e2e — full lifecycle', () => {
  const json = generatePayload({ responseLength: 200, itemCount: 3 });
  const expected = JSON.parse(json);

  it('token-mode streaming produces correct final state', () => {
    const stream = createStream({ schema: LLMResponseSchema, initial: INITIAL });
    simulateStream(stream, json, { mode: 'token' });

    const final = stream.current();
    expect(final).toEqual(expected);
  });

  it('char-by-char streaming produces correct final state', () => {
    const stream = createStream({ schema: LLMResponseSchema, initial: INITIAL });
    simulateStream(stream, json, { mode: 'char' });

    expect(stream.current()).toEqual(expected);
  });

  it('random chunk streaming produces correct final state', () => {
    const stream = createStream({ schema: LLMResponseSchema, initial: INITIAL });
    simulateStream(stream, json, { mode: 'random', minChunk: 1, maxChunk: 30 });

    expect(stream.current()).toEqual(expected);
  });

  it('fixed chunk streaming produces correct final state', () => {
    const stream = createStream({ schema: LLMResponseSchema, initial: INITIAL });
    simulateStream(stream, json, { mode: 'fixed', chunkSize: 7 });

    expect(stream.current()).toEqual(expected);
  });
});

describe('e2e — progressive observation', () => {
  const json = generatePayload({ responseLength: 100, itemCount: 2 });

  it('widget fields appear before response completes', () => {
    const stream = createStream({ schema: LLMResponseSchema, initial: INITIAL });
    const widgetSnapshots: Array<{ type: string; title: string }> = [];
    let responseAtWidgetComplete = '';

    stream.select<{ type: string; title: string }>('widget').on(value => {
      widgetSnapshots.push(structuredClone(value));
    });

    stream.select<string>('widget.title').onFinal(() => {
      responseAtWidgetComplete = stream.current().response;
    });

    simulateStream(stream, json, { mode: 'char' });

    expect(widgetSnapshots.length).toBeGreaterThanOrEqual(2);
    expect(lastOf(widgetSnapshots).type).toBe('card');

    expect(responseAtWidgetComplete.length).toBeLessThanOrEqual(
      stream.current().response.length,
    );
  });

  it('items array grows progressively', () => {
    const stream = createStream({ schema: LLMResponseSchema, initial: INITIAL });
    const itemCountHistory: number[] = [];

    stream.select<unknown[]>('items').on(items => {
      itemCountHistory.push(items.length);
    });

    simulateStream(stream, json, { mode: 'token' });

    expect(itemCountHistory[0]).toBe(0);
    expect(itemCountHistory[itemCountHistory.length - 1]).toBe(2);
    expect(itemCountHistory.length).toBeGreaterThanOrEqual(3);
  });

  it('on() listener receives every distinct state change', () => {
    const stream = createStream({ schema: LLMResponseSchema, initial: INITIAL });
    const states: LLMResponse[] = [];

    stream.on(value => states.push(structuredClone(value)));

    simulateStream(stream, json, { mode: 'char' });

    expect(states[0]).toEqual(INITIAL);

    const expected = JSON.parse(json);
    expect(states[states.length - 1]).toEqual(expected);

    expect(states.length).toBeGreaterThan(10);

    for (let i = 1; i < states.length; i++) {
      expect(states[i]).not.toBe(states[i - 1]);
    }
  });
});

describe('e2e — finalization ordering', () => {
  const json = generatePayload({ responseLength: 100, itemCount: 2 });

  it('subtrees finalize in JSON key order', async () => {
    const stream = createStream({ schema: LLMResponseSchema, initial: INITIAL });
    const finalizationOrder: string[] = [];

    stream.select('widget').onFinal(() => finalizationOrder.push('widget'));
    stream.select('response').onFinal(() => finalizationOrder.push('response'));
    stream.select('reasoning').onFinal(() => finalizationOrder.push('reasoning'));
    stream.select('items').onFinal(() => finalizationOrder.push('items'));
    stream.select('meta').onFinal(() => finalizationOrder.push('meta'));

    simulateStream(stream, json, { mode: 'token' });

    expect(finalizationOrder.slice(0, 4)).toEqual(['widget', 'response', 'reasoning', 'items']);
    expect(finalizationOrder).toContain('meta');
  });

  it('final() resolves with correct value after streaming completes', async () => {
    const stream = createStream({ schema: LLMResponseSchema, initial: INITIAL });
    const finalPromise = stream.final();

    simulateStream(stream, json, { mode: 'random', minChunk: 5, maxChunk: 20 });
    stream.close();

    const result = await finalPromise;
    expect(result).toEqual(JSON.parse(json));
  });
});

describe('e2e — async streaming', () => {
  it('works with async delays between chunks', async () => {
    const json = generatePayload({ responseLength: 50, itemCount: 1 });
    const stream = createStream({ schema: LLMResponseSchema, initial: INITIAL });
    const expected = JSON.parse(json);

    await simulateAsyncStream(stream, json, { mode: 'fixed', chunkSize: 20, delayMs: 1 });

    expect(stream.current()).toEqual(expected);
  });

  it('mid-stream subscription receives current state then updates', async () => {
    const json = generatePayload({ responseLength: 50, itemCount: 1 });
    const stream = createStream({ schema: LLMResponseSchema, initial: INITIAL });
    const chunks = json.match(/.{1,30}/g) ?? [];

    const half = Math.floor(chunks.length / 2);
    for (let i = 0; i < half; i++) {
      stream.write(at(chunks, i));
    }

    const states: LLMResponse[] = [];
    stream.on(v => states.push(structuredClone(v)));

    expect(states.length).toBe(1);
    expect(at(states, 0).widget.type).toBe('card');

    for (let i = half; i < chunks.length; i++) {
      stream.write(at(chunks, i));
    }

    expect(states.length).toBeGreaterThan(1);
    expect(states[states.length - 1]).toEqual(JSON.parse(json));
  });
});

describe('e2e — destroy mid-stream', () => {
  it('destroy halts all processing', () => {
    const json = generatePayload({ responseLength: 100, itemCount: 2 });
    const stream = createStream({ schema: LLMResponseSchema, initial: INITIAL });
    const chunks = json.match(/.{1,20}/g) ?? [];

    const listener = vi.fn();
    stream.on(listener);
    stream.final().catch(() => {});

    const quarter = Math.floor(chunks.length / 4);
    for (let i = 0; i < quarter; i++) {
      stream.write(at(chunks, i));
    }

    const stateAtDestroy = structuredClone(stream.current());
    const callsAtDestroy = listener.mock.calls.length;

    stream.destroy();

    for (let i = quarter; i < chunks.length; i++) {
      stream.write(at(chunks, i));
    }

    expect(stream.current()).toEqual(stateAtDestroy);
    expect(listener.mock.calls.length).toBe(callsAtDestroy);
  });
});
