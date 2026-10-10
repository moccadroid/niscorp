// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useContext } from 'react';
import { defineComponent, h, inject, nextTick } from 'vue';
import { createComponentRegistry } from '@niscorp/nova';
import type { RenderComponentNode, RenderNode } from '@niscorp/nova';
import type { NovaComponent as ReactComponent } from '@niscorp/nova/adapters/react';
import { registerNovaReactComponents } from '@niscorp/nova/adapters/react/components';
import type { NovaComponent as VueComponent } from '@niscorp/nova/adapters/vue';
import { registerNovaVueComponents } from '@niscorp/nova/adapters/vue/components';
import type { Wire, WireStatus } from '../src/client';
import { createTerminal, mountTerminal } from '../src/terminal';
import type { Target, TerminalApi, TerminalMount } from '../src/terminal';
import { domTarget } from '../src/terminal/dom';
import { TerminalApiContext, reactTarget } from '../src/terminal/react';
import { renderSnapshot as drawReact } from '../src/terminal/react/server';
import { TerminalApiKey, vueTarget } from '../src/terminal/vue';
import { renderSnapshot as drawVue } from '../src/terminal/vue/server';

// ═══════════════════════════════════════════════════════════
// The connection's status reaches every target, the same way: it is on what a
// target renders against, beside the frame and the trees, and a change of it
// is an update like a change of them. A screen left up by a dead socket looks
// like a working one, so a target has to be able to say which it is.
//
// What a target DRAWS for a status is its own, or the app's. A target that
// draws into an element says the status on that element and draws nothing.
// ═══════════════════════════════════════════════════════════

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const component = (name: string, props: Record<string, unknown> = {}, children: RenderNode[] = []): RenderComponentNode => ({ type: 'component', name, props, children });
const text = (value: string): RenderNode => ({ type: 'text', value });

const FRAME: RenderNode[] = [component('Text', {}, [text('frame')]), component('CanvasSlot', { canvasId: 'main' })];
const TREES: Record<string, RenderNode[]> = { main: [component('Text', {}, [text('rooms')])] };

// A wire as far as a terminal reads it, whose status a test moves by hand.
const wireOf = (start: WireStatus): { wire: Wire; becomes: (status: WireStatus) => void } => {
  let status = start;
  const listeners = new Set<() => void>();
  const wire: Wire = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    snapshot: () => ({ frame: FRAME, trees: new Map(Object.entries(TREES)) }),
    status: () => status,
    dispatch: () => undefined,
    publish: () => undefined,
    reset: () => undefined,
    back: () => undefined,
    popTo: () => undefined,
    dispose: () => undefined,
  };
  return {
    wire,
    becomes: (next) => {
      status = next;
      for (const listener of listeners) listener();
    },
  };
};

// What a target renders against, with a status a test moves by hand: a target
// driven directly, as the conductor would drive it.
const apiOf = (start: WireStatus): { api: TerminalApi; becomes: (status: WireStatus) => void } => {
  let status = start;
  return {
    api: { frame: () => FRAME, canvasTree: (id) => TREES[id] ?? [], dispatch: () => undefined, publish: () => undefined, status: () => status },
    becomes: (next) => {
      status = next;
    },
  };
};

const mounts: TerminalMount[] = [];
const terminals: { destroy: () => void }[] = [];
afterEach(() => {
  for (const mount of mounts.splice(0)) mount.destroy();
  for (const terminal of terminals.splice(0)) terminal.destroy();
  document.body.innerHTML = '';
});

const rootOf = (html = ''): HTMLElement => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  root.innerHTML = html;
  return root;
};

const reactKit = (extra: Record<string, ReactComponent> = {}): ReturnType<typeof createComponentRegistry<ReactComponent>> => {
  const made = createComponentRegistry<ReactComponent>();
  registerNovaReactComponents(made);
  made.registerAll(extra);
  return made;
};
const vueKit = (extra: Record<string, VueComponent> = {}): ReturnType<typeof createComponentRegistry<VueComponent>> => {
  const made = createComponentRegistry<VueComponent>();
  registerNovaVueComponents(made);
  made.registerAll(extra);
  return made;
};

describe('the conductor tells its target the status', () => {
  // A target that writes down what it is told, each time it is told.
  const listening = (): { target: Target; told: WireStatus[] } => {
    const told: WireStatus[] = [];
    const target: Target = (api) => {
      told.push(api.status());
      return { update: () => void told.push(api.status()), destroy: () => undefined };
    };
    return { target, told };
  };

  it('when it mounts, and again each time the status changes', () => {
    const { wire, becomes } = wireOf('connecting');
    const { target, told } = listening();
    terminals.push(createTerminal({ target, wire }));
    expect(told).toEqual(['connecting']);
    becomes('open');
    becomes('closed');
    becomes('connecting');
    expect(told).toEqual(['connecting', 'open', 'closed', 'connecting']);
  });

  it('a target swapped in is told what the status is by then', () => {
    const { wire, becomes } = wireOf('connecting');
    const first = listening();
    const second = listening();
    const terminal = mountTerminal({ targets: { first: first.target, second: second.target }, wire, trapBack: false });
    terminals.push(terminal);
    becomes('closed');
    terminal.swap();
    expect(second.told).toEqual(['closed']);
  });
});

