import type { ComponentRegistry, RenderNode } from '@layout/types';
import type { NovaEvent } from '@shared/event-bus/schemas';
import type { RenderApi } from '@shell';

// ═══════════════════════════════════════════════════════════
// @niscorp/nova/adapters/dom — a vanilla-DOM adapter, the platform sibling of
// nova/react. It turns a served RenderNode tree into DOM: registry lookup →
// element, recurse children, and wire events BY CONVENTION — a `ref`'d
// element dispatches `ui:click`, a `model`'d element dispatches `ui:model`
// (+ `ui:key`), the payload of a click is the node's `value` prop. Origin is
// never stamped here — moss stamps the active instance server-side.
//
// No framework: the registry maps a component name to a function that builds
// an element from props + already-rendered children. `CanvasSlot` is resolved
// here (the frame's markers → per-canvas trees), the one piece of terminal
// structure the renderer owns; the terminal hands in `canvasTree`/`dispatch`.
// See packages/nova/ADAPTER.md for the shared adapter contract.
// ═══════════════════════════════════════════════════════════

export type DomComponentContext = {
  props: Record<string, unknown>;
  // the node's children, already rendered — the component appends them where
  // it wants (most append to their own element; leaves ignore them).
  children: Node[];
  // the dispatch in force here (canvas-scoped inside a CanvasSlot) — for
  // data-driven components with INTERNAL interactivity (a table's row clicks,
  // an inline checkbox); simple components ignore it and let the renderer wire
  // their `ref`/`model` by convention.
  dispatch: (event: NovaEvent) => void;
};

// A DOM component: props + rendered children in, one element out.
export type DomComponent = (ctx: DomComponentContext) => HTMLElement;

// What the terminal hands the view: core's `RenderApi` (the frame, per-canvas
// trees, a canvas-scoped dispatch, publish). Aliased, not redeclared, so the
// dom adapter, the react adapter, and moss's terminal share ONE definition —
// drift is impossible. CanvasSlot resolution + event routing ride these; the
// renderer never touches the wire directly.
export type DomRenderApi = RenderApi;

export type DomView = {
  // (re)render from the current snapshot; call on every wire change
  render: () => void;
  destroy: () => void;
};

const CANVAS_SLOT = 'CanvasSlot';

// The recursion context: the registry, the dispatch in force (frame chrome
// dispatches nothing; a CanvasSlot switches it to that canvas's), publish,
// and the canvas resolver.
type Ctx = {
  registry: ComponentRegistry<DomComponent>;
  dispatch: (event: NovaEvent) => void;
  api: DomRenderApi;
  // used when a component name is unregistered — a permissive renderer (the
  // html terminal's default kit) supplies one so unknown primitives render
  // their children instead of an error; strict consumers omit it.
  fallback?: DomComponent;
};

const errorEl = (code: string, message: string): HTMLElement => {
  const el = document.createElement('div');
  el.setAttribute('data-nova-error', code);
  el.textContent = `${code}: ${message}`;
  return el;
};

// Read the model value off an event target — a checkbox reports `checked`,
// everything else `value`.
const readValue = (target: EventTarget | null): unknown => {
  if (target instanceof HTMLInputElement && target.type === 'checkbox') return target.checked;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return target.value;
  return '';
};

// Attach the conventional listeners: a model'd element is an input (dispatch
// ui:model on change, ui:key on keydown); a bare ref'd element is clickable
// (dispatch ui:click, payload = its `value` prop). Uniform across every
// component — the event vocabulary is the convention, not per-component code.
const wireEvents = (el: HTMLElement, node: Extract<RenderNode, { type: 'component' }>, dispatch: (event: NovaEvent) => void): void => {
  if (node.model !== undefined) {
    const ref = node.model.ref;
    const debounce = typeof node.props['debounce'] === 'number' ? (node.props['debounce'] as number) : 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = (value: unknown): void => dispatch({ type: 'ui:model', ref, payload: value });
    el.addEventListener('input', (e) => {
      const value = readValue(e.target);
      if (debounce > 0) {
        clearTimeout(timer);
        timer = setTimeout(() => fire(value), debounce);
      } else fire(value);
    });
    el.addEventListener('keydown', (e) => {
      if (e instanceof KeyboardEvent) dispatch({ type: 'ui:key', ref, key: e.key });
    });
    return;
  }
  if (node.ref !== undefined) {
    const ref = node.ref;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = node.props['value'];
      dispatch(value === undefined ? { type: 'ui:click', ref } : { type: 'ui:click', ref, payload: value });
    });
  }
};

