import { createDomView } from '@niscorp/nova/adapters/dom';
import { fallback } from '@niscorp/nova/adapters/dom/components';
import type { Target } from '@niscorp/moss/terminal';
import { FONTS_HREF, LYCEUM_CSS, ROOT_CLASS } from './tokens';
import { lyceumRegistry } from './registry';

// The terminal's render target: nova's DOM view, lyceum's kit, lyceum's look.
// The stylesheet and the fonts go into the document once.
const dressed = new WeakSet<Document>();
const dress = (doc: Document): void => {
  if (dressed.has(doc)) return;
  const fonts = doc.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href = FONTS_HREF;
  doc.head.appendChild(fonts);
  const style = doc.createElement('style');
  style.setAttribute('data-lyceum', '');
  style.textContent = LYCEUM_CSS;
  doc.head.appendChild(style);
  dressed.add(doc);
};

export const lyceumTarget = (config: { root: HTMLElement }): Target => (api) => {
  const { root } = config;
  dress(root.ownerDocument);
  root.classList.add(ROOT_CLASS);
  const view = createDomView(root, lyceumRegistry(), api, { fallback });
  view.render();
  return {
    update: view.render,
    destroy: () => {
      view.destroy();
      root.classList.remove(ROOT_CLASS);
    },
  };
};
