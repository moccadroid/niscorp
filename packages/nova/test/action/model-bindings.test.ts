import { describe, expect, it } from 'vitest';
import { collectModelBindings } from '@action/runtime/model-bindings';
import { createActionRuntime } from '@action/runtime/runtime';
import type { ActionDefinition } from '@action/schemas';
import { createLayoutStore, renderLayout } from '@layout';
import type { LayoutNode, RenderNode } from '@layout';
import { createEventBus, createMessageBus } from '@shared';
import { createPermissiveRegistry } from '../helpers';

const baseDeps = () => ({
  eventBus: createEventBus(),
  messageBus: createMessageBus(),
  layoutStore: createLayoutStore(),
  registry: createPermissiveRegistry(),
});

// A trigger's steps run async (fireTrigger fire-and-forgets executeSteps); the
// model WRITE is synchronous within the emit. A tick lets any trigger steps
// settle so the assertion sees the final data.
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('collectModelBindings', () => {
  it('returns an empty list for a tree with no model bindings', () => {
    const tree: RenderNode[] = [
      { type: 'component', name: 'Text', props: {}, children: [] },
    ];
    expect(collectModelBindings(tree)).toEqual([]);
  });

  it('collects simple model bindings', () => {
    const tree: RenderNode[] = [
      {
        type: 'component',
        name: 'Input',
        props: {},
        children: [],
        model: { path: 'name', ref: 'r1' },
      },
    ];
    expect(collectModelBindings(tree)).toEqual([{ ref: 'r1', path: 'name' }]);
  });

  it('recurses through fragments and nested components', () => {
    const tree: RenderNode[] = [
      {
        type: 'fragment',
        children: [
          {
            type: 'component',
            name: 'Stack',
            props: {},
            children: [
              {
                type: 'component',
                name: 'Input',
                props: {},
                children: [],
                model: { path: 'a', ref: 'ra' },
              },
              {
                type: 'component',
                name: 'Input',
                props: {},
                children: [],
                model: { path: 'b', ref: 'rb' },
              },
            ],
          },
        ],
      },
    ];
    expect(collectModelBindings(tree)).toEqual([
      { ref: 'ra', path: 'a' },
      { ref: 'rb', path: 'b' },
    ]);
  });
});

describe('renderer — model field emission', () => {
  it('emits model on a top-level component node with a $.path binding', () => {
    const layout: LayoutNode = {
      component: 'Input',
      ref: 'name-input',
      model: '$.user.name',
    };
    const registry = createPermissiveRegistry();
    const out = renderLayout(layout, { user: { name: 'Ada' } }, {
      store: createLayoutStore(),
      registry,
    });
    const [first] = out;
    if (!first || first.type !== 'component') throw new Error('expected component');
    expect(first.model).toEqual({ path: 'user.name', ref: 'name-input' });
  });

  it('assigns a stable auto-ref when no ref is set', () => {
    const layout: LayoutNode = { component: 'Input', model: '$.value' };
    const registry = createPermissiveRegistry();
    const out = renderLayout(layout, { value: 0 }, {
      store: createLayoutStore(),
      registry,
    });
    const [first] = out;
    if (!first || first.type !== 'component') throw new Error('expected component');
    expect(first.model?.ref).toBe('auto-Input-value');
  });

  it('resolves $item within a loop to an indexed data path', () => {
    const layout: LayoutNode = {
      for: '$.items',
      as: 'item',
      do: { component: 'Input', model: '$item.value' },
    };
    const registry = createPermissiveRegistry();
    const out = renderLayout(
      layout,
      { items: [{ value: 'a' }, { value: 'b' }] },
      { store: createLayoutStore(), registry },
    );
    const [frag] = out;
    if (!frag || frag.type !== 'fragment') throw new Error('expected fragment');
    const first = frag.children[0];
    const second = frag.children[1];
    if (!first || first.type !== 'component') throw new Error('expected component');
    if (!second || second.type !== 'component') throw new Error('expected component');
    expect(first.model?.path).toBe('items.0.value');
    expect(second.model?.path).toBe('items.1.value');
    expect(first.model?.ref).not.toBe(second.model?.ref);
  });
});