const renderNode = (node: RenderNode, ctx: Ctx): Node => {
  if (node.type === 'text') return document.createTextNode(node.value);
  if (node.type === 'fragment') {
    const frag = document.createDocumentFragment();
    for (const child of node.children) frag.appendChild(renderNode(child, ctx));
    return frag;
  }
  if (node.type === 'error') return errorEl(node.code, node.message);

  // component
  if (node.name === CANVAS_SLOT) {
    const canvasId = typeof node.props['canvasId'] === 'string' ? (node.props['canvasId'] as string) : '';
    const host = document.createElement('div');
    host.setAttribute('data-canvas', canvasId);
    if (canvasId === '') return host;
    // Switch dispatch to this canvas's; the server stamps origin, so the
    // terminal just tags the canvas.
    const canvasCtx: Ctx = { ...ctx, dispatch: (event) => ctx.api.dispatch(canvasId, event) };
    for (const child of ctx.api.canvasTree(canvasId)) host.appendChild(renderNode(child, canvasCtx));
    return host;
  }

  const entry = ctx.registry.get(node.name);
  const build = entry !== undefined ? entry.component : ctx.fallback;
  if (build === undefined) return errorEl('COMPONENT_NOT_FOUND', node.name);

  const children = node.children.map((child) => renderNode(child, ctx));
  const el = build({ props: node.props, children, dispatch: ctx.dispatch });
  el.setAttribute('data-component', node.name);
  if (node.ref !== undefined) el.setAttribute('data-ref', node.ref);
  wireEvents(el, node, ctx.dispatch);
  return el;
};

// The one interactive concession: never overwrite the value of the focused
// input when a new tree arrives. We rebuild fully (the
// server is authoritative), so capture the focused ref + value + caret before,
// and restore them after — the in-progress value wins over the server's.
type Focus = { ref: string; value: string; start: number | null; end: number | null };

const captureFocus = (root: HTMLElement): Focus | undefined => {
  const active = root.ownerDocument.activeElement;
  if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) return undefined;
  const ref = active.getAttribute('data-ref');
  if (ref === null || !root.contains(active)) return undefined;
  return { ref, value: active.value, start: active.selectionStart, end: active.selectionEnd };
};

const restoreFocus = (root: HTMLElement, focus: Focus): void => {
  const el = root.querySelector(`[data-ref="${focus.ref}"]`);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  el.value = focus.value; // the user's in-progress value, not the server's
  el.focus();
  try {
    el.setSelectionRange(focus.start ?? el.value.length, focus.end ?? el.value.length);
  } catch {
    /* selectionRange throws on some input types — harmless */
  }
};

export const createDomView = (
  root: HTMLElement,
  registry: ComponentRegistry<DomComponent>,
  api: DomRenderApi,
  options: { fallback?: DomComponent } = {},
): DomView => {
  // The frame dispatches nothing (chrome); only a CanvasSlot's subtree does.
  const ctx: Ctx = { registry, dispatch: () => undefined, api, ...(options.fallback !== undefined ? { fallback: options.fallback } : {}) };
  const render = (): void => {
    const focus = captureFocus(root);
    root.replaceChildren();
    for (const node of api.frame()) root.appendChild(renderNode(node, ctx));
    if (focus !== undefined) restoreFocus(root, focus);
  };
  return { render, destroy: () => root.replaceChildren() };
};
