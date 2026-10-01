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

// Whether the frame says this screen is X-rayed (server/functions/xray.functions.ts).
const xrayIn = (nodes: readonly RenderNode[]): boolean => {
  for (const node of nodes) {
    if (node.type === 'component' && node.name === 'Xray') return node.props['on'] === true;
    if ((node.type === 'component' || node.type === 'fragment') && xrayIn(node.children)) return true;
  }
  return false;
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
  const target = reactTarget({
    root,
    registry,
    // The instance box, as the DOM kit draws it (./registry.ts).
    slotWrapper: ({ instanceId, definitionId, children }) =>
      createElement('div', { 'data-action': definitionId ?? '', 'data-instance': instanceId ?? '' }, createElement('span', { className: 'xray-tag' }, definitionId ?? ''), children),
  });
  const wire = registry.get('CanvasSlot')?.component;
  if (wire === undefined) throw new Error('moss registered no CanvasSlot');
  const CanvasSlot: NovaComponent = (props) => createElement('div', { 'data-canvas': props['canvasId'] }, createElement(wire, props));
  registry.register('CanvasSlot', CanvasSlot);
  return target;
};

export const lyceumTarget = (config: { root: HTMLElement }): Target => {
  const { root } = config;
  // Each renderer draws into a HOST of its own, made when it is chosen and
  // thrown away when another is: whatever a framework leaves on the element it
  // mounted into (Vue's data-v-app, React's container key) goes with it, so the
  // element a laptop inspects names the renderer drawing now and no other. The
  // host is display: contents — it adds no box, and the layout is unchanged.
  const renderers: Record<(typeof LOOKS)[number], (host: HTMLElement) => Target> = { dom: domRenderer, react: reactRenderer, vue: vueRenderer };
  return (api) => {
    dress(root.ownerDocument);
    root.classList.add(ROOT_CLASS);
    // X-RAYED, every action on the screen is outlined with its id as a tag
    // (every renderer draws the same box, ./registry.ts). A tapped tag opens
    // that action: the terminal says which instance, and the phone opens it
    // (member/phone.action.ts). Caught before the action's own element sees
    // the tap, so the tag never presses what is under it.
    const openTag = (event: Event): void => {
      if (!root.hasAttribute('data-xray') || !(event.target instanceof Element)) return;
      const tag = event.target.closest('.xray-tag');
      const box = tag?.parentElement;
      if (tag === null || tag === undefined || box === null || box === undefined) return;
      event.stopPropagation();
      event.preventDefault();
      api.publish('xray-open', { instance: box.getAttribute('data-instance') ?? '', action: box.getAttribute('data-action') ?? '' });
    };
    root.addEventListener('click', openTag, true);
    // AN ACTION WITH A SOUND plays it where it is pressed — one listener for
    // all three renderers, which only mark the button (data-sound).
    const chime = (event: Event): void => {
      if (!(event.target instanceof Element) || event.target.closest('[data-sound="chime"]') === null) return;
      const audio = new AudioContext();
      const gain = audio.createGain();
      gain.connect(audio.destination);
      gain.gain.setValueAtTime(0.25, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.6);
      for (const [hertz, at] of [[880, 0], [1320, 0.14]] as const) {
        const tone = audio.createOscillator();
        tone.type = 'triangle';
        tone.frequency.value = hertz;
        tone.connect(gain);
        tone.start(audio.currentTime + at);
        tone.stop(audio.currentTime + 0.6);
      }
    };
    root.addEventListener('click', chime);
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
      root.toggleAttribute('data-xray', xrayIn(api.frame()));
      if (drawing !== undefined && drawing.look === look) {
        drawing.mount.update();
        return;
      }
      drawing?.mount.destroy();
      const host = root.ownerDocument.createElement('div');
      host.style.display = 'contents';
      root.replaceChildren(host);
      drawing = { look, mount: renderers[look](host)(api) };
    };
    paint();
    return {
      update: paint,
      destroy: () => {
        drawing?.mount.destroy();
        root.removeEventListener('click', openTag, true);
        root.removeEventListener('click', chime);
        root.classList.remove(ROOT_CLASS);
        root.removeAttribute('data-look');
        root.removeAttribute('data-xray');
      },
    };
  };
};
