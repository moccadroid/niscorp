import { createDomView } from '@niscorp/nova/adapters/dom';
import { fallback } from '@niscorp/nova/adapters/dom/components';
import type { RenderNode } from '@niscorp/nova';
import type { Target } from '@niscorp/moss/terminal';
import { FONTS_HREF, LYCEUM_CSS, ROOT_CLASS } from './tokens';
import { LOOKS, POSTER_KIT, oneOf } from './kit';
import { PLAIN_KIT } from './plain.kit';
import { lyceumRegistry } from './registry';

// The terminal's render target: nova's DOM view, painted with one of lyceum's
// two kits. WHICH is in the tree: the room's `Look` marker (app/actions/room/),
// on the `look` canvas of every screen whose principal holds it. Each update
// reads it and paints with that kit — the poster with its stylesheet, plain
// HTML with none. Nothing is sent to switch: the speaker writes the room row,
// the marker's reactive read changes, and the next tree names the other kit.
// No marker (a screen that does not hold it): the poster.
const dressed = new WeakMap<Document, HTMLStyleElement>();
const dress = (doc: Document): HTMLStyleElement => {
  const done = dressed.get(doc);
  if (done !== undefined) return done;
  const fonts = doc.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href = FONTS_HREF;
  doc.head.appendChild(fonts);
  const style = doc.createElement('style');
  style.setAttribute('data-lyceum', '');
  style.textContent = LYCEUM_CSS;
  doc.head.appendChild(style);
  dressed.set(doc, style);
  return style;
};

const lookIn = (nodes: readonly RenderNode[]): (typeof LOOKS)[number] | undefined => {
  for (const node of nodes) {
    if (node.type === 'component' && node.name === 'Look') return oneOf(node.props['look'], LOOKS);
    const inner = node.type === 'component' || node.type === 'fragment' ? lookIn(node.children) : undefined;
    if (inner !== undefined) return inner;
  }
  return undefined;
};

// Which action instance is on the stage's `main` canvas — the slide. A new one
// is a slide arriving; the same one is the slide updating.
const slideIn = (nodes: readonly RenderNode[]): string | undefined => {
  for (const node of nodes) {
    if (node.type !== 'component' && node.type !== 'fragment') continue;
    const instance = node.type === 'component' ? node.props['instanceId'] : undefined;
    if (typeof instance === 'string') return instance;
    const inner = slideIn(node.children);
    if (inner !== undefined) return inner;
  }
  return undefined;
};

// How long a slide's cells take to wipe in (./tokens.ts, "a slide arriving").
const ENTERING_MS = 2200;

export const lyceumTarget = (config: { root: HTMLElement }): Target => (api) => {
  const { root } = config;
  const style = dress(root.ownerDocument);
  const views = {
    poster: createDomView(root, lyceumRegistry(POSTER_KIT), api, { fallback }),
    plain: createDomView(root, lyceumRegistry(PLAIN_KIT), api, { fallback }),
  };
  let slide: string | undefined;
  let arrived = 0;
  const paint = (): void => {
    const now = slideIn(api.canvasTree('main'));
    if (now !== slide) {
      slide = now;
      arrived = Date.now();
    }
    const elapsed = Date.now() - arrived;
    root.toggleAttribute('data-enter', now !== undefined && elapsed < ENTERING_MS);
    root.style.setProperty('--enter-elapsed', `${elapsed}ms`);
    const look = lookIn(api.canvasTree('look')) ?? 'poster';
    style.disabled = look !== 'poster';
    root.classList.toggle(ROOT_CLASS, look === 'poster');
    root.setAttribute('data-look', look);
    views[look].render();
  };
  paint();
  return {
    update: paint,
    destroy: () => {
      views.poster.destroy();
      root.classList.remove(ROOT_CLASS);
      root.removeAttribute('data-look');
      style.disabled = false;
    },
  };
};
