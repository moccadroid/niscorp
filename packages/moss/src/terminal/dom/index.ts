import { createDomView } from '@niscorp/nova/adapters/dom';
import type { DomComponent } from '@niscorp/nova/adapters/dom';
import { defaultRegistry, fallback, DEFAULT_CSS, ROOT_CLASS } from '@niscorp/nova/adapters/dom/components';
import type { ComponentRegistry } from '@niscorp/nova';
import type { Target } from '../index';

// ═══════════════════════════════════════════════════════════
// @niscorp/moss/terminal/dom — the plain-DOM render target: the conductor's
// wire, nova's DOM adapter, and nova's default reference kit. Zero framework,
// zero config — the lightest terminal, and the proof that the terminal is
// trivial and the intelligence is server-side. Pass your own `registry` to
// restyle; omit it for the batteries.
// ═══════════════════════════════════════════════════════════

// One stylesheet per document (a page may host more than one root, and a swap
// re-mounts) — a WeakSet, not a module boolean, so it's per-document truth.
const styled = new WeakSet<Document>();
const injectCss = (doc: Document): void => {
  if (styled.has(doc)) return;
  const style = doc.createElement('style');
  style.setAttribute('data-nova-dom', '');
  style.textContent = DEFAULT_CSS;
  doc.head.appendChild(style);
  styled.add(doc);
};

export const domTarget = (config: { registry?: ComponentRegistry<DomComponent> } = {}): Target => (root, api) => {
  injectCss(root.ownerDocument);
  root.classList.add(ROOT_CLASS);
  const registry = config.registry ?? defaultRegistry();
  // TerminalApi and nova's DomRenderApi are the same shape (frame / canvasTree
  // / dispatch / publish) — hand it straight through.
  const view = createDomView(root, registry, api, { fallback });
  view.render();
  return {
    update: view.render,
    destroy: () => {
      view.destroy();
      root.classList.remove(ROOT_CLASS);
    },
  };
};
