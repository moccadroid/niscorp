// ═══════════════════════════════════════════════════════════════
// THE BROWSER HALF OF THE HARNESS.
//
// `world.ts` boots the server and hands back DATA — a render tree, asserted as
// JSON. Every check in this directory stops there, which leaves the thing that
// DRAWS the tree unasserted: ~2,500 lines of component code that no check has
// ever executed. Twice a bug has passed every one of them and shown up on a
// real click, and both times the reason was the same — a check synthesises the
// event a component WOULD have emitted:
//
//     shell.dispatch({ type: 'ui:click', ref: 'open', payload: { person_id } })
//
// and the component is the only thing that actually decides that payload. So a
// check writes both halves of a contract and never puts them together.
//
// This mounts a tree into a real DOM through the real kit, so a check can read
// what a person would read and click what they would click. Not a browser: no
// layout engine, so nothing here can see an overlap, a tap target or a bar
// pinned to the wrong corner. That class stays a browser pass. What it CAN see
// is everything between a prop and an event.
//
// Order matters when a check wants both halves: import `world` FIRST. It boots
// pglite, which sniffs its environment at load; this installs a DOM over the
// same globals.
// ═══════════════════════════════════════════════════════════════
import { JSDOM } from 'jsdom';
import type { NovaEvent, RenderNode } from '@niscorp/nova';

// ── the document ─────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="lyra"></div></body></html>', {
  url: 'http://lyra.test/',
  pretendToBeVisual: true,
});
const win = dom.window;

// The viewport is a NUMBER the kit can ask about, because the navigation is
// two shapes over one arrangement — a rail at the desk, a drawer and a thumb
// bar on a phone — and `Drawer` picks between them with `matchMedia`, which
// jsdom does not implement. Without this the whole chrome throws.
let viewportWidth = 1280;
const mediaLists: (() => void)[] = [];

const mediaMatcher = (query: string): unknown => {
  const min = /\(min-width:\s*(\d+)px\)/.exec(query);
  const max = /\(max-width:\s*(\d+)px\)/.exec(query);
  const matches = (): boolean =>
    (min?.[1] === undefined || viewportWidth >= Number(min[1])) && (max?.[1] === undefined || viewportWidth <= Number(max[1]));
  const listeners = new Set<(event: { matches: boolean; media: string }) => void>();
  mediaLists.push(() => listeners.forEach((fn) => fn({ matches: matches(), media: query })));
  return {
    media: query,
    get matches() {
      return matches();
    },
    addEventListener: (_type: string, fn: (event: { matches: boolean; media: string }) => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: (event: { matches: boolean; media: string }) => void) => listeners.delete(fn),
    addListener: (fn: (event: { matches: boolean; media: string }) => void) => listeners.add(fn),
    removeListener: (fn: (event: { matches: boolean; media: string }) => void) => listeners.delete(fn),
    onchange: null,
    dispatchEvent: () => true,
  };
};

Object.defineProperty(win, 'matchMedia', { value: mediaMatcher, writable: true });

for (const name of [
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'matchMedia',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'HTMLIFrameElement',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'MessageEvent',
  'CustomEvent',
  'DOMRect',
] as const) {
  Object.defineProperty(globalThis, name, { value: (win as unknown as Record<string, unknown>)[name], writable: true, configurable: true });
}

// React 19 refuses to flush effects outside `act` without this, and an effect
// that never ran is a component only half-rendered: no theme tokens, no
// message listener, no focus restore.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Imported AFTER the globals exist — react-dom binds to the document it finds.
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { NovaRenderProvider, RenderTree } = await import('@niscorp/nova/adapters/react');
const { buildRegistry } = await import('@lyra/ui/registry');

// ── the mount ────────────────────────────────────────────────
const registry = buildRegistry();

// The two structural slots belong to a SHELL. A flattened tree has already
// resolved `CanvasSlot` away and carries each instance's tree as the
// `ActionSlot`'s children, so here they are pass-throughs — nova's own look
// for a shell context a check does not have.
const passthrough = ({ children }: { children?: unknown }): unknown => children ?? null;
registry.register('CanvasSlot', passthrough as never);
registry.register('ActionSlot', passthrough as never);

const host = win.document.getElementById('lyra') as HTMLElement;
const root = createRoot(host);

/** Everything the kit has dispatched since the last `show`. The contract under test. */
export let events: NovaEvent[] = [];

const paint = async (element: unknown): Promise<void> => {
  await act(async () => {
    root.render(element as never);
  });
};

