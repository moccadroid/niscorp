import { describe, it, expect } from 'vitest';
import { createSignal, ErrorCode, type StreamEvent } from '../src';

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
