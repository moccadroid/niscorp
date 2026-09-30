import { createElement } from 'react';
import { createComponentRegistry } from '@niscorp/nova';
import type { RenderNode } from '@niscorp/nova';
import { createDomView } from '@niscorp/nova/adapters/dom';
import { fallback } from '@niscorp/nova/adapters/dom/components';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { Target } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { FONTS_HREF, LYCEUM_CSS, ROOT_CLASS } from './tokens';
import { LOOKS, POSTER_KIT, oneOf } from './kit';
import { REACT_KIT } from './react.kit';
import { vueRenderer } from './vue.kit';
import { lyceumRegistry } from './registry';

// The terminal's render target: the same trees, drawn by one of three
// renderers — nova's DOM adapter with lyceum's kit, moss's React target with
// the React port of it, moss's Vue target with the Vue port. All three wear
// the one stylesheet (./tokens.ts), so they look the same; what differs is who
// builds the elements. WHICH is in the frame: a `Look` the server sets for
// this screen's surface (server/renderers.ts). Each update reads it; when it
// names another renderer, the one drawing now is taken down and the other
// mounted on the same root. Nothing is sent to switch: the speaker writes the
// surface's row, the server sets the frame's `Look` anew, and the next frame
// names the other renderer. No `Look`: DOM.
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

// nova's DOM adapter, with the kit.
const domRenderer = (root: HTMLElement): Target => (api) => {
  const view = createDomView(root, lyceumRegistry(POSTER_KIT), api, { fallback });
  view.render();
  return { update: view.render, destroy: view.destroy };
};

// moss's React target, with the React kit. The DOM adapter draws a canvas as a
// `<div data-canvas>` and an action instance as a `<div>`, and the stylesheet
// lays the screen out by those; React's wire slots draw neither, so the kit
// wraps them.
const reactRenderer = (root: HTMLElement): Target => {
  const registry = createComponentRegistry<NovaComponent>();
  registry.registerAll(REACT_KIT);
  const target = reactTarget({ root, registry, slotWrapper: ({ children }) => createElement('div', { 'data-component': 'ActionSlot' }, children) });
  const wire = registry.get('CanvasSlot')?.component;
  if (wire === undefined) throw new Error('moss registered no CanvasSlot');
  const CanvasSlot: NovaComponent = (props) => createElement('div', { 'data-canvas': props['canvasId'] }, createElement(wire, props));
  registry.register('CanvasSlot', CanvasSlot);
  return target;
};

export const lyceumTarget = (config: { root: HTMLElement }): Target => {
  const { root } = config;
  const renderers: Record<(typeof LOOKS)[number], Target> = { dom: domRenderer(root), react: reactRenderer(root), vue: vueRenderer(root) };
  return (api) => {
    dress(root.ownerDocument);
    root.classList.add(ROOT_CLASS);
    let drawing: { look: (typeof LOOKS)[number]; mount: ReturnType<Target> } | undefined;
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
      const look = lookIn(api.frame()) ?? 'dom';
      root.setAttribute('data-look', look);
      if (drawing !== undefined && drawing.look === look) {
        drawing.mount.update();
        return;
      }
      drawing?.mount.destroy();
      root.replaceChildren();
      drawing = { look, mount: renderers[look](api) };
    };
    paint();
    return {
      update: paint,
      destroy: () => {
        drawing?.mount.destroy();
        root.classList.remove(ROOT_CLASS);
        root.removeAttribute('data-look');
      },
    };
  };
};
