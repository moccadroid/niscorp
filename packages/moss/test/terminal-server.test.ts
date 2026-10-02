// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { nextTick } from 'vue';
import { createComponentRegistry } from '@niscorp/nova';
import type { RenderComponentNode, RenderNode } from '@niscorp/nova';
import type { NovaComponent as ReactComponent } from '@niscorp/nova/adapters/react';
import { registerNovaReactComponents } from '@niscorp/nova/adapters/react/components';
import type { NovaComponent as VueComponent } from '@niscorp/nova/adapters/vue';
import { registerNovaVueComponents } from '@niscorp/nova/adapters/vue/components';
import { reactTarget } from '../src/terminal/react';
import { renderSnapshot as drawReact } from '../src/terminal/react/server';
import { vueTarget } from '../src/terminal/vue';
import { renderSnapshot as drawVue } from '../src/terminal/vue/server';
import { domTarget } from '../src/terminal/dom';
import { renderSnapshot as drawDom } from '../src/terminal/dom/server';
import type { TerminalApi, TerminalMount } from '../src/terminal';

// ═══════════════════════════════════════════════════════════
// The targets that draw to a STRING, each against its browser twin: what the
// server writes into a page is what the browser's target then stands on —
// adopted element for element (react, vue) or rebuilt to the same elements
// (dom) — with nothing said about a mismatch.
// ═══════════════════════════════════════════════════════════

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const component = (name: string, props: Record<string, unknown> = {}, children: RenderNode[] = []): RenderComponentNode => ({ type: 'component', name, props, children });
const text = (value: string): RenderNode => ({ type: 'text', value });

// A served screen: a frame around one canvas, one instance on it.
const snapshot = {
  frame: [component('Text', {}, [text('frame')]), component('CanvasSlot', { canvasId: 'main' })],
  trees: {
    main: [
      {
        ...component('ActionSlot', { instanceId: 'act-seed-1', canvasId: 'main', definitionId: 'counter' }, [
          component('Text', {}, [text('Rooms & <suites>')]),
          { ...component('Button', { label: 'inc' }), ref: 'inc' },
        ]),
        key: 'act-seed-1',
      },
    ],
  },
};

const apiOf = (dispatched: unknown[] = []): TerminalApi => ({
  frame: () => snapshot.frame,
  canvasTree: (id) => (id === 'main' ? snapshot.trees.main : []),
  dispatch: (canvas, event) => void dispatched.push({ canvas, event }),
  publish: () => undefined,
});

const mounts: TerminalMount[] = [];
afterEach(() => {
  for (const mount of mounts.splice(0)) mount.destroy();
  document.body.innerHTML = '';
});

const page = (html: string): { root: HTMLElement; parsed: string; firstButton: Element | null } => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  root.innerHTML = html;
  return { root, parsed: root.innerHTML, firstButton: root.querySelector('button') };
};

describe('terminal/react/server', () => {
  const registry = (): ReturnType<typeof createComponentRegistry<ReactComponent>> => {
    const made = createComponentRegistry<ReactComponent>();
    registerNovaReactComponents(made);
    return made;
  };

  it('draws the frame, the canvas inside it and the instance inside that — escaped', () => {
    const html = drawReact({ snapshot, registry: registry() });
    expect(html).toContain('frame');
    expect(html).toContain('Rooms &amp; &lt;suites&gt;');
    expect(html).toContain('<button');
  });

  it('the browser’s target adopts what it wrote: the same elements, nothing complained about', async () => {
    const { root, parsed, firstButton } = page(drawReact({ snapshot, registry: registry() }));
    const complaints = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const dispatched: unknown[] = [];
    await act(async () => {
      mounts.push(reactTarget({ root, registry: registry() })(apiOf(dispatched)));
    });
    expect(complaints).not.toHaveBeenCalled();
    complaints.mockRestore();
    expect(root.innerHTML).toBe(parsed);
    expect(root.querySelector('button')).toBe(firstButton);
    // adopted, and alive: the server's button now dispatches, stamped with its instance
    await act(async () => {
      firstButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:click', ref: 'inc', origin: 'act-seed-1' } }]);
  });

  it('a root with elements but a wire with no frame is replaced, not adopted', async () => {
    const { root } = page('<p>somebody else’s screen</p>');
    const complaints = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const empty: TerminalApi = { frame: () => [], canvasTree: () => [], dispatch: () => undefined, publish: () => undefined };
    await act(async () => {
      mounts.push(reactTarget({ root, registry: registry() })(empty));
    });
    expect(complaints).not.toHaveBeenCalled();
    complaints.mockRestore();
    expect(root.innerHTML).toBe('');
  });
});

describe('terminal/vue/server', () => {
  const registry = (): ReturnType<typeof createComponentRegistry<VueComponent>> => {
    const made = createComponentRegistry<VueComponent>();
    registerNovaVueComponents(made);
    return made;
  };

  it('draws the same screen, escaped', async () => {
    const html = await drawVue({ snapshot, registry: registry() });
    expect(html).toContain('frame');
    expect(html).toContain('Rooms &amp; &lt;suites&gt;');
    expect(html).toContain('<button');
  });

  it('the browser’s target adopts what it wrote', async () => {
    const { root, firstButton } = page(await drawVue({ snapshot, registry: registry() }));
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mounts.push(vueTarget({ root, registry: registry() })(apiOf()));
    await nextTick();
    expect(warnings).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    warnings.mockRestore();
    errors.mockRestore();
    expect(root.querySelector('button')).toBe(firstButton);
  });
});

describe('terminal/dom/server', () => {
  it('draws into the DOM it is handed, and takes back every name it lent', () => {
    const had = Object.getOwnPropertyDescriptor(globalThis, 'KeyboardEvent');
    const html = drawDom({ snapshot, window });
    expect(html).toContain('frame');
    expect(html).toContain('Rooms &amp; &lt;suites&gt;');
    expect(Object.getOwnPropertyDescriptor(globalThis, 'KeyboardEvent')).toEqual(had);
  });

  it('the browser’s target rebuilds to the same elements', () => {
    const { root, parsed } = page(drawDom({ snapshot, window }));
    mounts.push(domTarget({ root })(apiOf()));
    expect(root.innerHTML).toBe(parsed);
  });
});
