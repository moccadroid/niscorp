// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import type { ActionDefinition } from '@action';
import { createComponentRegistry } from '@layout';
import { createShell } from '@shell';
import { NovaCanvas, NovaErrorBoundary, NovaShell, NovaShellProvider, RenderTree, useRenderTree, type NovaComponent } from '../../src/adapters/vue';
import { registerNovaVueComponents } from '../../src/adapters/vue/components';

// ═══════════════════════════════════════════════════════════
// The shell-backed pieces against a real shell (ADAPTER.md §3–§5): the
// subscription composables, CanvasSlot / ActionSlot, scoped dispatch reaching
// the instance's own triggers, and the persistent slot wrapper.
// ═══════════════════════════════════════════════════════════

const counter: ActionDefinition = {
  id: 'counter',
  data: { count: 0, name: '' },
  layout: {
    component: 'Stack',
    children: [
      { component: 'Text', children: 'count={{$.count}} name={{$.name}}' },
      { component: 'Button', ref: 'inc', props: { label: 'inc' } },
      { component: 'Input', ref: 'name', model: '$.name', props: { value: '{{$.name}}' } },
    ],
  },
  triggers: [{ event: 'ui:click', ref: 'inc', do: [{ set: 'count', value: 1 }] }],
};

const textAction = (id: string, text: string): ActionDefinition => ({
  id,
  data: {},
  layout: { component: 'Text', children: text },
});

describe('vue shell — NovaShell renders canvases through CanvasSlot / ActionSlot', () => {
  it('renders the active instance and re-renders on data change', async () => {
    const shell = createShell({ canvases: [{ id: 'main', initial: 'counter' }], actions: { counter } });
    await flushPromises();
    const wrapper = mount(NovaShell, { props: { shell }, attachTo: document.body });
    expect(wrapper.text()).toContain('count=0');

    // a click inside the ActionSlot reaches the instance's own trigger
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('count=1');

    // model binding round-trip through the kit's Input
    await wrapper.find('input').setValue('ada');
    await flushPromises();
    expect(wrapper.text()).toContain('name=ada');

    wrapper.unmount();
    shell.dispose();
  });

  it('follows the stack: a push swaps what the canvas shows', async () => {
    const shell = createShell({ canvases: [{ id: 'main', initial: 'a' }], actions: { a: textAction('a', 'FIRST'), b: textAction('b', 'SECOND') } });
    await flushPromises();
    const wrapper = mount(NovaShell, { props: { shell } });
    expect(wrapper.text()).toContain('FIRST');
    shell.push('main', 'b');
    await flushPromises();
    expect(wrapper.text()).toContain('SECOND');
    expect(wrapper.text()).not.toContain('FIRST');
    wrapper.unmount();
    shell.dispose();
  });

  it('NovaCanvas renders one canvas standalone', async () => {
    const shell = createShell({
      canvases: [{ id: 'main', initial: 'a' }, { id: 'side', initial: 'b' }],
      actions: { a: textAction('a', 'MAIN'), b: textAction('b', 'SIDE') },
    });
    await flushPromises();
    const wrapper = mount(NovaCanvas, { props: { shell, id: 'side' } });
    expect(wrapper.text()).toContain('SIDE');
    expect(wrapper.text()).not.toContain('MAIN');
    wrapper.unmount();
    shell.dispose();
  });

  it('scopes ActionSlot dispatch: the event carries the instance as origin', async () => {
    const shell = createShell({ canvases: [{ id: 'main', initial: 'counter' }], actions: { counter } });
    await flushPromises();
    const origins: Array<string | undefined> = [];
    const original = shell.dispatch;
    const spied = { ...shell, dispatch: (event: Parameters<typeof original>[0]) => {
      origins.push(event.origin);
      original(event);
    } };
    const wrapper = mount(NovaShell, { props: { shell: spied } });
    await wrapper.find('button').trigger('click');
    const active = shell.getCanvasState('main').active?.id;
    expect(active).toBeDefined();
    expect(origins).toEqual([active]);
    wrapper.unmount();
    shell.dispose();
  });

  it('renders the slot wrapper persistently, handed identity only', async () => {
    const seen: Array<{ canvasId?: string; instanceId?: string; actionId?: string }> = [];
    const Wrapper = defineComponent(
      (props: { canvasId?: string; instanceId?: string; action?: ActionDefinition }, { slots }) =>
        () => {
          seen.push({ canvasId: props.canvasId, instanceId: props.instanceId, actionId: props.action?.id });
          return h('div', { 'data-wrap': '' }, slots.default?.());
        },
      { props: ['canvasId', 'instanceId', 'action'] },
    );
    const shell = createShell({ canvases: [{ id: 'main', initial: 'a' }], actions: { a: textAction('a', 'HELLO') } });
    await flushPromises();
    const wrapper = mount(NovaShell, { props: { shell, slotWrapper: Wrapper } });
    expect(wrapper.find('[data-wrap]').text()).toContain('HELLO');
    expect(seen.find((s) => s.instanceId !== undefined)).toMatchObject({ canvasId: 'main', actionId: 'a' });
    wrapper.unmount();
    shell.dispose();

    // an empty canvas still mounts the wrapper (content null) so exits can animate
    const empty = createShell({ canvases: [{ id: 'main' }], actions: {} });
    await flushPromises();
    seen.length = 0;
    const bare = mount(NovaShell, { props: { shell: empty, slotWrapper: Wrapper } });
    expect(bare.find('[data-wrap]').exists()).toBe(true);
    expect(seen.some((s) => s.instanceId === undefined)).toBe(true);
    bare.unmount();
    empty.dispose();
  });
});

describe('vue shell — composables and error boundary', () => {
  it('useRenderTree follows one instance, subscribed and unsubscribed with the component', async () => {
    const registry = createComponentRegistry<NovaComponent>();
    registerNovaVueComponents(registry);
    const shell = createShell({ canvases: [{ id: 'main' }], registry, actions: { counter } });
    const instanceId = shell.push('main', 'counter');
    await flushPromises();
    const Host = defineComponent(() => {
      const tree = useRenderTree(instanceId);
      return () => h(RenderTree, { nodes: tree.value });
    });
    const wrapper = mount(NovaShellProvider, { props: { shell }, slots: { default: () => h(Host) } });
    expect(wrapper.text()).toContain('count=0');
    const runtime = shell.getRuntime(instanceId);
    runtime?.setData({ ...runtime.getData(), count: 1 });
    await flushPromises();
    expect(wrapper.text()).toContain('count=1');
    wrapper.unmount();
    shell.dispose();
  });

  it('NovaErrorBoundary swaps a throwing subtree for a marker', () => {
    const Boom = defineComponent(() => () => {
      throw new Error('kaboom');
    });
    const errors: string[] = [];
    const wrapper = mount(NovaErrorBoundary, {
      props: { onError: (error: Error) => errors.push(error.message) },
      slots: { default: () => h(Boom) },
    });
    return flushPromises().then(() => {
      expect(wrapper.find('[data-nova-error-boundary]').text()).toBe('kaboom');
      expect(errors).toEqual(['kaboom']);
    });
  });
});
