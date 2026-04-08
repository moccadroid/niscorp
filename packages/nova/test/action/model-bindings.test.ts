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
