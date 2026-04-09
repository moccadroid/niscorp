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

// ═══════════════════════════════════════════════════════════
// Isolation guarantees: the runtime owns an independent data
// tree. Neither `definition.data`, caller `input`, nor any
// object returned from a `transform` should share references
// with the live data store after init.
// ═══════════════════════════════════════════════════════════

describe('buildInitialData — isolation', () => {
  it('does not mutate caller-provided input when later mutations run', () => {
    const def: ActionDefinition = { id: 'a', data: { count: 0 } };
    const input = { items: [{ value: 'a' }, { value: 'b' }] };
    const inputSnapshot = structuredClone(input);

    const runtime = createActionRuntime({ ...baseConfig(def), input });
    runtime.applyMutations([{ set: 'items.0.value', value: 'MUTATED' }]);

    // The caller's input must be untouched.
    expect(input).toEqual(inputSnapshot);
    // But the runtime saw the mutation.
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

    // transform's closure state is untouched.
    expect(sharedState.items).toEqual([1, 2, 3]);
  });

  it('buildInitialData alone produces an isolated tree', () => {
    const def: ActionDefinition = { id: 'a', data: { nested: { x: 1 } } };
    const out = buildInitialData(def, undefined, undefined);
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
    // The deep-clone snapshot must still remember 'London'.
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

    // Mutating after reset doesn't corrupt the snapshot — a second reset still works.
    runtime.applyMutations([{ set: 'form.fields.email', value: 'corrupt' }]);
    runtime.applyMutations([{ reset: 'form.fields' }]);
    expect(runtime.getData()).toMatchObject({ form: { fields: { email: 'a@b.c' } } });
  });
});