/** Mount a render tree — a shell's, a canvas's, or one node built by hand. */
export const show = async (nodes: RenderNode[]): Promise<void> => {
  events = [];
  await paint(
    createElement(
      NovaRenderProvider as never,
      {
        registry,
        dispatch: (event: NovaEvent) => {
          events.push(event);
        },
        publish: () => undefined,
      } as never,
      createElement(RenderTree as never, { nodes } as never),
    ),
  );
};

/** One component, exactly as a layout would name it: props, an optional ref, children. */
export const node = (name: string, props: Record<string, unknown> = {}, ref?: string, children: RenderNode[] = []): RenderNode => ({
  type: 'component',
  name,
  props,
  children,
  ...(ref === undefined ? {} : { ref }),
});

export const draw = async (name: string, props: Record<string, unknown> = {}, ref?: string): Promise<void> => show([node(name, props, ref)]);

export const unmount = async (): Promise<void> => {
  await paint(null);
};

// ── reading it ───────────────────────────────────────────────
//
// `document.body`, not the mount point: the drawer, the sheet, the thumb bar
// and a row's overflow menu are PORTALLED out of the tree (`.ly-slot` keeps a
// transform, so anything `fixed` inside it pins to the wrong box). Reading the
// mount point alone would miss every one of them.
export const body = (): HTMLElement => win.document.body;
export const html = (): string => win.document.body.innerHTML;
export const text = (): string => win.document.body.textContent ?? '';
export const find = (selector: string): Element | null => win.document.body.querySelector(selector);
export const all = (selector: string): Element[] => [...win.document.body.querySelectorAll(selector)];

/** The first element whose own text is exactly this — how a person finds a button. */
export const byText = (needle: string): Element | null =>
  all('button, a, [role="button"], [role="menuitem"]').find((el) => (el.textContent ?? '').trim() === needle) ?? null;

// ── driving it ───────────────────────────────────────────────
export const click = async (target: Element | string | null): Promise<void> => {
  const el = typeof target === 'string' ? find(target) : target;
  if (el === null) throw new Error(`surface: nothing to click for ${String(target)}`);
  await act(async () => {
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
};

export const press = async (target: Element | string | null, key: string): Promise<void> => {
  const el = typeof target === 'string' ? find(target) : target;
  if (el === null) throw new Error(`surface: nothing to press for ${String(target)}`);
  await act(async () => {
    el.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true }));
  });
};

/** Type into a field the way a person does — React tracks the node's value, so
 *  setting `.value` alone is a keystroke React never hears. */
export const fill = async (target: Element | string | null, value: string): Promise<void> => {
  const el = (typeof target === 'string' ? find(target) : target) as HTMLInputElement | HTMLTextAreaElement | null;
  if (el === null) throw new Error(`surface: no field for ${String(target)}`);
  const proto = el instanceof win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  await act(async () => {
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
  });
};

export const focus = async (target: Element | string | null): Promise<void> => {
  const el = (typeof target === 'string' ? find(target) : target) as HTMLElement | null;
  if (el === null) throw new Error(`surface: nothing to focus for ${String(target)}`);
  await act(async () => {
    el.dispatchEvent(new win.Event('focusin', { bubbles: true }));
    el.focus();
  });
};

export const blur = async (target: Element | string | null): Promise<void> => {
  const el = (typeof target === 'string' ? find(target) : target) as HTMLElement | null;
  if (el === null) throw new Error(`surface: nothing to blur for ${String(target)}`);
  await act(async () => {
    el.blur();
    el.dispatchEvent(new win.Event('focusout', { bubbles: true }));
  });
};

/** Change the width the kit believes it has, and tell everything listening. */
export const resize = async (width: number): Promise<void> => {
  viewportWidth = width;
  await act(async () => {
    mediaLists.forEach((fire) => fire());
  });
};

/** Every component name a tree names — what a coverage number is counted from. */
export const namesIn = (nodes: RenderNode[], into = new Set<string>()): Set<string> => {
  for (const item of nodes) {
    if (item.type === 'component') {
      into.add(item.name);
      namesIn(item.children, into);
    } else if (item.type === 'fragment') {
      namesIn(item.children, into);
    }
  }
  return into;
};

/** What nova renders when a name is not in the registry, or a component threw. */
export const errorMarkers = (): string[] => all('[data-nova-error]').map((el) => el.getAttribute('data-nova-error') ?? '?');
