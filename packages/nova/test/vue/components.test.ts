// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { h, nextTick, shallowRef, type Component } from 'vue';
import { createComponentRegistry, type RenderNode } from '@layout';
import { NovaRenderProvider, RenderTree, type NovaComponent } from '../../src/adapters/vue';
import {
  ActionSlotPropsSchema,
  Button,
  Input,
  InputPropsSchema,
  registerNovaVueComponents,
  StackPropsSchema,
} from '../../src/adapters/vue/components';
import { InputPropsSchema as ReactInputPropsSchema } from '../../src/adapters/react/components';

// ═══════════════════════════════════════════════════════════
// The Vue primitive kit: meta, the click / model conventions, and the remote
// round-trip obligations of ADAPTER.md §6 (draft while focused, debounce).
// ═══════════════════════════════════════════════════════════

const inProvider = (component: Component, props: Record<string, unknown>, dispatch = vi.fn()) => {
  const current = shallowRef(props);
  const wrapper = mount(NovaRenderProvider, {
    attachTo: document.body,
    props: { registry: createComponentRegistry<NovaComponent>(), dispatch },
    slots: { default: () => h(component, current.value) },
  });
  const setProps = async (next: Record<string, unknown>): Promise<void> => {
    current.value = next;
    await nextTick();
  };
  return { wrapper, dispatch, setProps };
};

const inputOf = (wrapper: ReturnType<typeof mount>): HTMLInputElement => {
  const el = wrapper.find('input').element;
  if (!(el instanceof HTMLInputElement)) throw new Error('no input');
  return el;
};

describe('vue kit — registration and meta', () => {
  it('registers the full vocabulary with static meta carrying the shared schemas', () => {
    const registry = createComponentRegistry<NovaComponent>();
    registerNovaVueComponents(registry);
    expect(registry.list().sort()).toEqual(['ActionSlot', 'Box', 'Button', 'CanvasSlot', 'Input', 'JsonTree', 'Panel', 'Stack', 'Text']);
    expect(registry.get('Stack')?.meta.propsSchema).toBe(StackPropsSchema);
    expect(registry.get('ActionSlot')?.meta.propsSchema).toBe(ActionSlotPropsSchema);
    // one schema, both kits
    expect(InputPropsSchema).toBe(ReactInputPropsSchema);
  });

  it('renders a layout through the kit — Stack > Text + Button', () => {
    const registry = createComponentRegistry<NovaComponent>();
    registerNovaVueComponents(registry);
    const nodes: RenderNode[] = [
      {
        type: 'component',
        name: 'Stack',
        props: { gap: 8, direction: 'row' },
        children: [
          { type: 'component', name: 'Text', props: { as: 'h2' }, children: [{ type: 'text', value: 'Title' }] },
          { type: 'component', name: 'Button', props: {}, ref: 'save', children: [{ type: 'text', value: 'Save' }] },
        ],
      },
    ];
    const dispatch = vi.fn();
    const wrapper = mount(NovaRenderProvider, { props: { registry, dispatch }, slots: { default: () => h(RenderTree, { nodes }) } });
    const stack = wrapper.find('div');
    expect(stack.attributes('style')).toContain('flex-direction: row');
    expect(stack.attributes('style')).toContain('gap: 8px');
    expect(wrapper.find('h2').text()).toBe('Title');
    wrapper.find('button').element.click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'ui:click', ref: 'save' });
  });
});

describe('vue kit — Button', () => {
  it('dispatches ui:click with its ref; label wins over children', async () => {
    const { wrapper, dispatch } = inProvider(Button, { novaRef: 'go', label: 'Go' });
    expect(wrapper.find('button').text()).toBe('Go');
    await wrapper.find('button').trigger('click');
    expect(dispatch).toHaveBeenCalledWith({ type: 'ui:click', ref: 'go' });
  });

  it('is a no-op without a ref or when disabled', async () => {
    const bare = inProvider(Button, { label: 'x' });
    await bare.wrapper.find('button').trigger('click');
    expect(bare.dispatch).not.toHaveBeenCalled();
    const off = inProvider(Button, { label: 'x', novaRef: 'go', disabled: true });
    off.wrapper.find('button').element.dispatchEvent(new MouseEvent('click'));
    expect(off.dispatch).not.toHaveBeenCalled();
  });
});

describe('vue kit — Input', () => {
  afterEach(() => vi.useRealTimers());

  it('renders type, placeholder and value', () => {
    const { wrapper } = inProvider(Input, { type: 'email', placeholder: 'email…', value: 'a@b' });
    const el = inputOf(wrapper);
    expect(el.type).toBe('email');
    expect(el.placeholder).toBe('email…');
    expect(el.value).toBe('a@b');
  });

  it('dispatches ui:model with the binding ref on every keystroke by default', async () => {
    const { wrapper, dispatch } = inProvider(Input, { value: '', novaModel: { ref: 'form', path: 'name' } });
    await wrapper.find('input').setValue('ada');
    expect(dispatch).toHaveBeenCalledWith({ type: 'ui:model', ref: 'form', payload: 'ada' });
  });

  it('coalesces keystrokes when debounce is set, and flushes on blur', async () => {
    vi.useFakeTimers();
    const { wrapper, dispatch } = inProvider(Input, { value: '', debounce: 200, novaModel: { ref: 'form', path: 'name' } });
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.setValue('a');
    await input.setValue('ab');
    await input.setValue('abc');
    expect(dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'ui:model', ref: 'form', payload: 'abc' });

    await input.setValue('abcd');
    await input.trigger('blur');
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'ui:model', ref: 'form', payload: 'abcd' });
    vi.advanceTimersByTime(500);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('keeps the in-progress value while focused, then releases to the server value on blur', async () => {
    const binding = { ref: 'form', path: 'name' };
    const { wrapper, setProps } = inProvider(Input, { value: '', novaModel: binding });
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.setValue('help');
    // a stale echo of an earlier keystroke arrives mid-type — must not clobber
    await setProps({ value: 'h', novaModel: binding });
    expect(inputOf(wrapper).value).toBe('help');
    await input.trigger('blur');
    await setProps({ value: 'saved', novaModel: binding });
    expect(inputOf(wrapper).value).toBe('saved');
  });
});