// The three targets that draw into an element say the status on it. What it
// looks like is the kit's stylesheet's.
describe.each([
  ['react', (root: HTMLElement): Target => reactTarget({ root, registry: reactKit() })],
  ['vue', (root: HTMLElement): Target => vueTarget({ root, registry: vueKit() })],
  ['dom', (root: HTMLElement): Target => domTarget({ root })],
])('the %s target says the status on its root', (_name, targetOn) => {
  it('as it mounts, as it changes, and no longer once it is destroyed', async () => {
    const root = rootOf();
    const { api, becomes } = apiOf('connecting');
    let mount: TerminalMount | undefined;
    await act(async () => {
      mount = targetOn(root)(api);
    });
    expect(root.getAttribute('data-wire-status')).toBe('connecting');
    for (const status of ['open', 'closed', 'incompatible', 'static'] as const) {
      becomes(status);
      await act(async () => mount?.update());
      expect(root.getAttribute('data-wire-status')).toBe(status);
    }
    expect(root.textContent).toContain('rooms');
    await act(async () => mount?.destroy());
    expect(root.hasAttribute('data-wire-status')).toBe(false);
  });
});

// A kit's own component reads the status off what the target provides, and is
// drawn again when it changes.
describe('a kit component that draws the status', () => {
  const frameWith = (name: string): RenderNode[] => [component(name), ...FRAME];

  it('react: through TerminalApiContext', async () => {
    const Status: ReactComponent = () => createElement('output', null, useContext(TerminalApiContext)?.status());
    const root = rootOf();
    const { api, becomes } = apiOf('connecting');
    const shown: TerminalApi = { ...api, frame: () => frameWith('Status') };
    await act(async () => {
      mounts.push(reactTarget({ root, registry: reactKit({ Status }) })(shown));
    });
    expect(root.querySelector('output')?.textContent).toBe('connecting');
    becomes('closed');
    await act(async () => mounts[0]?.update());
    expect(root.querySelector('output')?.textContent).toBe('closed');
  });

  it('vue: through TerminalApiKey, and it is reactive', async () => {
    const Status = defineComponent(() => {
      const api = inject(TerminalApiKey, undefined);
      return () => h('output', api?.status());
    });
    const root = rootOf();
    const { api, becomes } = apiOf('connecting');
    const shown: TerminalApi = { ...api, frame: () => frameWith('Status') };
    mounts.push(vueTarget({ root, registry: vueKit({ Status }) })(shown));
    expect(root.querySelector('output')?.textContent).toBe('connecting');
    becomes('closed');
    mounts[0]?.update();
    await nextTick();
    expect(root.querySelector('output')?.textContent).toBe('closed');
  });
});

// A page drawn on the server is drawn with the status its terminal starts in:
// connecting, or static when nothing on the page can still happen and no
// socket will be opened. So a kit that draws the status draws the same thing
// on both sides, and the page is adopted.
describe('a screen drawn to a string', () => {
  const Status: ReactComponent = () => createElement('output', null, useContext(TerminalApiContext)?.status());
  const snapshot = { frame: [component('Status'), ...FRAME], trees: TREES };

  it('react: is drawn connecting, or static for a page that is not live', () => {
    expect(drawReact({ snapshot, registry: reactKit({ Status }) })).toContain('<output>connecting</output>');
    expect(drawReact({ snapshot: { ...snapshot, live: true }, registry: reactKit({ Status }) })).toContain('<output>connecting</output>');
    expect(drawReact({ snapshot: { ...snapshot, live: false }, registry: reactKit({ Status }) })).toContain('<output>static</output>');
  });

  it('react: the browser’s target adopts it, with nothing complained about', async () => {
    const root = rootOf(drawReact({ snapshot, registry: reactKit({ Status }) }));
    const drawn = root.querySelector('output');
    const complaints = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { api } = apiOf('connecting');
    await act(async () => {
      mounts.push(reactTarget({ root, registry: reactKit({ Status }) })({ ...api, frame: () => snapshot.frame }));
    });
    expect(complaints).not.toHaveBeenCalled();
    complaints.mockRestore();
    expect(root.querySelector('output')).toBe(drawn);
  });

  it('vue: is drawn connecting, or static for a page that is not live', async () => {
    const VueStatus = defineComponent(() => {
      const api = inject(TerminalApiKey, undefined);
      return () => h('output', api?.status());
    });
    expect(await drawVue({ snapshot, registry: vueKit({ Status: VueStatus }) })).toContain('<output>connecting</output>');
    expect(await drawVue({ snapshot: { ...snapshot, live: false }, registry: vueKit({ Status: VueStatus }) })).toContain('<output>static</output>');
  });
});
