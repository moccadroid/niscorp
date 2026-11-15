// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { mount } from '@vue/test-utils';
import type { ActionDefinition } from '@action';
import { createComponentRegistry } from '@layout';
import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME, createShell, shellIdle } from '@shell';
import type { Shell } from '@shell';
import { NovaShell } from '@react';
import type { NovaComponent } from '@react';
import { registerNovaReactComponents } from '../../src/adapters/react/components';
import { NovaShell as VueNovaShell } from '../../src/adapters/vue';
import { mountShell } from '../../src/adapters/dom';
import { defaultRegistry as domKit, fallback as domFallback } from '../../src/adapters/dom/components';

const search = (props: Record<string, unknown>): ActionDefinition => ({
  id: 'search',
  data: { q: '' },
  layout: { component: 'Input', ref: 'q', model: '$.q', props: { value: '{{$.q}}', ...props } },
  triggers: [
    { message: 'clear', do: [{ set: 'q', value: '' }] },
    { message: 'reset', do: [{ set: 'q', value: 'x' }] },
    { message: 'to-z', do: [{ set: 'q', value: 'z' }] },
    { message: 'to-abc', do: [{ set: 'q', value: 'abc' }] },
  ],
});

const dataOf = (shell: Shell): Record<string, unknown> => shell.getRuntime(shell.getCanvasState('main').active?.id ?? '')?.getData() ?? {};

// Runs a step, as a click elsewhere on the screen would, while the field keeps its focus.
const publish = async (shell: Shell, message: string, wrap: (run: () => void) => void): Promise<void> => {
  wrap(() => shell.publish(message));
  await shellIdle(shell);
};

type Field = { el: () => HTMLInputElement; type: (value: string) => Promise<void>; wrap: (run: () => void) => void };

type Kit = { name: string; open: (shell: Shell) => Promise<Field> };

const typeInto = (el: HTMLInputElement, value: string): void => {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

const KITS: Kit[] = [
  {
    name: 'DOM',
    open: async (shell) => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      const registry = shell.registry;
      mountShell(root, registry as ReturnType<typeof domKit>, shell);
      const el = (): HTMLInputElement => {
        const found = root.querySelector('input');
        if (found === null) throw new Error('no input');
        return found;
      };
      el().focus();
      return {
        el,
        type: async (value) => {
          typeInto(el(), value);
          await shellIdle(shell);
        },
        wrap: (run) => run(),
      };
    },
  },
  {
    name: 'React',
    open: async (shell) => {
      const view = render(<NovaShell shell={shell} registry={shell.registry as ReturnType<typeof createComponentRegistry<NovaComponent>>} />);
      const el = (): HTMLInputElement => {
        const found = view.container.querySelector('input');
        if (found === null) throw new Error('no input');
        return found;
      };
      act(() => el().focus());
      return {
        el,
        type: async (value) => {
          act(() => {
            fireEvent.change(el(), { target: { value } });
          });
          await act(() => shellIdle(shell));
        },
        wrap: (run) => act(run),
      };
    },
  },
  {
    name: 'Vue',
    open: async (shell) => {
      const wrapper = mount(VueNovaShell, { props: { shell }, attachTo: document.body });
      await shellIdle(shell);
      const el = (): HTMLInputElement => wrapper.find('input').element;
      el().focus();
      await wrapper.vm.$nextTick();
      return {
        el,
        type: async (value) => {
          typeInto(el(), value);
          await shellIdle(shell);
          await wrapper.vm.$nextTick();
        },
        wrap: (run) => run(),
      };
    },
  },
];

const registryFor = (kit: string) => {
  if (kit === 'DOM') {
    const registry = domKit();
    registry.register(CANVAS_SLOT_NAME, domFallback);
    registry.register(ACTION_SLOT_NAME, domFallback);
    return registry;
  }
  const registry = createComponentRegistry<NovaComponent>();
  if (kit === 'React') registerNovaReactComponents(registry);
  return registry;
};

const boot = async (kit: Kit, props: Record<string, unknown>): Promise<{ shell: Shell; field: Field; settle: () => Promise<void> }> => {
  const shell = createShell({ canvases: [{ id: 'main', initial: 'search' }], actions: { search: search(props) }, registry: registryFor(kit.name) });
  await shellIdle(shell);
  const field = await kit.open(shell);
  const settle = async (): Promise<void> => {
    await shellIdle(shell);
    if (kit.name === 'Vue') await Promise.resolve();
  };
  return { shell, field, settle };
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe.each(KITS)('a focused bound field, in $name', (kit) => {
  it('with replaceDraftOnWrite: a value the action writes replaces what is typed', async () => {
    const { shell, field, settle } = await boot(kit, { replaceDraftOnWrite: true });
    await field.type('a');
    await field.type('ab');
    await field.type('abc');
    expect(dataOf(shell)['q']).toBe('abc');
    expect(field.el().value).toBe('abc');
    await publish(shell, 'clear', field.wrap);
    await settle();
    expect(dataOf(shell)['q']).toBe('');
    expect(field.el().value).toBe('');
    await field.type(`${field.el().value}d`);
    expect(dataOf(shell)['q']).toBe('d');
  });

  it('without it, the field keeps what is typed, as before', async () => {
    const { shell, field, settle } = await boot(kit, {});
    await field.type('abc');
    await publish(shell, 'clear', field.wrap);
    await settle();
    expect(dataOf(shell)['q']).toBe('');
    expect(field.el().value).toBe('abc');
    await field.type(`${field.el().value}d`);
    expect(dataOf(shell)['q']).toBe('abcd');
  });

  it('with replaceDraftOnWrite and a debounce: the write drops the typing still waiting, so leaving the field does not write it back', async () => {
    const { shell, field, settle } = await boot(kit, { replaceDraftOnWrite: true, debounce: 10_000 });
    await field.type('abc');
    expect(dataOf(shell)['q']).toBe('');
    await publish(shell, 'reset', field.wrap);
    await settle();
    expect(field.el().value).toBe('x');
    field.wrap(() => field.el().blur());
    await settle();
    expect(dataOf(shell)['q']).toBe('x');
  });

  it('with replaceDraftOnWrite and a debounce: a write that leaves the stored value as it was changes nothing, and leaving the field writes the typing', async () => {
    const { shell, field, settle } = await boot(kit, { replaceDraftOnWrite: true, debounce: 10_000 });
    await field.type('abc');
    await publish(shell, 'clear', field.wrap);
    await settle();
    expect(field.el().value).toBe('abc');
    field.wrap(() => field.el().blur());
    await settle();
    expect(dataOf(shell)['q']).toBe('abc');
  });

  it('with replaceDraftOnWrite: a value the field sent before it was left is not taken for its echo when the action writes it later', async () => {
    const { shell, field, settle } = await boot(kit, { replaceDraftOnWrite: true, debounce: 10_000 });
    await field.type('abc');
    field.wrap(() => field.el().blur());
    await settle();
    expect(dataOf(shell)['q']).toBe('abc');
    await publish(shell, 'to-z', field.wrap);
    await settle();
    field.wrap(() => field.el().focus());
    await settle();
    expect(field.el().value).toBe('z');
    await publish(shell, 'to-abc', field.wrap);
    await settle();
    expect(field.el().value).toBe('abc');
  });
});
