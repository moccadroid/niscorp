// Import `world` before this: it boots pglite, which sniffs its environment at
// load, and this installs a DOM over the same globals.
import { JSDOM } from 'jsdom';
import type { NovaEvent, RenderNode } from '@niscorp/nova';

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="lyra"></div></body></html>', {
  url: 'http://lyra.test/',
  pretendToBeVisual: true,
});
const win = dom.window;

// jsdom does not implement `matchMedia`, and `Drawer` calls it: without this
// the whole chrome throws.
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

// React 19 refuses to flush effects outside `act` without this.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Imported after the globals exist: react-dom binds to the document it finds.
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { NovaRenderProvider, RenderTree } = await import('@niscorp/nova/adapters/react');
const { buildRegistry } = await import('@lyra/ui/registry');

const registry = buildRegistry();

// A flattened tree carries each instance's tree as the `ActionSlot`'s children,
// and nova's own slots look for a shell context a check does not have.
const passthrough = ({ children }: { children?: unknown }): unknown => children ?? null;
registry.register('CanvasSlot', passthrough as never);
registry.register('ActionSlot', passthrough as never);

const host = win.document.getElementById('lyra') as HTMLElement;
const root = createRoot(host);

export let events: NovaEvent[] = [];

const paint = async (element: unknown): Promise<void> => {
  await act(async () => {
    root.render(element as never);
  });
};

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

// `document.body`, not the mount point: the drawer, the sheet, the thumb bar
// and a row's overflow menu are portalled out of the tree.
export const body = (): HTMLElement => win.document.body;
export const html = (): string => win.document.body.innerHTML;
export const text = (): string => win.document.body.textContent ?? '';
export const find = (selector: string): Element | null => win.document.body.querySelector(selector);
export const all = (selector: string): Element[] => [...win.document.body.querySelectorAll(selector)];

export const byText = (needle: string): Element | null =>
  all('button, a, [role="button"], [role="menuitem"]').find((el) => (el.textContent ?? '').trim() === needle) ?? null;

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

// React tracks the node's value, so assigning `.value` alone is a keystroke
// React never hears.
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

export const resize = async (width: number): Promise<void> => {
  viewportWidth = width;
  await act(async () => {
    mediaLists.forEach((fire) => fire());
  });
};

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

export const errorMarkers = (): string[] => all('[data-nova-error]').map((el) => el.getAttribute('data-nova-error') ?? '?');
