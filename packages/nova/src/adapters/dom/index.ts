import { renderNodeKey } from '@layout/adapter';
import type { ComponentRegistry, RenderNode } from '@layout/types';
import type { NovaEvent } from '@shared/event-bus/schemas';
import { shellView } from '@shell';
import type { RenderApi, Shell } from '@shell';

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
//
// WHAT DID NOT CHANGE IS NOT DRAWN AGAIN. The view keeps the tree it drew
// beside the DOM that tree produced, and a render walks the two together: a
// node that is the same as last time keeps its element — the same DOM node,
// never taken off the page — and only what differs is built. An element that
// stays keeps everything the tree does not hold: focus, scroll, selection, an
// open <details>, a running animation, a timer its component started.
// See packages/nova/ADAPTER.md for the shared adapter contract, and "The DOM
// adapter keeps what did not change" there for the rules a kit can rely on.
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
  // The other end of anything the component starts — a timer, an observer, a
  // subscription. `cleanup` runs once, when the element this call returns
  // leaves the page for good: it was removed, it was replaced because its own
  // props changed, or the view was destroyed. An element that stays is not
  // asked again, so what it started keeps running until then.
  onRemove: (cleanup: () => void) => void;
  // Say that what this component drew depends on its children — it marked
  // them, counted them, treated the first unlike the rest — rather than only
  // holding them. A component that only holds its children has them patched in
  // place under the element it returned; one that says this is asked again
  // whenever it would be handed different children, and is handed the ones that
  // stayed as it left them, so what it does to them it must be able to do twice.
  dependsOnChildren: () => void;
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
const ACTION_SLOT = 'ActionSlot';

type ComponentRenderNode = Extract<RenderNode, { type: 'component' }>;
type Dispatch = (event: NovaEvent) => void;

// The recursion context: the registry, the dispatch in force (frame chrome
// dispatches nothing; a CanvasSlot switches it to that canvas's), publish,
// and the canvas resolver.
type Ctx = {
  registry: ComponentRegistry<DomComponent>;
  dispatch: Dispatch;
  api: DomRenderApi;
  // used when a component name is unregistered — a permissive renderer (the
  // html terminal's default kit) supplies one so unknown primitives render
  // their children instead of an error; strict consumers omit it.
  fallback?: DomComponent;
};

// One node of the tree as it was last drawn, beside the DOM it produced.
type Mount = {
  node: RenderNode;
  // the context this node's children are drawn in
  ctx: Ctx;
  // its top-level DOM nodes: one for a component, a text or an error; a
  // fragment has no element of its own, so its are its children's
  dom: Node[];
  kids: Mount[];
  // Where the kids' nodes can be patched in place: the element itself, when it
  // holds exactly them (`holdsExactly`), or a canvas's own host. `undefined`
  // when the component put them anywhere else — a change to which nodes it has
  // then asks the component again.
  host: Node | undefined;
  cleanups: (() => void)[];
  // a bound field that may not show what the tree says: it was typed in, or the
  // tree's value changed while it was being typed in
  field: { stale: boolean };
};

const errorEl = (code: string, message: string): HTMLElement => {
  const el = document.createElement('div');
  el.setAttribute('data-nova-error', code);
  el.textContent = `${code}: ${message}`;
  return el;
};

// A tree is JSON, so sameness is structural.
const equal = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key) && equal(Reflect.get(a, key), Reflect.get(b, key)));
};

const withoutValue = (props: Record<string, unknown>): Record<string, unknown> => {
  const { value: _value, ...rest } = props;
  return rest;
};

const sameNodes = (a: Node[], b: Node[]): boolean => a.length === b.length && a.every((node, i) => node === b[i]);

const flat = (kids: Mount[]): Node[] => kids.flatMap((kid) => kid.dom);

const canvasIdOf = (node: ComponentRenderNode): string => {
  const canvasId = node.props['canvasId'];
  return typeof canvasId === 'string' ? canvasId : '';
};

