import { describe, expect, it } from 'vitest';
import { createComponentRegistry, createLayoutStore } from '@layout';
import { createEventBus, createMessageBus } from '@shared';
import { createActionRuntime } from '@action/runtime/runtime';
import type { ActionDefinition } from '@action/schemas';
import type { FetchFn, FetchResponse } from '@action/types';
import { createPermissiveRegistry } from '../helpers';

// ═══════════════════════════════════════════════════════════
// A controllable fake fetch: each call returns a promise whose
// resolve/reject is exposed, so tests can unmount before resolution.
// ═══════════════════════════════════════════════════════════

type PendingCall = {
  resolve: (response: FetchResponse) => void;
  reject: (err: unknown) => void;
};

const createControlledFetch = (): { fetchFn: FetchFn; pending: PendingCall[] } => {
  const pending: PendingCall[] = [];
  const fetchFn: FetchFn = (_url, init) => {
    return new Promise<FetchResponse>((resolve, reject) => {
      pending.push({ resolve, reject });
      if (init?.signal !== undefined) {
        const signal = init.signal;
        const onAbort = (): void => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        };
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  };
  return { fetchFn, pending };
};

const okResponse = (data: unknown): FetchResponse => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

const baseDeps = () => ({
  eventBus: createEventBus(),
  messageBus: createMessageBus(),
  layoutStore: createLayoutStore(),
  registry: createPermissiveRegistry(),
});

const tick = (n = 1): Promise<void> => {
  let p = Promise.resolve();
  for (let i = 0; i < n; i += 1) p = p.then(() => new Promise((r) => setTimeout(r, 0)));
  return p;
};

describe('runtime — abort races', () => {
  it('unmount before call resolves leaves data store untouched', async () => {
    const definition: ActionDefinition = {
      id: 'slow',
      data: { loaded: false },
      endpoints: { load: { url: '/x', method: 'GET', target: 'value' } },
      triggers: [
        {
          event: 'ui:click',
          do: [{ call: 'load', onSuccess: [{ set: 'loaded', value: true }] }],
        },
      ],
    };
    const deps = baseDeps();
    const { fetchFn, pending } = createControlledFetch();
    const runtime = createActionRuntime({ definition, ...deps, fetch: fetchFn });
    await runtime.mount();

    deps.eventBus.emit({ type: 'ui:click' });
    await tick();
    expect(pending).toHaveLength(1);

    await runtime.unmount();

    // After unmount: resolve the fetch promise — the success path should be skipped.
    const first = pending[0];
    if (first === undefined) throw new Error('expected pending');
    first.resolve(okResponse({ name: 'X' }));
    await tick(3);

    const data = runtime.getData();
    expect(data).toEqual({ loaded: false });
  });

  it('onSuccess remainder does not run if unmounted mid-flight', async () => {
    const definition: ActionDefinition = {
      id: 'slow2',
      data: { a: 0, b: 0 },
      endpoints: { load: { url: '/x', method: 'GET' } },
      triggers: [
        {
          event: 'ui:click',
          do: [
            { call: 'load', onSuccess: [{ set: 'a', value: 1 }, { set: 'b', value: 2 }] },
          ],
        },
      ],
    };
    const deps = baseDeps();
    const { fetchFn, pending } = createControlledFetch();
    const runtime = createActionRuntime({ definition, ...deps, fetch: fetchFn });
    await runtime.mount();

    deps.eventBus.emit({ type: 'ui:click' });
    await tick();
    await runtime.unmount();

    const first = pending[0];
    if (first === undefined) throw new Error('expected pending');
    first.resolve(okResponse({}));
    await tick(3);

    expect(runtime.getData()).toEqual({ a: 0, b: 0 });
  });

  it('trigger fired after unmount is dropped', async () => {
    const definition: ActionDefinition = {
      id: 'x',
      data: { n: 0 },
      triggers: [{ event: 'ui:click', do: [{ increment: 'n' }] }],
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({ definition, ...deps });
    await runtime.mount();
    await runtime.unmount();
    // trigger unsubscribed on unmount; emitting should not mutate.
    deps.eventBus.emit({ type: 'ui:click' });
    await tick();
    expect(runtime.getData()).toEqual({ n: 0 });
  });
});