describe('runtime — ui:model wiring', () => {
  it('applies a ui:model event to the data store and re-renders', async () => {
    const definition: ActionDefinition = {
      id: 'form',
      data: { name: 'Ada' },
      layout: {
        component: 'Input',
        ref: 'name-input',
        model: '$.name',
      },
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({ definition, ...deps });
    await runtime.mount();
    // First render installs the listener.
    runtime.render();

    deps.eventBus.emit({ type: 'ui:model', ref: 'name-input', payload: 'Grace' });
    expect(runtime.getData()).toEqual({ name: 'Grace' });
  });

  it('listener is removed on unmount', async () => {
    const definition: ActionDefinition = {
      id: 'f',
      data: { name: 'x' },
      layout: { component: 'Input', ref: 'r', model: '$.name' },
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({ definition, ...deps });
    await runtime.mount();
    runtime.render();
    await runtime.unmount();

    deps.eventBus.emit({ type: 'ui:model', ref: 'r', payload: 'y' });
    expect(runtime.getData()).toEqual({ name: 'x' });
  });

  it('loop item bindings update only the targeted item', async () => {
    const definition: ActionDefinition = {
      id: 'list',
      data: { items: [{ value: 'a' }, { value: 'b' }] },
      layout: {
        for: '$.items',
        as: 'item',
        do: { component: 'Input', model: '$item.value' },
      },
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({ definition, ...deps });
    await runtime.mount();
    const out = runtime.render();
    const [frag] = out;
    if (!frag || frag.type !== 'fragment') throw new Error('expected fragment');
    const second = frag.children[1];
    if (!second || second.type !== 'component') throw new Error('expected component');
    const secondRef = second.model?.ref;
    if (secondRef === undefined) throw new Error('expected ref');

    deps.eventBus.emit({ type: 'ui:model', ref: secondRef, payload: 'B!' });

    expect(runtime.getData()).toEqual({
      items: [{ value: 'a' }, { value: 'B!' }],
    });
  });
});

describe('runtime — a ui:model trigger observes the value the event wrote', () => {
  it('a trigger reads the WRITTEN value, not the value the field held before the keystroke', async () => {
    const definition: ActionDefinition = {
      id: 'form',
      data: { name: '', copy: '' },
      layout: { component: 'Input', ref: 'name-input', model: '$.name' },
      triggers: [{ event: 'ui:model', do: [{ set: 'copy', from: 'name' }] }],
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({ definition, ...deps });
    await runtime.mount();
    runtime.render();

    deps.eventBus.emit({ type: 'ui:model', ref: 'name-input', payload: 'Ada' });
    await tick();
    // The write landed first; the trigger's `from: 'name'` copied 'Ada', not ''.
    expect(runtime.getData()).toEqual({ name: 'Ada', copy: 'Ada' });
  });

  it('a looped binding: a trigger folding the collection sees the just-written row', async () => {
    const definition: ActionDefinition = {
      id: 'list',
      data: { rows: [{ value: 'a' }, { value: 'b' }], snapshot: [] },
      layout: { for: '$.rows', as: 'row', do: { component: 'Input', model: '$row.value' } },
      triggers: [{ event: 'ui:model', do: [{ set: 'snapshot', from: 'rows' }] }],
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({ definition, ...deps });
    await runtime.mount();
    const out = runtime.render();
    const [frag] = out;
    if (!frag || frag.type !== 'fragment') throw new Error('expected fragment');
    const second = frag.children[1];
    if (!second || second.type !== 'component') throw new Error('expected component');
    const secondRef = second.model?.ref;
    if (secondRef === undefined) throw new Error('expected ref');

    deps.eventBus.emit({ type: 'ui:model', ref: secondRef, payload: 'B!' });
    await tick();
    expect(runtime.getData().snapshot).toEqual([{ value: 'a' }, { value: 'B!' }]);
  });

  it('the write-first order holds for a binding that first appears after a re-render', async () => {
    const definition: ActionDefinition = {
      id: 'grow',
      data: { rows: [] as { value: string }[], seen: '' },
      layout: { for: '$.rows', as: 'row', do: { component: 'Input', model: '$row.value' } },
      triggers: [{ event: 'ui:model', do: [{ set: 'seen', from: 'rows.0.value' }] }],
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({ definition, ...deps });
    await runtime.mount();
    runtime.render(); // no bindings yet — the loop is empty
    // The row (and its binding) appears only after a re-render: reconcile adds it
    // to the map, never to the bus, so the write is still first.
    runtime.updateData({ rows: [{ value: 'x' }] });
    const out = runtime.render();
    const [frag] = out;
    if (!frag || frag.type !== 'fragment') throw new Error('expected fragment');
    const first = frag.children[0];
    if (!first || first.type !== 'component') throw new Error('expected component');
    const ref = first.model?.ref;
    if (ref === undefined) throw new Error('expected ref');

    deps.eventBus.emit({ type: 'ui:model', ref, payload: 'written' });
    await tick();
    expect(runtime.getData().rows).toEqual([{ value: 'written' }]);
    expect(runtime.getData().seen).toBe('written');
  });

  it('an action with a model binding but NO triggers still writes (the attach guard)', async () => {
    const definition: ActionDefinition = {
      id: 'notrig',
      data: { name: 'x' },
      layout: { component: 'Input', ref: 'r', model: '$.name' },
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({ definition, ...deps });
    await runtime.mount();
    runtime.render();

    deps.eventBus.emit({ type: 'ui:model', ref: 'r', payload: 'written' });
    expect(runtime.getData()).toEqual({ name: 'written' });
  });

  it('a suspended instance ignores a ui:model event', async () => {
    const definition: ActionDefinition = {
      id: 'susp',
      data: { name: 'x' },
      layout: { component: 'Input', ref: 'r', model: '$.name' },
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({ definition, ...deps });
    await runtime.mount();
    runtime.render();
    await runtime.suspend();

    deps.eventBus.emit({ type: 'ui:model', ref: 'r', payload: 'y' });
    expect(runtime.getData()).toEqual({ name: 'x' });
  });

  it('onDataChange fires once per ui:model event', async () => {
    const definition: ActionDefinition = {
      id: 'once',
      data: { name: 'x' },
      layout: { component: 'Input', ref: 'r', model: '$.name' },
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({ definition, ...deps });
    await runtime.mount();
    runtime.render();
    let changes = 0;
    runtime.onDataChange(() => { changes += 1; });

    deps.eventBus.emit({ type: 'ui:model', ref: 'r', payload: 'y' });
    expect(changes).toBe(1);
  });

  it('an unstamped global ui:model reaches every instance holding the ref', async () => {
    const deps = baseDeps(); // one shared event bus
    const mk = (id: string) =>
      createActionRuntime({
        definition: { id, data: { name: 'x' }, layout: { component: 'Input', ref: 'shared', model: '$.name' } },
        ...deps,
      });
    const a = mk('a');
    const b = mk('b');
    await a.mount(); a.render();
    await b.mount(); b.render();

    deps.eventBus.emit({ type: 'ui:model', ref: 'shared', payload: 'both' });
    expect(a.getData()).toEqual({ name: 'both' });
    expect(b.getData()).toEqual({ name: 'both' });
  });
});
