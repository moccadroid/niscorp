import { createDomView } from '@niscorp/nova/adapters/dom';
import type { DomComponent } from '@niscorp/nova/adapters/dom';
import { defaultRegistry, fallback } from '@niscorp/nova/adapters/dom/components';
import type { ComponentRegistry, RenderNode } from '@niscorp/nova';

// ═══════════════════════════════════════════════════════════
// @niscorp/moss/terminal/dom/server — the plain-DOM target, drawing to a
// string. A DOM kit builds real elements, so drawing one on a server needs a
// DOM to build them in: the host hands in a `window` (jsdom, happy-dom,
// linkedom — moss depends on none of them) and this draws into it and reads
// the markup back.
//
// A kit's components reach for `document` as a global, the way they do in a
// browser. So for the length of one draw — which is synchronous, start to end,
// and so cannot interleave with another — the window's own names are lent to
// the global scope, and taken back whatever happens.
//
// The browser's target (./index) needs no twin of React's adoption: nova's DOM
// adapter rebuilds its root on every render, so its first render replaces the
// server's elements with the same elements, in one synchronous step.
// ═══════════════════════════════════════════════════════════

// What a DOM kit and nova's adapter name as globals.
const LENT = ['document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'KeyboardEvent', 'Event'];

export type RenderSnapshotConfig = {
  snapshot: { frame: RenderNode[]; trees: Record<string, RenderNode[]> };
  // the app's DOM kit; omitted, nova's reference kit
  registry?: ComponentRegistry<DomComponent>;
  // a DOM to draw in
  window: object;
};

const nothing = (): void => undefined;

export const renderSnapshot = (config: RenderSnapshotConfig): string => {
  const { snapshot, window } = config;
  const before = LENT.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  try {
    for (const name of LENT) {
      const value: unknown = Reflect.get(window, name);
      if (value !== undefined) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    const root = document.createElement('div');
    const api = { frame: () => snapshot.frame, canvasTree: (id: string) => snapshot.trees[id] ?? [], dispatch: nothing, publish: nothing };
    createDomView(root, config.registry ?? defaultRegistry(), api, { fallback }).render();
    return root.innerHTML;
  } finally {
    for (const [name, descriptor] of before) {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
  }
};
