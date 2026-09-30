import { describe, expect, it } from 'vitest';
import { createDataStore, createEventBus, createMessageBus } from '@shared';
import { executeSteps, type StepContext } from '@action/runtime/steps';
import type { FetchFn, FetchResponse } from '@action/types';
import type { EndpointConfig } from '@action/schemas';

// WHAT A REPLY MUST BE, AND HOW LONG IT MAY TAKE. A call that never answers
// fails to onError past its wait (the endpoint's own `timeoutMs`, else the
// shell's, else 30s) and tells the transport to stop; a success whose body is
// not JSON fails to onError; No Content is a success with nothing in it.

const reply = (status: number, body: string): FetchResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(JSON.parse(body)),
  text: () => Promise.resolve(body),
});

const run = async (
  endpoint: EndpointConfig,
  fetch: FetchFn,
  overrides: Partial<StepContext> = {},
): Promise<{ status: string; error: string }> => {
  const dataStore = createDataStore<Record<string, unknown>>({ status: 'loading', error: '', rows: 'untouched' });
  await executeSteps(
    [{ call: 'load', onSuccess: [{ set: 'status', value: 'ok' }], onError: [{ set: 'status', value: 'failed' }, { set: 'error', value: '{{@error.message}}' }] }],
    {
      dataStore,
      endpoints: { load: endpoint },
      functions: {},
      eventBus: createEventBus(),
      messageBus: createMessageBus(),
      extras: {},
      strict: false,
      onError: () => {},
      signal: new AbortController().signal,
      fetch,
      ...overrides,
    },
  );
  const data = dataStore.get();
  return { status: String(data['status']), error: String(data['error']) };
};

const hang: FetchFn = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });

describe('an endpoint that never answers', () => {
  it('fails to onError past the endpoint\'s own timeoutMs', async () => {
    const result = await run({ url: '/slow', method: 'GET', timeoutMs: 30 }, hang);
    expect(result).toEqual({ status: 'failed', error: 'no reply within 30ms' });
  });

  it('takes the shell\'s default when the endpoint names none', async () => {
    const result = await run({ url: '/slow', method: 'GET' }, hang, { endpointTimeoutMs: 20 });
    expect(result.error).toBe('no reply within 20ms');
  });

  it('lets an endpoint that is slow by nature wait longer than the shell', async () => {
    const slowly: FetchFn = () => new Promise((resolve) => setTimeout(() => resolve(reply(200, '{"a":1}')), 60));
    const result = await run({ url: '/model', method: 'POST', timeoutMs: 500 }, slowly, { endpointTimeoutMs: 20 });
    expect(result.status).toBe('ok');
  });

  it('tells the transport to stop', async () => {
    let stopped = false;
    const listening: FetchFn = (_url, init) =>
      new Promise(() => {
        init?.signal?.addEventListener('abort', () => (stopped = true));
      });
    await run({ url: '/slow', method: 'GET', timeoutMs: 10 }, listening);
    expect(stopped).toBe(true);
  });

  it('a function endpoint that never returns fails the same way', async () => {
    const result = await run({ fn: 'stuck', timeoutMs: 20 }, hang, { functions: { stuck: () => new Promise(() => undefined) } });
    expect(result).toEqual({ status: 'failed', error: 'no reply within 20ms' });
  });
});

describe('a successful reply', () => {
  it('that is not JSON fails to onError', async () => {
    const result = await run({ url: '/page', method: 'GET' }, () => Promise.resolve(reply(200, '<html>a page</html>')));
    expect(result).toEqual({ status: 'failed', error: 'the reply is not JSON (HTTP 200)' });
  });

  it('with No Content succeeds with nothing in it', async () => {
    const result = await run({ url: '/done', method: 'DELETE' }, () => Promise.resolve(reply(204, '')));
    expect(result.status).toBe('ok');
  });

  it('JSON null is JSON', async () => {
    const result = await run({ url: '/none', method: 'GET' }, () => Promise.resolve(reply(200, 'null')));
    expect(result.status).toBe('ok');
  });

  it('a failed reply that is not JSON still fails with its status', async () => {
    const result = await run({ url: '/gone', method: 'GET' }, () => Promise.resolve(reply(502, '<html>bad gateway</html>')));
    expect(result).toEqual({ status: 'failed', error: 'HTTP 502' });
  });
});
