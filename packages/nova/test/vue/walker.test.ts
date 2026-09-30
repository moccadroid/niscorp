// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, type FunctionalComponent, type VNode } from 'vue';
import { createComponentRegistry, type RenderNode } from '@layout';
import {
  NovaRenderProvider,
  RenderTree,
  useNovaDispatch,
  useNovaPublish,
  useNovaRegistry,
  type NovaComponent,
} from '../../src/adapters/vue';

// ═══════════════════════════════════════════════════════════
// The Vue walker (ADAPTER.md §1–§2): node kinds, prop injection, children as
// the default slot, and the render context reaching components.
// ═══════════════════════════════════════════════════════════

const mountTree = (nodes: RenderNode[], registry = createComponentRegistry<NovaComponent>(), extra: Record<string, unknown> = {}) =>
  mount(NovaRenderProvider, {
    props: { registry, ...extra },
    slots: { default: () => h(RenderTree, { nodes }) },
  });

const text = (value: string): RenderNode => ({ type: 'text', value });

describe('vue walker — node kinds', () => {
  it('renders a text node as text', () => {
    const wrapper = mountTree([text('hello')]);
    expect(wrapper.text()).toBe('hello');
  });

  it('renders a fragment as its children, no wrapper element', () => {
    const wrapper = mountTree([{ type: 'fragment', children: [text('a'), text('b')] }]);
    expect(wrapper.text()).toBe('ab');
    expect(wrapper.html()).not.toMatch(/<[a-z]/);
  });

  it('renders an error node as a data-nova-error marker', () => {
    const wrapper = mountTree([{ type: 'error', code: 'BAD_BINDING', message: 'nope' }]);
    const marker = wrapper.find('[data-nova-error="BAD_BINDING"]');
    expect(marker.exists()).toBe(true);
    expect(marker.attributes('role')).toBe('alert');
    expect(marker.text()).toBe('[BAD_BINDING] nope');
  });

  it('renders an unknown component as COMPONENT_NOT_FOUND, never throws', () => {
    const wrapper = mountTree([{ type: 'component', name: 'Nope', props: {}, children: [] }]);
    const marker = wrapper.find('[data-nova-error="COMPONENT_NOT_FOUND"]');
    expect(marker.exists()).toBe(true);
    expect(marker.text()).toContain('Nope');
  });

  it('renders the fallback for an unknown component when one is provided', () => {
    const Fallback: FunctionalComponent = (_props, { slots }) => h('section', { 'data-fallback': '' }, slots.default?.());
    const wrapper = mountTree([{ type: 'component', name: 'Nope', props: {}, children: [text('inner')] }], undefined, { fallback: Fallback });
    expect(wrapper.find('[data-fallback]').text()).toBe('inner');
  });
});

describe('vue walker — props, refs, models, children', () => {
  it('spreads node props and injects novaRef / novaModel into a props-less functional component', () => {
    const seen: Record<string, unknown>[] = [];
    const Probe: FunctionalComponent<Record<string, unknown>> = (props) => {
      seen.push({ ...props });
      return h('i');
    };
    const registry = createComponentRegistry<NovaComponent>();
    registry.register('Probe', Probe);
    mountTree(
      [{ type: 'component', name: 'Probe', props: { label: 'L', count: 2 }, ref: 'probe', model: { ref: 'probe', path: 'name' }, children: [] }],
      registry,
    );
    expect(seen[0]).toEqual({ label: 'L', count: 2, novaRef: 'probe', novaModel: { ref: 'probe', path: 'name' } });
  });

  it('hands children in as the default slot — an array of per-child keyed vnodes', () => {
    const lengths: number[] = [];
    const keys: unknown[] = [];
    const Cells: FunctionalComponent = (_props, { slots }) => {
      const children: VNode[] = slots.default?.() ?? [];
      lengths.push(children.length);
      keys.push(...children.map((child) => child.key));
      return h(
        'ul',
        children.map((child, i) => h('li', { key: i }, [child])),
      );
    };
    const registry = createComponentRegistry<NovaComponent>();
    registry.register('Cells', Cells);
    const wrapper = mountTree(
      [{ type: 'component', name: 'Cells', props: {}, children: [text('one'), text('two'), { type: 'component', name: 'Missing', props: {}, children: [], ref: 'r' }] }],
      registry,
    );
    expect(lengths[0]).toBe(3);
    expect(keys).toEqual(['t:0', 't:1', 'c:r']);
    expect(wrapper.findAll('li').map((li) => li.text())).toEqual(['one', 'two', '[COMPONENT_NOT_FOUND] Missing']);
  });

  it('gives a component the provider dispatch, publish and registry; defaults are no-ops', () => {
    const dispatch = vi.fn();
    const publish = vi.fn();
    const registry = createComponentRegistry<NovaComponent>();
    const names: string[][] = [];
    const Emitter = defineComponent(
      (props: { novaRef?: string }) => {
        const send = useNovaDispatch();
        const announce = useNovaPublish();
        names.push(useNovaRegistry().list());
        return () =>
          h('button', {
            onClick: () => {
              if (props.novaRef !== undefined) send({ type: 'ui:click', ref: props.novaRef });
              announce('ping', 1);
            },
          });
      },
      { props: ['novaRef'] },
    );
    registry.register('Emitter', Emitter);
    const node: RenderNode = { type: 'component', name: 'Emitter', props: {}, ref: 'go', children: [] };

    const wired = mountTree([node], registry, { dispatch, publish });
    wired.find('button').element.click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'ui:click', ref: 'go' });
    expect(publish).toHaveBeenCalledWith('ping', 1);
    expect(names[0]).toEqual(['Emitter']);

    const bare = mountTree([node], registry);
    expect(() => bare.find('button').element.click()).not.toThrow();
  });
});
