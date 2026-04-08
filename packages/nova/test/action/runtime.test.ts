import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it, vi } from 'vitest';
import { createComponentRegistry, createLayoutStore } from '@layout';
import { createEventBus, createMessageBus } from '@shared';
import { createActionRuntime } from '@action/runtime/runtime';
import type { ActionDefinition } from '@action/schemas';
import type { FetchFn, FetchResponse, NavigationEffect } from '@action/types';

const ok = (data: unknown): FetchResponse => ({
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

describe('createActionRuntime — end-to-end with layout', () => {
  it('renders an inline layout reflecting data; mutations re-render', async () => {
    const definition: ActionDefinition = {
      id: 'counter',
      data: { n: 0 },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Text', props: { value: '$.n' } },
          { component: 'Button', ref: 'inc' },
        ],
      },
      triggers: [{ event: 'ui:click', ref: 'inc', do: [{ increment: 'n' }] }],
    };

    const deps = baseDeps();
    const runtime = createActionRuntime({ definition, ...deps });
    await runtime.mount();

    const first = runtime.render();
    const stack = first[0];
    if (!stack || stack.type !== 'component') throw new Error('expected stack');
    const text = stack.children[0];
    if (!text || text.type !== 'component') throw new Error('expected text');
    expect(text.props['value']).toBe(0);

    deps.eventBus.emit({ type: 'ui:click', ref: 'inc' });
    await new Promise((r) => setTimeout(r, 0));

    const second = runtime.render();
    const stack2 = second[0];
    if (!stack2 || stack2.type !== 'component') throw new Error('expected stack');
    const text2 = stack2.children[0];
    if (!text2 || text2.type !== 'component') throw new Error('expected text');
    expect(text2.props['value']).toBe(1);
  });

  it('renders a layout looked up from the layout store', () => {
    const layoutStore = createLayoutStore();
    layoutStore.set('greeting', { component: 'Text', props: { value: '$.name' } });
    const runtime = createActionRuntime({
      definition: { id: 'g', layout: 'greeting', data: { name: 'Ada' } },
      eventBus: createEventBus(),
      messageBus: createMessageBus(),
      layoutStore,
      registry: createPermissiveRegistry(),
    });
    const out = runtime.render();
    const text = out[0];
    if (!text || text.type !== 'component') throw new Error('expected component');
    expect(text.props['value']).toBe('Ada');
  });

  it('integrates triggers + endpoints + onSuccess mutations + render', async () => {
    const definition: ActionDefinition = {
      id: 'load',
      data: { loading: false, user: undefined },
      layout: { component: 'Text', props: { value: '$.user.name' } },
      endpoints: {
        loadUser: { url: '/api/user/{{$.id}}', method: 'GET', target: 'user' },
      },
      triggers: [
        {
          event: 'ui:click',
          ref: 'load-btn',
          do: [
            { set: 'loading', value: true },
            { call: 'loadUser', onSuccess: [{ set: 'loading', value: false }] },
          ],
        },
      ],
    };

    const deps = baseDeps();
    const fetchFn: FetchFn = vi.fn(() => Promise.resolve(ok({ id: 'u1', name: 'Ada' })));

    const runtime = createActionRuntime({
      definition,
      input: { id: 'u1' },
      ...deps,
      fetch: fetchFn,
    });
    await runtime.mount();

    deps.eventBus.emit({ type: 'ui:click', ref: 'load-btn' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchFn).toHaveBeenCalledWith('/api/user/u1', expect.objectContaining({ method: 'GET' }));
    expect(runtime.getData()).toMatchObject({ loading: false, user: { id: 'u1', name: 'Ada' } });

    const out = runtime.render();
    const text = out[0];
    if (!text || text.type !== 'component') throw new Error('expected component');
    expect(text.props['value']).toBe('Ada');
  });

  it('navigation effects bubble out via onNavigate', async () => {
    const seen: NavigationEffect[] = [];
    const definition: ActionDefinition = {
      id: 'nav',
      triggers: [{ event: 'ui:click', do: [{ push: { action: 'next' } }] }],
    };
    const deps = baseDeps();
    const runtime = createActionRuntime({
      definition,
      ...deps,
      onNavigate: (e) => seen.push(e),
    });
    await runtime.mount();
    deps.eventBus.emit({ type: 'ui:click' });
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toHaveLength(1);
  });

  it('setData replaces the entire data store', async () => {
    const definition: ActionDefinition = { id: 'sd', data: { n: 0 } };
    const runtime = createActionRuntime({ definition, ...baseDeps() });
    await runtime.mount();
    runtime.setData({ foo: 'bar' });
    expect(runtime.getData()).toEqual({ foo: 'bar' });
    runtime.setData({ a: 1 });
    runtime.setData({ b: 2 });
    expect(runtime.getData()).toEqual({ b: 2 });
  });

  it('setData notifies onDataChange subscribers', async () => {
    const definition: ActionDefinition = { id: 'sd2', data: { n: 0 } };
    const runtime = createActionRuntime({ definition, ...baseDeps() });
    await runtime.mount();
    const seen: Record<string, unknown>[] = [];
    runtime.onDataChange((d) => seen.push(d));
    runtime.setData({ hello: 'world' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ hello: 'world' });
  });

  it('onDataChange is called on mutation', async () => {
    const definition: ActionDefinition = { id: 'a', data: { n: 0 } };
    const runtime = createActionRuntime({ definition, ...baseDeps() });
    await runtime.mount();
    const seen: Record<string, unknown>[] = [];
    runtime.onDataChange((d) => seen.push(d));
    runtime.applyMutations([{ increment: 'n' }]);
    expect(seen).toHaveLength(1);
    expect(runtime.getData()).toEqual({ n: 1 });
  });
});
