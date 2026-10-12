import { createDomView } from '@niscorp/nova/adapters/dom';
import type { DomComponent } from '@niscorp/nova/adapters/dom';
import { defaultRegistry, fallback, DEFAULT_CSS, ROOT_CLASS } from '@niscorp/nova/adapters/dom/components';
import type { ComponentRegistry } from '@niscorp/nova';
import type { Target } from '../index';
import { hideStatus, showStatus } from '../targets';

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
  const reference = config.registry === undefined;
  if (reference) {
    injectCss(root.ownerDocument);
    root.classList.add(ROOT_CLASS);
  }
  const registry = config.registry ?? defaultRegistry();
  const view = createDomView(root, registry, api, { fallback });
  const render = (): void => {
    showStatus(root, api.status());
    view.render();
  };
  render();
  return {
    update: render,
    destroy: () => {
      view.destroy();
      hideStatus(root);
      if (reference) root.classList.remove(ROOT_CLASS);
    },
  };
};
