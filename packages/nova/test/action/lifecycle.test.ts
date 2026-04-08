import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import { createComponentRegistry, createLayoutStore } from '@layout';
import { createEventBus, createMessageBus } from '@shared';
import { createActionRuntime } from '@action/runtime/runtime';
import type { ActionDefinition } from '@action/schemas';

const baseConfig = (definition: ActionDefinition) => ({
  definition,
  eventBus: createEventBus(),
  messageBus: createMessageBus(),
  layoutStore: createLayoutStore(),
  registry: createPermissiveRegistry(),
});

describe('lifecycle', () => {
  it('mount merges definition.data with input', async () => {
    const def: ActionDefinition = {
      id: 'a',
      data: { counter: 0, label: 'hi' },
    };
    const runtime = createActionRuntime({ ...baseConfig(def), input: { counter: 5 } });
    await runtime.mount();
    expect(runtime.getData()).toEqual({ counter: 5, label: 'hi' });
    expect(runtime.instance.status).toBe('active');
  });

  it('mount runs mount hook steps', async () => {
    const def: ActionDefinition = {
      id: 'a',
      data: { ready: false },
      lifecycle: { mount: [{ set: 'ready', value: true }] },
    };
    const runtime = createActionRuntime(baseConfig(def));
    await runtime.mount();
    expect(runtime.getData()).toEqual({ ready: true });
  });

  it('unmount runs unmount hook and sets status', async () => {
    const def: ActionDefinition = {
      id: 'a',
      data: { cleaned: false },
      lifecycle: { unmount: [{ set: 'cleaned', value: true }] },
    };
    const runtime = createActionRuntime(baseConfig(def));
    await runtime.mount();
    await runtime.unmount();
    expect(runtime.getData()).toEqual({ cleaned: true });
    expect(runtime.instance.status).toBe('unmounted');
  });

  it('suspend / resume transitions status', async () => {
    const def: ActionDefinition = { id: 'a', data: {} };
    const runtime = createActionRuntime(baseConfig(def));
    await runtime.mount();
    await runtime.suspend();
    expect(runtime.instance.status).toBe('suspended');
    await runtime.resume();
    expect(runtime.instance.status).toBe('active');
  });

  it('onStatusChange notifies', async () => {
    const def: ActionDefinition = { id: 'a' };
    const runtime = createActionRuntime(baseConfig(def));
    const seen: string[] = [];
    runtime.onStatusChange((s) => seen.push(s));
    await runtime.mount();
    await runtime.unmount();
    expect(seen).toEqual(['active', 'unmounted']);
  });
});
