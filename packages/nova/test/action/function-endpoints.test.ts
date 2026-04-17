import { describe, expect, it } from 'vitest';
import { createPermissiveRegistry } from '../helpers';
import { createLayoutStore } from '@layout';
import { createEventBus, createMessageBus } from '@shared';
import { createActionRuntime } from '@action/runtime/runtime';
import { callEndpoint } from '@action/runtime/endpoints';
import { EndpointConfigSchema } from '@action/schemas/endpoints';
import { UnknownFunctionError, LifecycleError } from '@shared/errors';
import type { ActionDefinition } from '@action/schemas';
import type { FunctionHandler } from '@action/types';

const baseDeps = () => ({
  eventBus: createEventBus(),
  messageBus: createMessageBus(),
  layoutStore: createLayoutStore(),
  registry: createPermissiveRegistry(),
});

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('callEndpoint — function variant', () => {
  const neverAbort = new AbortController().signal;

  it('awaits the handler and returns ok with its return value', async () => {
    const handler: FunctionHandler = async () => ({ answer: 42 });
    const result = await callEndpoint({
      endpoint: { fn: 'compute' },
      data: {},
      functions: { compute: handler },
      signal: neverAbort,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toEqual({ answer: 42 });
  });

  it('passes the data snapshot to the handler', async () => {
    const seen: Record<string, unknown>[] = [];
    const handler: FunctionHandler = async (data) => {
      seen.push(data);
      return null;
    };
    await callEndpoint({
      endpoint: { fn: 'inspect' },
      data: { a: 1, nested: { b: 2 } },
      functions: { inspect: handler },
      signal: neverAbort,
    });
    expect(seen[0]).toEqual({ a: 1, nested: { b: 2 } });
  });

  it('passes an abort signal through to the handler', async () => {
    let captured: AbortSignal | undefined;
    const handler: FunctionHandler = async (_, signal) => {
      captured = signal;
      return null;
    };
    const controller = new AbortController();
    await callEndpoint({
      endpoint: { fn: 'withSignal' },
      data: {},
      functions: { withSignal: handler },
      signal: controller.signal,
    });
    expect(captured).toBe(controller.signal);
  });

  it('returns ok=false when the handler throws', async () => {
    const handler: FunctionHandler = async () => {
      throw new Error('boom');
    };
    const result = await callEndpoint({
      endpoint: { fn: 'bad' },
      data: {},
      functions: { bad: handler },
      signal: neverAbort,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error.message).toBe('boom');
    expect(result.error.status).toBe(0);
  });

  it('marks the result as aborted when AbortError is thrown', async () => {
    const handler: FunctionHandler = async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    };
    const result = await callEndpoint({
      endpoint: { fn: 'abortive' },
      data: {},
      functions: { abortive: handler },
      signal: neverAbort,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error.aborted).toBe(true);
  });

  it('reports aborted when the signal fires during handler execution', async () => {
    const controller = new AbortController();
    const handler: FunctionHandler = async () => {
      controller.abort();
      return 'ignored';
    };
    const result = await callEndpoint({
      endpoint: { fn: 'late-abort' },
      data: {},
      functions: { 'late-abort': handler },
      signal: controller.signal,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error.aborted).toBe(true);
  });
});

describe('runtime — function endpoints via triggers', () => {
  it('writes the return value to target and runs onSuccess', async () => {
    const definition: ActionDefinition = {
      id: 'fn-success',
      data: { result: null, status: 'idle' },
      endpoints: {
        compute: { fn: 'compute', target: 'result' },
      },
      triggers: [
        {
          event: 'ui:click',
          ref: 'go',
          do: [
            { call: 'compute', onSuccess: [{ set: 'status', value: 'done' }] },
          ],
        },
      ],
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({
      definition,
      ...deps,
      functions: {
        compute: async () => ({ value: 7 }),
      },
    });
    await runtime.mount();
    deps.eventBus.emit({ type: 'ui:click', ref: 'go' });
    await tick();
    expect(runtime.getData()).toEqual({ result: { value: 7 }, status: 'done' });
  });

  it('writes the error to errorTarget and binds @error in onError', async () => {
    const definition: ActionDefinition = {
      id: 'fn-error',
      data: { result: null, status: 'idle', msg: null },
      endpoints: {
        compute: { fn: 'compute', target: 'result', errorTarget: 'errObj' },
      },
      triggers: [
        {
          event: 'ui:click',
          ref: 'go',
          do: [
            {
              call: 'compute',
              onError: [
                { set: 'status', value: 'failed' },
                { set: 'msg', value: '{{@error.message}}' },
              ],
            },
          ],
        },
      ],
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({
      definition,
      ...deps,
      functions: {
        compute: async () => {
          throw new Error('nope');
        },
      },
    });
    await runtime.mount();
    deps.eventBus.emit({ type: 'ui:click', ref: 'go' });
    await tick();
    const data = runtime.getData();
    expect(data['status']).toBe('failed');
    expect(data['msg']).toBe('nope');
    expect(data['errObj']).toMatchObject({ message: 'nope', status: 0 });
  });

  it('forwards abort on unmount — handler sees signal.aborted', async () => {
    let sawAbort = false;
    const definition: ActionDefinition = {
      id: 'fn-abort',
      data: {},
      endpoints: { long: { fn: 'long' } },
      triggers: [{ event: 'ui:click', ref: 'go', do: [{ call: 'long' }] }],
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({
      definition,
      ...deps,
      functions: {
        long: (_, signal) =>
          new Promise((resolve) => {
            signal.addEventListener('abort', () => {
              sawAbort = true;
              resolve(null);
            });
          }),
      },
    });
    await runtime.mount();
    deps.eventBus.emit({ type: 'ui:click', ref: 'go' });
    await tick();
    await runtime.unmount();
    await tick();
    expect(sawAbort).toBe(true);
  });

  it('unknown function name runs onError with @error.message', async () => {
    const definition: ActionDefinition = {
      id: 'fn-unknown',
      data: { msg: null },
      endpoints: { missing: { fn: 'not-registered' } },
      triggers: [
        {
          event: 'ui:click',
          ref: 'go',
          do: [
            {
              call: 'missing',
              onError: [{ set: 'msg', value: '{{@error.message}}' }],
            },
          ],
        },
      ],
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({ definition, ...deps, functions: {} });
    await runtime.mount();
    deps.eventBus.emit({ type: 'ui:click', ref: 'go' });
    await tick();
    expect(runtime.getData()['msg']).toBe('unknown function: not-registered');
  });

  it('unknown function in strict mode with no onError throws UnknownFunctionError', async () => {
    const definition: ActionDefinition = {
      id: 'fn-strict',
      data: {},
      endpoints: { missing: { fn: 'not-registered' } },
      triggers: [
        { event: 'ui:click', ref: 'go', do: [{ call: 'missing' }] },
      ],
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({
      definition,
      ...deps,
      strict: true,
      functions: {},
    });
    await runtime.mount();
    await expect(runtime.executeSteps([{ call: 'missing' }])).rejects.toBeInstanceOf(
      UnknownFunctionError,
    );
  });

  it('unknown function inside a lifecycle hook raises LifecycleError', async () => {
    const definition: ActionDefinition = {
      id: 'fn-lifecycle',
      data: {},
      endpoints: { missing: { fn: 'not-registered' } },
      lifecycle: {
        mount: [{ call: 'missing' }],
      },
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({
      definition,
      ...deps,
      strict: true,
      functions: {},
    });
    await expect(runtime.mount()).rejects.toBeInstanceOf(LifecycleError);
  });

  it('HTTP and function endpoints coexist in the same action', async () => {
    const definition: ActionDefinition = {
      id: 'mix',
      data: { http: null, local: null },
      endpoints: {
        loadUser: { url: '/api/user', method: 'GET', target: 'http' },
        compute: { fn: 'compute', target: 'local' },
      },
      triggers: [
        { event: 'ui:click', ref: 'h', do: [{ call: 'loadUser' }] },
        { event: 'ui:click', ref: 'l', do: [{ call: 'compute' }] },
      ],
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({
      definition,
      ...deps,
      fetch: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'u1' }),
          text: () => Promise.resolve('{"id":"u1"}'),
        }),
      functions: {
        compute: async () => 'local-result',
      },
    });
    await runtime.mount();
    deps.eventBus.emit({ type: 'ui:click', ref: 'h' });
    deps.eventBus.emit({ type: 'ui:click', ref: 'l' });
    await tick();
    await tick();
    expect(runtime.getData()).toEqual({ http: { id: 'u1' }, local: 'local-result' });
  });
});

describe('EndpointConfigSchema — union validation', () => {
  it('accepts HTTP variant', () => {
    const parsed = EndpointConfigSchema.safeParse({ url: '/x', method: 'GET' });
    expect(parsed.success).toBe(true);
  });

  it('accepts function variant', () => {
    const parsed = EndpointConfigSchema.safeParse({ fn: 'compute', target: 'out' });
    expect(parsed.success).toBe(true);
  });

  it('rejects an object with both url and fn', () => {
    const parsed = EndpointConfigSchema.safeParse({
      url: '/x',
      method: 'GET',
      fn: 'compute',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an empty object', () => {
    const parsed = EndpointConfigSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });
});

describe('UnknownFunctionError', () => {
  it('exposes the function name in context and message', () => {
    const err = new UnknownFunctionError('nope');
    expect(err.name).toBe('UnknownFunctionError');
    expect(err.message).toContain('nope');
    expect(err.context).toEqual({ name: 'nope' });
  });
});
