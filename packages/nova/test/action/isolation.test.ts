import { describe, expect, it } from 'vitest';
import { createComponentRegistry, createLayoutStore } from '@layout';
import { createEventBus, createMessageBus } from '@shared';
import { createActionRuntime } from '@action/runtime/runtime';
import { buildInitialData } from '@action/runtime/lifecycle';
import type { ActionDefinition } from '@action/schemas';
import { createPermissiveRegistry } from '../helpers';

const baseConfig = (definition: ActionDefinition) => ({
  definition,
  eventBus: createEventBus(),
  messageBus: createMessageBus(),
  layoutStore: createLayoutStore(),
  registry: createPermissiveRegistry(),
});

describe('buildInitialData — isolation', () => {
  it('does not mutate caller-provided input when later mutations run', () => {
    const def: ActionDefinition = { id: 'a', data: { count: 0 } };
    const input = { items: [{ value: 'a' }, { value: 'b' }] };
    const inputSnapshot = structuredClone(input);

    const runtime = createActionRuntime({ ...baseConfig(def), input });
    runtime.applyMutations([{ set: 'items.0.value', value: 'MUTATED' }]);

    expect(input).toEqual(inputSnapshot);
    expect(runtime.getData()).toMatchObject({ items: [{ value: 'MUTATED' }, { value: 'b' }] });
  });

  it('does not leak definition.data references into the store', () => {
    const nestedList = [{ n: 1 }];
    const def: ActionDefinition = { id: 'a', data: { list: nestedList } };

    const runtime = createActionRuntime(baseConfig(def));
    runtime.applyMutations([{ set: 'list.0.n', value: 999 }]);

    expect(nestedList[0]?.n).toBe(1);
  });

  it('does not share references with the object returned from transform', () => {
    const sharedState = { items: [1, 2, 3] };
    const def: ActionDefinition = { id: 'a', data: {} };
    const transform = (): Record<string, unknown> => sharedState;

    const runtime = createActionRuntime({ ...baseConfig(def), transform });
    runtime.applyMutations([{ set: 'items.0', value: 999 }]);

    expect(sharedState.items).toEqual([1, 2, 3]);
  });

  it('buildInitialData alone produces an isolated tree', () => {
    const def: ActionDefinition = { id: 'a', data: { nested: { x: 1 } } };
    const out = buildInitialData(def, undefined);
    (out.nested as { x: number }).x = 42;
    expect(def.data).toEqual({ nested: { x: 1 } });
  });
});

describe('reset — snapshot isolation', () => {
  it('reset restores nested values even after they were mutated in place', () => {
    const def: ActionDefinition = {
      id: 'a',
      data: { user: { name: 'Ada', address: { city: 'London' } } },
    };
    const runtime = createActionRuntime(baseConfig(def));

    runtime.applyMutations([
      { set: 'user.name', value: 'Grace' },
      { set: 'user.address.city', value: 'Paris' },
    ]);
    expect(runtime.getData()).toMatchObject({
      user: { name: 'Grace', address: { city: 'Paris' } },
    });

    runtime.applyMutations([{ reset: 'user.address.city' }]);
    expect(runtime.getData()).toMatchObject({
      user: { name: 'Grace', address: { city: 'London' } },
    });
  });

  it('reset of a nested object returns a fresh copy (not the live ref)', () => {
    const def: ActionDefinition = {
      id: 'a',
      data: { form: { fields: { email: 'a@b.c' } } },
    };
    const runtime = createActionRuntime(baseConfig(def));

    runtime.applyMutations([{ set: 'form.fields.email', value: 'x@y.z' }]);
    runtime.applyMutations([{ reset: 'form.fields' }]);

    expect(runtime.getData()).toMatchObject({ form: { fields: { email: 'a@b.c' } } });

    runtime.applyMutations([{ set: 'form.fields.email', value: 'corrupt' }]);
    runtime.applyMutations([{ reset: 'form.fields' }]);
    expect(runtime.getData()).toMatchObject({ form: { fields: { email: 'a@b.c' } } });
  });

  it('reset as a step restores the default, from a trigger and from a lifecycle hook', async () => {
    const def: ActionDefinition = {
      id: 'a',
      data: { count: 0, form: { email: 'a@b.c' } },
      lifecycle: { mount: [{ set: 'form.email', value: 'typed' }, { reset: 'form.email' }] },
    };
    const runtime = createActionRuntime(baseConfig(def));
    await runtime.mount();
    expect(runtime.getData()).toMatchObject({ form: { email: 'a@b.c' } });

    await runtime.executeSteps([{ set: 'count', value: 5 }]);
    await runtime.executeSteps([{ reset: 'count' }]);
    expect(runtime.getData()['count']).toBe(0);
  });
});
