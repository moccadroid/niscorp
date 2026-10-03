import type { ComponentRegistry } from '@layout/types';
import type { RenderApi } from '@shell';
import { createDomView } from './index';
import type { DomComponent } from './index';

// ═══════════════════════════════════════════════════════════
// @niscorp/nova/adapters/dom/server — the DOM adapter, drawing to a string.
//
// A DOM kit builds real elements, so drawing one where there is no browser needs
// a DOM to build them in. The caller hands one in — a `window` from jsdom,
// happy-dom or linkedom; nova depends on none of them — and this draws into it
// and reads the markup back. What is drawn is whatever the `RenderApi` holds: a
// served snapshot, or a shell that lives in this process (`shellView`).
//
// A kit's components name `document` as a global, the way they do in a browser.
// So for the length of one draw — synchronous from start to end, and so unable
// to interleave with another — the window's own names are lent to the global
// scope, and taken back whatever happens.
//
// The browser needs no twin of this to pick the page up: a view's FIRST render
// replaces whatever its root holds, so these elements are replaced with the
// same elements, in one step (`mountShell`). Only the first — from then on the
// view keeps what did not change.
//
// A draw ends with the view destroyed, so whatever a component started while
// it was built (a timer, through its `onRemove`) is stopped here rather than
// left running in a process that only wanted the markup.
// ═══════════════════════════════════════════════════════════

// What a DOM kit and the adapter itself name as globals.
const LENT = ['document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'KeyboardEvent', 'Event'];

export const renderToString = (registry: ComponentRegistry<DomComponent>, api: RenderApi, options: { window: object; fallback?: DomComponent }): string => {
  const before = LENT.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  try {
    for (const name of LENT) {
      const value: unknown = Reflect.get(options.window, name);
      if (value !== undefined) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    const root = document.createElement('div');
    const view = createDomView(root, registry, api, options.fallback !== undefined ? { fallback: options.fallback } : {});
    view.render();
    const markup = root.innerHTML;
    view.destroy();
    return markup;
  } finally {
    for (const [name, descriptor] of before) {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
  }
};