// Which canvas or which instance a slot stands for. A different one in the
// same place is a different screen, however alike the two look.
const slotOf = (node: ComponentRenderNode): unknown => {
  if (node.name === CANVAS_SLOT) return node.props['canvasId'];
  if (node.name === ACTION_SLOT) return node.props['instanceId'];
  return undefined;
};

// Core's `renderNodeKey` names a node among its siblings. Two siblings that
// share a name (looped rows that share a `ref` and carry no key) are told
// apart by which of them comes first.
const keyed = <T>(items: readonly T[], nodeOf: (item: T) => RenderNode): [string, T][] => {
  const seen = new Map<string, number>();
  return items.map((item, i) => {
    const key = renderNodeKey(nodeOf(item), i);
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return [count === 0 ? key : `${key}#${count}`, item];
  });
};

// Whether a component's children can be patched where they stand: only when the
// element it returned holds exactly the nodes it was handed, in order, and
// nothing else. Then adding one, taking one out or moving one is what the
// component would have drawn anyway. Anything else — a wrapper inside, a cell
// around each, a heading of its own before them — and the adapter cannot know
// what the component would do with one child more (a kit that wraps each child
// looks, with a single child, exactly like one that wraps them all), so it asks.
// What the shape of the element cannot show — a component that marks or counts
// the children it holds — the component says itself (`dependsOnChildren`).
const holdsExactly = (el: Node, nodes: Node[]): boolean => nodes.length > 0 && el.childNodes.length === nodes.length && nodes.every((node, i) => el.childNodes[i] === node);

