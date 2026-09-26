import { describe, expect, it } from 'vitest';
import { createLayoutStore } from '@layout';
import { createEventBus, createMessageBus } from '@shared';
import { createActionRuntime } from '@action/runtime/runtime';
import type { ActionDefinition } from '@action/schemas';
import type { FetchFn, FetchResponse } from '@action/types';
import { createPermissiveRegistry } from '../helpers';

// ═══════════════════════════════════════════════════════════
// A response whose body can change later (`FetchResponse.onChange`), and the
// per-endpoint ledger that keeps an older call from writing over a newer one.
// ═══════════════════════════════════════════════════════════

type Live = { push: (body: unknown) => void; listeners: () => number };

// A response that can be pushed to after it resolved.
const liveResponse = (body: unknown): { response: FetchResponse; live: Live } => {
  const handlers = new Set<(body: unknown) => void>();
  const response: FetchResponse = {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    onChange: (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
  return {
    response,
    live: {
      push: (next) => {
        for (const handler of [...handlers]) handler(next);
      },
      listeners: () => handlers.size,
    },
  };
};

// Every call parks until the test releases it, in any order.
const parkedFetch = (): { fetchFn: FetchFn; release: (index: number, response: FetchResponse) => void; bodies: (string | undefined)[] } => {
  const waiting: ((response: FetchResponse) => void)[] = [];
  const bodies: (string | undefined)[] = [];
  const fetchFn: FetchFn = (_url, init) =>
    new Promise<FetchResponse>((resolve) => {
      waiting.push(resolve);
      bodies.push(init?.body);
    });
  return {
    fetchFn,
    bodies,
    release: (index, response) => {
      const resolve = waiting[index];
      if (resolve === undefined) throw new Error(`no call #${index}`);
      resolve(response);
    },
  };
};

const tick = (n = 3): Promise<void> => {
  let p = Promise.resolve();
  for (let i = 0; i < n; i += 1) p = p.then(() => new Promise((r) => setTimeout(r, 0)));
  return p;
};

const deps = () => ({
  eventBus: createEventBus(),
  messageBus: createMessageBus(),
  layoutStore: createLayoutStore(),
  registry: createPermissiveRegistry(),
});

const definition: ActionDefinition = {
  id: 'list',
  data: { rows: [], loads: 0 },
  endpoints: { load: { url: '/rows', method: 'POST', target: 'rows' } },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ increment: 'loads' }] }] },
  triggers: [{ event: 'ui:click', ref: 'again', do: [{ call: 'load', onSuccess: [{ increment: 'loads' }] }] }],
};

describe('endpoint — later bodies', () => {
  it('writes each later body to target, and runs nothing else', async () => {
    const { response, live } = liveResponse(['a']);
    const fetchFn: FetchFn = () => Promise.resolve(response);
    const runtime = createActionRuntime({ definition, fetch: fetchFn, ...deps() });
    await runtime.mount();
    await tick();
    expect(runtime.getData()['rows']).toEqual(['a']);
    expect(runtime.getData()['loads']).toBe(1);

    live.push(['a', 'b']);
    expect(runtime.getData()['rows']).toEqual(['a', 'b']);
    // onSuccess did not run again: a later body is data, not a call.
    expect(runtime.getData()['loads']).toBe(1);
  });

  it('shapes later bodies with the endpoint `response`, as the first', async () => {
    const { response, live } = liveResponse({ result: ['a'] });
    const shaped: ActionDefinition = {
      ...definition,
      endpoints: { load: { url: '/rows', method: 'POST', target: 'rows', response: 'unwrap' } },
    };
    const transform = (_config: unknown, source: unknown): unknown =>
      source !== null && typeof source === 'object' && 'result' in source ? source.result : source;
    const runtime = createActionRuntime({ definition: shaped, fetch: () => Promise.resolve(response), transform, ...deps() });
    await runtime.mount();
    await tick();
    expect(runtime.getData()['rows']).toEqual(['a']);
    live.push({ result: ['z'] });
    expect(runtime.getData()['rows']).toEqual(['z']);
  });

  it('stops following on unmount', async () => {
    const { response, live } = liveResponse(['a']);
    const runtime = createActionRuntime({ definition, fetch: () => Promise.resolve(response), ...deps() });
    await runtime.mount();
    await tick();
    expect(live.listeners()).toBe(1);
    await runtime.unmount();
    expect(live.listeners()).toBe(0);
  });

  it('a newer call replaces the followed one — an old query never writes again', async () => {
    const first = liveResponse(['old']);
    const second = liveResponse(['new']);
    const responses = [first.response, second.response];
    let n = 0;
    const fetchFn: FetchFn = () => {
      const next = responses[n];
      n += 1;
      if (next === undefined) throw new Error('unexpected call');
      return Promise.resolve(next);
    };
    const bus = deps();
    const runtime = createActionRuntime({ definition, fetch: fetchFn, ...bus });
    await runtime.mount();
    await tick();
    bus.eventBus.emit({ type: 'ui:click', ref: 'again' });
    await tick();
    expect(runtime.getData()['rows']).toEqual(['new']);
    expect(first.live.listeners()).toBe(0);
    first.live.push(['stale']);
    expect(runtime.getData()['rows']).toEqual(['new']);
    second.live.push(['newer']);
    expect(runtime.getData()['rows']).toEqual(['newer']);
  });
});

describe('endpoint — out-of-order responses', () => {
  it('an older response landing after a newer one does not overwrite it', async () => {
    const { fetchFn, release } = parkedFetch();
    const bus = deps();
    const runtime = createActionRuntime({ definition, fetch: fetchFn, ...bus });
    void runtime.mount();
    await tick();
    bus.eventBus.emit({ type: 'ui:click', ref: 'again' });
    await tick();

    const plain = (body: unknown): FetchResponse => ({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve('') });
    release(1, plain(['second']));
    await tick();
    expect(runtime.getData()['rows']).toEqual(['second']);
    release(0, plain(['first']));
    await tick();
    expect(runtime.getData()['rows']).toEqual(['second']);
    // Both calls still completed as calls.
    expect(runtime.getData()['loads']).toBe(2);
  });

  it('a stale response is not followed', async () => {
    const { fetchFn, release } = parkedFetch();
    const bus = deps();
    const runtime = createActionRuntime({ definition, fetch: fetchFn, ...bus });
    void runtime.mount();
    await tick();
    bus.eventBus.emit({ type: 'ui:click', ref: 'again' });
    await tick();
    const older = liveResponse(['first']);
    const newer = liveResponse(['second']);
    release(1, newer.response);
    await tick();
    release(0, older.response);
    await tick();
    expect(older.live.listeners()).toBe(0);
    expect(newer.live.listeners()).toBe(1);
  });
});
