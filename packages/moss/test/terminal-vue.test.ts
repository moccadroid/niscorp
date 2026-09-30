// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { createComponentRegistry } from '@niscorp/nova';
import type { NovaEvent, RenderComponentNode, RenderNode } from '@niscorp/nova';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/adapters/vue';
import { registerNovaVueComponents } from '@niscorp/nova/adapters/vue/components';
import { vueTarget } from '../src/terminal/vue';
import type { TerminalApi, TerminalMount } from '../src/terminal';

// ═══════════════════════════════════════════════════════════
// The Vue target — driven the way the tty tests drive theirs: a stub
// TerminalApi over mutable trees, dispatches captured, `update` called as the
// conductor would on a wire change. jsdom stands in for the browser.
// ═══════════════════════════════════════════════════════════

// RenderComponentNode, not the RenderNode union: `ref` and `model` live on the
// component member alone.
const component = (name: string, props: Record<string, unknown> = {}, children: RenderNode[] = []): RenderComponentNode => ({
  type: 'component',
  name,
  props,
  children,
});
const text = (value: string): RenderNode => ({ type: 'text', value });

// A served ActionSlot marker as flattenRenderTree stamps it: identity in
// props, keyed by instance, the instance's tree as children.
const instance = (instanceId: string, canvasId: string, children: RenderNode[]): RenderNode => ({
  ...component('ActionSlot', { instanceId, canvasId, definitionId: 'counter' }, children),
  key: instanceId,
});

const counterTree = (label: string, value: string, instanceId = 'i1'): RenderNode[] => [
  instance(instanceId, 'main', [
    component('Text', {}, [text(label)]),
    { ...component('Button', { label: 'inc' }), ref: 'inc' },
    { ...component('Input', { value }), model: { ref: 'name', path: 'name' } },
  ]),
];

const mounts: TerminalMount[] = [];
afterEach(() => {
  for (const mount of mounts.splice(0)) mount.destroy();
  document.body.innerHTML = '';
});

const harness = (trees: Record<string, RenderNode[]>, slotWrapper?: NovaComponent, extra: Record<string, NovaComponent> = {}) => {
  const dispatched: { canvas: string; event: NovaEvent }[] = [];
  const published: { channel: string; payload?: unknown }[] = [];
  const state = { trees, frame: [component('Text', { as: 'h1' }, [text('frame')]), component('CanvasSlot', { canvasId: 'main' })] };
  const api: TerminalApi = {
    frame: () => state.frame,
    canvasTree: (id) => state.trees[id] ?? [],
    dispatch: (canvas, event) => void dispatched.push({ canvas, event }),
    publish: (channel, payload) => void published.push({ channel, payload }),
  };
  const root = document.createElement('div');
  document.body.appendChild(root);
  const registry = createComponentRegistry<NovaComponent>();
  registerNovaVueComponents(registry);
  registry.registerAll(extra);
  const mount = vueTarget({ root, registry, ...(slotWrapper === undefined ? {} : { slotWrapper }) })(api);
  mounts.push(mount);
  const input = (): HTMLInputElement => {
    const el = root.querySelector('input');
    if (el === null) throw new Error('no input');
    return el;
  };
  const button = (): HTMLButtonElement => {
    const el = root.querySelector('button');
    if (el === null) throw new Error('no button');
    return el;
  };
  return { root, state, mount, dispatched, published, input, button };
};

describe('the vue target', () => {
  it('renders the frame and resolves a CanvasSlot to its canvas tree', () => {
    const t = harness({ main: counterTree('count=0', '') });
    expect(t.root.querySelector('h1')?.textContent).toBe('frame');
    expect(t.root.textContent).toContain('count=0');
    expect(t.button().textContent).toBe('inc');
  });

  it('a click inside an ActionSlot dispatches tagged with the canvas, origin stamped with the instance', () => {
    const t = harness({ main: counterTree('count=0', '') });
    t.button().click();
    expect(t.dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:click', ref: 'inc', origin: 'i1' } }]);
  });

  it('an event that already carries an origin keeps it', () => {
    const Emitter = defineComponent(() => {
      const dispatch = useNovaDispatch();
      return () => h('button', { onClick: () => dispatch({ type: 'ui:click', ref: 'go', origin: 'elsewhere' }) }, 'emit');
    });
    const t = harness({ main: [instance('i1', 'main', [component('Emitter')])] }, undefined, { Emitter });
    t.button().click();
    expect(t.dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:click', ref: 'go', origin: 'elsewhere' } }]);
  });

  it('update re-renders in place — no remount, focus and the typed draft survive', async () => {
    const t = harness({ main: counterTree('count=0', '') });
    const before = t.input();
    before.focus();
    before.value = 'ad';
    before.dispatchEvent(new Event('input'));
    expect(t.dispatched.at(-1)).toEqual({ canvas: 'main', event: { type: 'ui:model', ref: 'name', payload: 'ad', origin: 'i1' } });

    // the server's echo lags a keystroke behind, and another field changed
    t.state.trees = { main: counterTree('count=1', 'a') };
    t.mount.update();
    await nextTick();

    expect(t.root.textContent).toContain('count=1');
    const after = t.input();
    expect(after).toBe(before);
    expect(document.activeElement).toBe(before);
    expect(after.value).toBe('ad');
  });

  it('an instance swap under the slot remounts the instance subtree', async () => {
    const t = harness({ main: counterTree('count=0', '', 'i1') });
    const first = t.input();
    t.state.trees = { main: counterTree('count=0', '', 'i2') };
    t.mount.update();
    await nextTick();
    expect(t.input()).not.toBe(first);
    t.button().click();
    expect(t.dispatched.at(-1)?.event.origin).toBe('i2');
  });

  it('wraps each instance in the app slotWrapper, handed identity', () => {
    const Wrapper = defineComponent(
      (props: { canvasId?: string; instanceId?: string; definitionId?: string }, { slots }) =>
        () =>
          h('section', { 'data-instance': props.instanceId, 'data-canvas': props.canvasId, 'data-definition': props.definitionId }, slots.default?.()),
      { props: ['canvasId', 'instanceId', 'definitionId'] },
    );
    const t = harness({ main: counterTree('count=0', '') }, Wrapper);
    const section = t.root.querySelector('section');
    expect(section?.getAttribute('data-instance')).toBe('i1');
    expect(section?.getAttribute('data-canvas')).toBe('main');
    expect(section?.getAttribute('data-definition')).toBe('counter');
    expect(section?.textContent).toContain('count=0');
  });

  it('an empty canvas renders nothing; destroy unmounts', () => {
    const t = harness({});
    expect(t.root.textContent).toBe('frame');
    t.mount.destroy();
    mounts.splice(0);
    expect(t.root.innerHTML).toBe('');
  });
});
