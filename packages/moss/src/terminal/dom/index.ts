import { createDomView } from '@niscorp/nova/adapters/dom';
import type { DomComponent } from '@niscorp/nova/adapters/dom';
import { defaultRegistry, fallback, DEFAULT_CSS, ROOT_CLASS } from '@niscorp/nova/adapters/dom/components';
import type { ComponentRegistry } from '@niscorp/nova';
import type { Target } from '../index';

// ═══════════════════════════════════════════════════════════
// @niscorp/moss/terminal/dom — the plain-DOM render target: the conductor's
// wire, nova's DOM adapter, and nova's default reference kit. Zero framework
// — the lightest terminal, and the proof that the terminal is trivial and
// the intelligence is server-side. Bring a `root`; omit `registry` for the
// batteries — nova's reference kit AND its stylesheet, with its class on the
// root. Pass your own `registry` and the look is yours too: nothing is injected
// and the root gets no class. (The reference stylesheet used to come along
// either way, and restyled an app's own kit over the app's own CSS.)
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

export const domTarget = (config: { root: HTMLElement; registry?: ComponentRegistry<DomComponent> }): Target => (api) => {
  const { root } = config;
  // the reference kit's look belongs to the reference kit
  const reference = config.registry === undefined;
  if (reference) {
    injectCss(root.ownerDocument);
    root.classList.add(ROOT_CLASS);
  }
  const registry = config.registry ?? defaultRegistry();
  // TerminalApi and nova's DomRenderApi are the same shape (frame / canvasTree
  // / dispatch / publish) — hand it straight through.
  const view = createDomView(root, registry, api, { fallback });
  view.render();
  return {
    update: view.render,
    destroy: () => {
      view.destroy();
      if (reference) root.classList.remove(ROOT_CLASS);
    },
  };
};
