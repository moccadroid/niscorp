import type { ComponentRegistry } from '@layout/types';
import type { RenderApi } from '@shell';
import { createDomView } from './index';
import type { DomComponent } from './index';

// A kit's components name `document` as a global, so these names of the window
// are lent to the global scope for one draw. The draw is synchronous from start
// to end, so it cannot interleave with another.
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
