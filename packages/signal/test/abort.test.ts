import { describe, it, expect } from 'vitest';
import { getEventListeners } from 'node:events';
import { createSignal, ErrorCode, type StreamEvent } from '../src';
import { sdkOverFetch, textChunk, finishChunk } from './sdk-over-fetch';

type Params = Record<string, unknown>;
type Sent = { params: Params; signal: AbortSignal | undefined };

const abortedBy = (signal: AbortSignal): Promise<never> =>
  new Promise((_resolve, reject) => {
    if (signal.aborted) reject(new Error('Request was aborted.'));
    signal.addEventListener('abort', () => reject(new Error('Request was aborted.')), { once: true });
  });

// Answers as the OpenAI SDK does: a signal it is handed tears the request down.
const fakeProvider = (options: { pauseAfterFirstChunk?: boolean } = {}) => {
  const sent: Sent[] = [];
  const chunks = [
    { choices: [{ delta: { content: 'Hel' } }] },
    { choices: [{ delta: { content: 'lo' }, finish_reason: 'stop' }] },
  ];
  const create = async (params: Params, requestOptions?: { signal?: AbortSignal }) => {
    const signal = requestOptions?.signal;
    sent.push({ params, signal });
    if (signal?.aborted) throw new Error('Request was aborted.');
    if (params['stream'] === true) {
      return (async function* () {
        for (const [index, chunk] of chunks.entries()) {
          yield chunk;
          if (index === 0 && options.pauseAfterFirstChunk && signal) await abortedBy(signal);
        }
      })();
    }
    const answer = { choices: [{ message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }] };
    if (!signal) return new Promise((resolve) => setTimeout(() => resolve(answer), 50));
    return Promise.race([abortedBy(signal), new Promise((resolve) => setTimeout(() => resolve(answer), 50))]);
  };
  return { client: { chat: { completions: { create } } }, sent };
};

const chatClient = (client: unknown) => createSignal({ baseUrl: 'https://provider.test/v1', apiKey: 'k', model: 'm' }, { client });

const rejection = async (promise: Promise<unknown>): Promise<{ code?: unknown }> => {
  try {
    await promise;
  } catch (error) {
    return typeof error === 'object' && error !== null ? error : { code: undefined };
  }
  throw new Error('expected the call to reject, and it resolved');
};

describe('an aborted call ends as an abort', () => {
  it('complete() with an aborted signal set by options() sends nothing and rejects', async () => {
    const provider = fakeProvider();
    const controller = new AbortController();
    controller.abort();
    const error = await rejection(chatClient(provider.client).options({ signal: controller.signal }).complete('hi'));
    expect(error.code).toBe(ErrorCode.PROVIDER_ERROR);
    expect(provider.sent).toEqual([]);
  });

  it('stream() aborted mid-answer ends without a done event and without an error', async () => {
    const provider = fakeProvider({ pauseAfterFirstChunk: true });
    const controller = new AbortController();
    const events: StreamEvent<string>[] = [];
    for await (const event of chatClient(provider.client).stream('hi', { signal: controller.signal })) {
      events.push(event);
      if (event.type === 'text') controller.abort();
    }
    expect(events).toEqual([{ type: 'text', text: 'Hel' }]);
  });

  it('step() takes a signal, hands it to the request, and rejects when it fires', async () => {
    const provider = fakeProvider();
    const controller = new AbortController();
    const pending = chatClient(provider.client).step({ messages: [{ role: 'user', content: 'hi' }] }, { signal: controller.signal });
    setTimeout(() => controller.abort(), 5);
    const error = await rejection(pending);
    expect(error.code).toBe(ErrorCode.PROVIDER_ERROR);
    expect(provider.sent[0]?.signal?.aborted).toBe(true);
  });

  it('step() is aborted by the signal set by options()', async () => {
    const provider = fakeProvider();
    const controller = new AbortController();
    const pending = chatClient(provider.client).options({ signal: controller.signal }).step({ messages: [{ role: 'user', content: 'hi' }] });
    setTimeout(() => controller.abort(), 5);
    expect((await rejection(pending)).code).toBe(ErrorCode.PROVIDER_ERROR);
  });

  it('embed() with an aborted signal set by options() sends nothing and rejects', async () => {
    const provider = fakeProvider();
    const embedded: unknown[] = [];
    const client = {
      ...provider.client,
      embeddings: { create: async (params: Params) => (embedded.push(params), { data: [{ index: 0, embedding: [0.1] }] }) },
    };
    const controller = new AbortController();
    controller.abort();
    const error = await rejection(chatClient(client).options({ signal: controller.signal }).embed('hi'));
    expect(error.code).toBe(ErrorCode.PROVIDER_ERROR);
    expect(embedded).toEqual([]);
  });
});

describe('a long-lived signal set by options()', () => {
  it('carries no listener once the calls it covered have finished', async () => {
    const controller = new AbortController();
    // As the OpenAI SDK does: a listener on the signal it is handed, never taken off.
    const create = async (params: Params, requestOptions?: { signal?: AbortSignal }) => {
      requestOptions?.signal?.addEventListener('abort', () => {});
      if (params['stream'] === true) {
        return (async function* () {
          yield { choices: [{ delta: { content: 'Hello' }, finish_reason: 'stop' }] };
        })();
      }
      return { choices: [{ message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }] };
    };
    const llm = chatClient({ chat: { completions: { create } } }).options({ signal: controller.signal });
    for (let call = 0; call < 15; call += 1) {
      await llm.complete('hi');
      await llm.step({ messages: [{ role: 'user', content: 'hi' }] }, { signal: new AbortController().signal });
    }
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });
});

describe('an abort while the SDK waits out a rate limit', () => {
  it('ends stream() at the abort, with no event and no error', async () => {
    const provider = sdkOverFetch([{ status: 429, headers: { 'retry-after': '3' } }, { chunks: [textChunk('hi'), finishChunk('stop')] }], 2);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    const started = Date.now();
    const events: StreamEvent<string>[] = [];
    for await (const event of chatClient(provider.client).stream('hi', { signal: controller.signal })) events.push(event);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(events).toEqual([]);
  });

  it('leaves no listener on the signal of a stream of many pieces, nor on a long-lived signal after many streams', async () => {
    const handed: AbortSignal[] = [];
    const create = async (_params: Params, requestOptions?: { signal?: AbortSignal }) => {
      if (requestOptions?.signal) handed.push(requestOptions.signal);
      return (async function* () {
        for (let piece = 0; piece < 50; piece += 1) yield { choices: [{ delta: { content: 'x' } }] };
        yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
      })();
    };
    const controller = new AbortController();
    const llm = chatClient({ chat: { completions: { create } } }).options({ signal: controller.signal });
    for (let call = 0; call < 20; call += 1) {
      for await (const _event of llm.stream('hi')) { /* read to the end */ }
    }
    expect(handed).toHaveLength(20);
    expect(handed.map((signal) => getEventListeners(signal, 'abort').length)).toEqual(handed.map(() => 0));
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });
});