// Of the nodes wanted, the longest run that already stands in the wanted order
// — given where each stood before (-1: it is new). Those stay where they are
// and the rest are put around them, so a reorder moves as few elements as it
// can: taking an element out of the page, even to put it straight back,
// restarts its animations and drops its scroll.
const standing = (stoodAt: number[]): Set<number> => {
  // ends[k]: the wanted index that ends the best run of length k + 1
  const ends: number[] = [];
  const before: number[] = [];
  stoodAt.forEach((stood, i) => {
    before[i] = -1;
    if (stood < 0) return;
    let lo = 0;
    let hi = ends.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((stoodAt[ends[mid] ?? 0] ?? 0) < stood) lo = mid + 1;
      else hi = mid;
    }
    before[i] = lo > 0 ? (ends[lo - 1] ?? -1) : -1;
    ends[lo] = i;
  });
  const run = new Set<number>();
  let at = ends[ends.length - 1] ?? -1;
  while (at >= 0) {
    run.add(at);
    at = before[at] ?? -1;
  }
  return run;
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
//
// The listeners close over the node they were wired for. That is safe because
// an element is only ever kept for a node that says the same: a different
// `ref`, `model`, or prop builds a new element with new listeners (a bound
// field's `value` aside, which no listener reads).
const wireEvents = (el: HTMLElement, node: ComponentRenderNode, dispatch: Dispatch, field: { stale: boolean }): void => {
  if (node.model !== undefined) {
    const ref = node.model.ref;
    const wait = node.props['debounce'];
    const debounce = typeof wait === 'number' ? wait : 0;
    let pending: { value: unknown; timer: ReturnType<typeof setTimeout> } | undefined;
    const fire = (value: unknown): void => dispatch({ type: 'ui:model', ref, payload: value });
    el.addEventListener('input', (e) => {
      field.stale = true;
      const value = readValue(e.target);
      if (debounce <= 0) {
        fire(value);
        return;
      }
      if (pending !== undefined) clearTimeout(pending.timer);
      const timer = setTimeout(() => {
        pending = undefined;
        fire(value);
      }, debounce);
      pending = { value, timer };
    });
    // Leaving the field sends what was still waiting (ADAPTER.md, obligation 6).
    // Caught on the way down: blur does not bubble, and the field may sit
    // inside the component's element rather than be it.
    el.addEventListener(
      'blur',
      () => {
        if (pending === undefined) return;
        clearTimeout(pending.timer);
        const { value } = pending;
        pending = undefined;
        fire(value);
      },
      true,
    );
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

// The per-instance boundary a served tree carries. A list canvas renders
// several live instances at once, so a click inside THIS boundary must reach
// THIS instance: its events carry it as their origin (the server's
// active-instance fallback only holds for a card-deck canvas). An event that
// already has an origin keeps it — moss's react terminal does the same.
const inInstance = (node: RenderNode, ctx: Ctx): Ctx => {
  if (node.type !== 'component' || node.name !== ACTION_SLOT) return ctx;
  const instanceId = node.props['instanceId'];
  if (typeof instanceId !== 'string' || instanceId === '') return ctx;
  const outer = ctx.dispatch;
  return { ...ctx, dispatch: (event) => outer(event.origin === undefined ? { ...event, origin: instanceId } : event) };
};

// A field a person types in — where what is being typed must not be written
// over. A checkbox or a radio has no "being typed": it is on or off, and the
// tree's answer shows at once.
const isTypedIn = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
  el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type !== 'checkbox' && el.type !== 'radio');

// What such a field holds that is not in the tree: what is being typed, and
// where the caret is.
type Typing = { value: string; start: number | null; end: number | null };

const typingIn = (el: Element | null): Typing | undefined => (isTypedIn(el) ? { value: el.value, start: el.selectionStart, end: el.selectionEnd } : undefined);

const placeCaret = (el: HTMLInputElement | HTMLTextAreaElement, typing: Typing): void => {
  try {
    el.setSelectionRange(typing.start ?? el.value.length, typing.end ?? el.value.length);
  } catch {
    /* selectionRange throws on some input types — harmless */
  }
};

// Where a node sits under `root`, as the child index at each level — and the
// node that sits there. Markup drawn ahead of time and the first render over it
// are the same elements in the same places, so this is how an element of the
// one finds its twin in the other.
const placeUnder = (root: Node, node: Node): number[] | undefined => {
  const place: number[] = [];
  let at: Node = node;
  while (at !== root) {
    const parent = at.parentNode;
    if (parent === null) return undefined;
    const child = at;
    place.unshift([...parent.childNodes].findIndex((sibling) => sibling === child));
    at = parent;
  }
  return place;
};

const nodeUnder = (root: Node, place: number[]): Node | undefined => place.reduce<Node | undefined>((at, index) => at?.childNodes[index], root);

export const createDomView = (
  root: HTMLElement,
  registry: ComponentRegistry<DomComponent>,
  api: DomRenderApi,
  options: { fallback?: DomComponent } = {},
): DomView => {
  // The frame dispatches nothing (chrome); only a CanvasSlot's subtree does.
  const top: Ctx = { registry, dispatch: () => undefined, api, ...(options.fallback !== undefined ? { fallback: options.fallback } : {}) };
  let mounts: Mount[] = [];
  // Whatever is in the root before the first render is not this view's: markup
  // that arrived with the page is replaced by the first render, once.
  let drawn = false;
  // Counts every node built and every write to the page, so a component can
  // tell "nothing below me changed" from "something did".
  let writes = 0;
  // Focus is the element's, so it follows the element: `from` held it when the
  // render began, `to` is what was built in its place if it had to be.
  const refocus: { from: Element | null; to: HTMLElement | undefined } = { from: null, to: undefined };
  // each component element's field state (Mount.field), found from the element
  const fields = new WeakMap<Node, { stale: boolean }>();

  const builderOf = (node: ComponentRenderNode, ctx: Ctx): DomComponent | undefined => ctx.registry.get(node.name)?.component ?? ctx.fallback;

  const leaf = (node: RenderNode, ctx: Ctx, el: Node): Mount => ({ node, ctx, dom: [el], kids: [], host: undefined, cleanups: [], field: { stale: false } });

  // The element is going: whatever its component started stops. Its kids are
  // not touched — they may be living on under the element built in its place.
  const leave = (mount: Mount): void => {
    for (const cleanup of mount.cleanups.splice(0)) cleanup();
  };

  const drop = (mount: Mount): void => {
    leave(mount);
    for (const kid of mount.kids) drop(kid);
  };

  // Ask the component for its element. Children go in as they always have: one
  // Node per child, a fragment child (a loop) as a DocumentFragment. Kids that
  // were on the page already are moved into the new element by the component.
  const assemble = (node: ComponentRenderNode, ctx: Ctx, kids: Mount[], replaced?: Mount): Mount => {
    if (replaced !== undefined) leave(replaced);
    const builder = builderOf(node, ctx);
    if (builder === undefined) {
      for (const kid of kids) drop(kid);
      return leaf(node, ctx, errorEl('COMPONENT_NOT_FOUND', node.name));
    }
    const children = kids.map((kid): Node => {
      const [only] = kid.dom;
      if (kid.node.type !== 'fragment' && only !== undefined) return only;
      const fragment = document.createDocumentFragment();
      fragment.append(...kid.dom);
      return fragment;
    });
    const cleanups: (() => void)[] = [];
    const field = { stale: false };
    let holdsOnly = true;
    writes += 1;
    const el = builder({
      props: node.props,
      children,
      dispatch: ctx.dispatch,
      onRemove: (cleanup) => void cleanups.push(cleanup),
      dependsOnChildren: () => {
        holdsOnly = false;
      },
    });
    el.setAttribute('data-component', node.name);
    if (node.ref !== undefined) el.setAttribute('data-ref', node.ref);
    wireEvents(el, node, ctx.dispatch, field);
    fields.set(el, field);
    if (replaced !== undefined && refocus.from !== null && replaced.dom[0] === refocus.from) refocus.to = el;
    return { node, ctx, dom: [el], kids, host: holdsOnly && holdsExactly(el, flat(kids)) ? el : undefined, cleanups, field };
  };

  const build = (node: RenderNode, parent: Ctx): Mount => {
    const ctx = inInstance(node, parent);
    writes += 1;
    if (node.type === 'text') return leaf(node, ctx, document.createTextNode(node.value));
    if (node.type === 'error') return leaf(node, ctx, errorEl(node.code, node.message));
    if (node.type === 'fragment') {
      const kids = node.children.map((child) => build(child, ctx));
      return { node, ctx, dom: flat(kids), kids, host: undefined, cleanups: [], field: { stale: false } };
    }
    if (node.name === CANVAS_SLOT) {
      const canvasId = canvasIdOf(node);
      const host = document.createElement('div');
      host.setAttribute('data-canvas', canvasId);
      // Switch dispatch to this canvas's; the server stamps origin, so the
      // terminal just tags the canvas.
      const canvasCtx: Ctx = { ...ctx, dispatch: (event) => ctx.api.dispatch(canvasId, event) };
      const kids = canvasId === '' ? [] : ctx.api.canvasTree(canvasId).map((child) => build(child, canvasCtx));
      host.append(...flat(kids));
      return { node, ctx: canvasCtx, dom: [host], kids, host, cleanups: [], field: { stale: false } };
    }
    if (builderOf(node, ctx) === undefined) return leaf(node, ctx, errorEl('COMPONENT_NOT_FOUND', node.name));
    return assemble(node, ctx, node.children.map((child) => build(child, ctx)));
  };

  // Make `host` hold `after` where it held `before`: what left is taken out,
  // what is new is put in, and a node that already stands where it belongs is
  // not touched.
  const place = (host: Node, before: Node[], after: Node[]): void => {
    if (sameNodes(before, after)) return;
    const wanted = new Set(after);
    for (const node of before) {
      if (wanted.has(node) || node.parentNode !== host) continue;
      host.removeChild(node);
      writes += 1;
    }
    const stoodAt = new Map(before.map((node, i) => [node, i]));
    const stays = standing(after.map((node) => stoodAt.get(node) ?? -1));
    let anchor: Node | null = null;
    for (let i = after.length - 1; i >= 0; i -= 1) {
      const node = after[i];
      if (node === undefined) continue;
      if (!stays.has(i)) {
        host.insertBefore(node, anchor);
        writes += 1;
      }
      anchor = node;
    }
  };

  // Siblings are matched by key. A match is patched, a node with no match is
  // built, and what was drawn and has no match any more is let go.
  const reconcile = (olds: Mount[], nexts: readonly RenderNode[], ctx: Ctx): Mount[] => {
    const drawnBy = new Map(keyed(olds, (old) => old.node));
    const kids = keyed(nexts, (next) => next).map(([key, next]) => {
      const old = drawnBy.get(key);
      if (old === undefined) return build(next, ctx);
      drawnBy.delete(key);
      return patch(old, next, ctx);
    });
    for (const gone of drawnBy.values()) drop(gone);
    return kids;
  };

  const patch = (old: Mount, next: RenderNode, parent: Ctx): Mount => {
    const prev = old.node;
    const afresh = (): Mount => {
      drop(old);
      return build(next, parent);
    };
    if (prev.type === 'text' && next.type === 'text') {
      const [node] = old.dom;
      if (prev.value !== next.value && node !== undefined) {
        node.nodeValue = next.value;
        writes += 1;
      }
      old.node = next;
      return old;
    }
    if (prev.type === 'fragment' && next.type === 'fragment') {
      // no element of its own: the host above it puts its nodes in place
      old.kids = reconcile(old.kids, next.children, old.ctx);
      old.dom = flat(old.kids);
      old.node = next;
      return old;
    }
    if (prev.type !== 'component' || next.type !== 'component') return equal(prev, next) ? old : afresh();
    // A different component, or a different canvas or instance in the same
    // place: nothing of the old one is kept. Its listeners dispatch as the old
    // instance; kept, a press would reach an instance that is no longer here.
    if (prev.name !== next.name || !Object.is(slotOf(prev), slotOf(next))) return afresh();

    if (next.name === CANVAS_SLOT) {
      const [host] = old.dom;
      if (host === undefined) return afresh();
      const canvasId = canvasIdOf(next);
      const before = flat(old.kids);
      old.kids = reconcile(old.kids, canvasId === '' ? [] : old.ctx.api.canvasTree(canvasId), old.ctx);
      place(host, before, flat(old.kids));
      old.node = next;
      return old;
    }

    const [el] = old.dom;
    if (el === undefined) return afresh();
    let own = equal(prev.props, next.props) && prev.ref === next.ref && equal(prev.model, next.model);
    if (next.model !== undefined) {
      const active = el.ownerDocument?.activeElement ?? null;
      if (isTypedIn(active) && el.contains(active)) {
        // WHILE A BOUND FIELD IS BEING TYPED IN, what the person is typing wins
        // over the tree (ADAPTER.md, obligation 6) — so a tree that differs only
        // in the field's value is not a reason to build another field. The one
        // being typed in stays, with its caret, its composition and its pending
        // debounce; it is marked as showing something the tree does not say.
        if (!own && prev.ref === next.ref && equal(prev.model, next.model) && equal(withoutValue(prev.props), withoutValue(next.props))) {
          old.field.stale = true;
          own = true;
        }
      } else if (old.field.stale) {
        // Released — or never a field one types in (a checkbox that was
        // pressed): the tree's value is the field's again. How a value is shown
        // is the kit's business, so the kit is asked for the field afresh.
        own = false;
      }
    }

    // what the component was handed, child by child
    const handed = old.kids.map((kid) => kid.dom);
    const before = handed.flat();
    const mark = writes;
    const kids = reconcile(old.kids, next.children, old.ctx);
    const after = flat(kids);
    const kept = (): Mount => {
      old.kids = kids;
      old.node = next;
      return old;
    };
    if (own) {
      if (old.host !== undefined) {
        // Its element holds exactly its children's nodes, so they are put in
        // place there. (Down to none at all is left to the component: it may
        // draw itself differently when empty.)
        if (after.length > 0) {
          place(old.host, before, after);
          return kept();
        }
      } else if (handed.length === kids.length && kids.every((kid, i) => sameNodes(handed[i] ?? [], kid.dom))) {
        // It did something of its own with its children, and it would be handed
        // the same nodes, child for child, so it would draw the same. Whatever
        // changed further down was patched where it stands — which is on the
        // page only if this component put its children on the page.
        if (writes === mark || after.every((node) => el.contains(node))) return kept();
      }
    }
    // Its own props changed, or its children changed where they cannot be
    // reached: ask the component again. What is below was reconciled all the
    // same, so a descendant that did not change is the same node in the new
    // element — moved, not rebuilt.
    return assemble(next, old.ctx, kids, old);
  };

  const render = (): void => {
    const doc = root.ownerDocument;
    const active = doc.activeElement !== null && root.contains(doc.activeElement) ? doc.activeElement : null;
    const typing = typingIn(active);
    // The first render replaces markup that arrived with the page. Somebody may
    // already be in it — in a field, typing — so where they are is noted, to be
    // found again in the elements drawn over it.
    const adopted = !drawn && active !== null ? placeUnder(root, active) : undefined;
    refocus.from = active;
    refocus.to = undefined;
    if (!drawn) root.replaceChildren();
    drawn = true;
    const before = flat(mounts);
    mounts = reconcile(mounts, api.frame(), top);
    place(root, before, flat(mounts));
    const twin = adopted === undefined ? undefined : nodeUnder(root, adopted);
    // An element that stayed where it was still has focus. One that was moved
    // lost it in the move, and one that was built again never had it: give it
    // back — and to a field built again, what was being typed in the one it
    // replaced, because the in-progress value wins over the tree's.
    const rebuilt = refocus.to ?? (twin instanceof HTMLElement && twin.tagName === active?.tagName ? twin : undefined);
    const target = rebuilt ?? (active instanceof HTMLElement && active.isConnected ? active : undefined);
    refocus.from = null;
    refocus.to = undefined;
    if (target === undefined || doc.activeElement === target) return;
    if (rebuilt !== undefined && typing !== undefined && isTypedIn(target)) {
      target.value = typing.value;
      const field = fields.get(target);
      if (field !== undefined) field.stale = true;
    }
    target.focus({ preventScroll: true });
    if (typing !== undefined && isTypedIn(target)) placeCaret(target, typing);
  };

  const destroy = (): void => {
    for (const mount of mounts) drop(mount);
    mounts = [];
    drawn = false;
    root.replaceChildren();
  };

  return { render, destroy };
};

// A SHELL THAT LIVES IN THIS PAGE, drawn into `root` and kept current: the
// shell's own view (`shellView`), this adapter over it, and a render on every
// change — which touches only what that change touched. The whole of a browser
// entry for an app whose shell runs in the browser:
//
//   mountShell(root, registry, await boot());
//
// A `root` that already holds the same screen as markup — drawn ahead of time
// by `renderToString` (./server) from the same boot — is picked up by the first
// render: it replaces those elements with the same elements in one step, so
// nothing can disagree with them. From the second render on, elements stay.
export const mountShell = (
  root: HTMLElement,
  registry: ComponentRegistry<DomComponent>,
  shell: Shell,
  options: { fallback?: DomComponent } = {},
): { destroy: () => void } => {
  const view = shellView(shell);
  const dom = createDomView(root, registry, view.api, options);
  dom.render();
  const stop = view.subscribe(dom.render);
  return {
    destroy: () => {
      stop();
      dom.destroy();
    },
  };
};
