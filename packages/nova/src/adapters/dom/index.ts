import { renderNodeKey } from '@layout/adapter';
import type { ComponentRegistry, RenderNode } from '@layout/types';
import type { NovaEvent } from '@shared/event-bus/schemas';
import { headOf, isHeadNode, shellView } from '@shell';
import type { RenderApi, Shell } from '@shell';
import { createHeadKeeper } from '../../document/head-keeper';

export type DomComponentContext = {
  props: Record<string, unknown>;
  children: Node[];
  dispatch: (event: NovaEvent) => void;
  onRemove: (cleanup: () => void) => void;
  dependsOnChildren: () => void;
};

export type DomComponent = (ctx: DomComponentContext) => HTMLElement;

export type DomRenderApi = RenderApi;

export type DomView = {
  render: () => void;
  destroy: () => void;
};

const CANVAS_SLOT = 'CanvasSlot';
const ACTION_SLOT = 'ActionSlot';

type ComponentRenderNode = Extract<RenderNode, { type: 'component' }>;
type Dispatch = (event: NovaEvent) => void;

type Ctx = {
  registry: ComponentRegistry<DomComponent>;
  dispatch: Dispatch;
  api: DomRenderApi;
  fallback?: DomComponent;
};

type Mount = {
  node: RenderNode;
  ctx: Ctx;
  dom: Node[];
  kids: Mount[];
  host: HTMLElement | undefined;
  cleanups: (() => void)[];
  field: { stale: boolean };
};

const errorEl = (code: string, message: string): HTMLElement => {
  const el = document.createElement('div');
  el.setAttribute('data-nova-error', code);
  el.textContent = `${code}: ${message}`;
  return el;
};

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

// Indexed loops on purpose: this runs twice for every component on every
// render, and `flatMap` and `for…of` are both slower here.
const flat = (kids: Mount[]): Node[] => {
  const nodes: Node[] = [];
  for (let i = 0; i < kids.length; i += 1) {
    const dom = kids[i]?.dom ?? [];
    for (let j = 0; j < dom.length; j += 1) {
      const node = dom[j];
      if (node !== undefined) nodes.push(node);
    }
  }
  return nodes;
};

const canvasIdOf = (node: ComponentRenderNode): string => {
  const canvasId = node.props['canvasId'];
  return typeof canvasId === 'string' ? canvasId : '';
};

const slotOf = (node: ComponentRenderNode): unknown => {
  if (node.name === CANVAS_SLOT) return node.props['canvasId'];
  if (node.name === ACTION_SLOT) return node.props['instanceId'];
  return undefined;
};

const keyed = <T>(items: readonly T[], nodeOf: (item: T) => RenderNode): [string, T][] => {
  const seen = new Map<string, number>();
  return items.map((item, i) => {
    const key = renderNodeKey(nodeOf(item), i);
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return [count === 0 ? key : `${key}#${count}`, item];
  });
};

// Whether core's `renderNodeKey` would give the two the same key at one index, without building it.
const samePlace = (a: RenderNode, b: RenderNode): boolean => {
  if (a.key !== undefined || b.key !== undefined) return a.key === b.key;
  if (a.type === 'component' && b.type === 'component') return a.ref !== undefined || b.ref !== undefined ? a.ref === b.ref : a.name === b.name;
  if (a.type === 'error' && b.type === 'error') return a.code === b.code;
  return a.type === b.type;
};

const gathered = (nodes: Node[]): DocumentFragment => {
  const fragment = document.createDocumentFragment();
  for (const node of nodes) fragment.appendChild(node);
  return fragment;
};

// Children are patched in place only when the element holds exactly the nodes
// it was handed, in order. Anything else and the component is asked again: a kit
// that wraps each child looks, with one child, like one that wraps them all.
const holdsExactly = (el: Node, nodes: Node[]): boolean => nodes.length > 0 && el.childNodes.length === nodes.length && nodes.every((node, i) => el.childNodes[i] === node);

// The longest run of nodes that already stand in the wanted order, given where
// each stood before (-1: new). Those stay put: taking an element off the page,
// even to put it straight back, restarts its animations and drops its scroll.
const standing = (stoodAt: number[]): Set<number> => {
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

const readValue = (target: EventTarget | null): unknown => {
  if (target instanceof HTMLInputElement && target.type === 'checkbox') return target.checked;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return target.value;
  return '';
};

// The listeners close over `node`: an element is only kept for a node with the
// same `ref`, `model` and props, a bound field's `value` aside, which none reads.
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
    // Captured: blur does not bubble, and the field may sit inside the component's element.
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

// A list canvas shows several live instances at once, so an event inside an
// ActionSlot carries that instance as its origin: the server's active-instance
// fallback is right only for a card-deck canvas.
const inInstance = (node: RenderNode, ctx: Ctx): Ctx => {
  if (node.type !== 'component' || node.name !== ACTION_SLOT) return ctx;
  const instanceId = node.props['instanceId'];
  if (typeof instanceId !== 'string' || instanceId === '') return ctx;
  const outer = ctx.dispatch;
  return { ...ctx, dispatch: (event) => outer(event.origin === undefined ? { ...event, origin: instanceId } : event) };
};

const isTypedIn = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
  el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type !== 'checkbox' && el.type !== 'radio');

type Typing = { value: string; start: number | null; end: number | null };

const typingIn = (el: Element | null): Typing | undefined => (isTypedIn(el) ? { value: el.value, start: el.selectionStart, end: el.selectionEnd } : undefined);

const placeCaret = (el: HTMLInputElement | HTMLTextAreaElement, typing: Typing): void => {
  try {
    el.setSelectionRange(typing.start ?? el.value.length, typing.end ?? el.value.length);
  } catch {
    /* setSelectionRange throws on input types that have no selection (email, number) */
  }
};

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
  const top: Ctx = { registry, dispatch: () => undefined, api, ...(options.fallback !== undefined ? { fallback: options.fallback } : {}) };
  let mounts: Mount[] = [];
  let drawn = false;
  let writes = 0;
  const refocus: { from: Element | null; to: HTMLElement | undefined } = { from: null, to: undefined };
  const fields = new WeakMap<Node, { stale: boolean }>();

  const builderOf = (node: ComponentRenderNode, ctx: Ctx): DomComponent | undefined => ctx.registry.get(node.name)?.component ?? ctx.fallback;

  const leaf = (node: RenderNode, ctx: Ctx, el: Node): Mount => ({ node, ctx, dom: [el], kids: [], host: undefined, cleanups: [], field: { stale: false } });

  // Only its own cleanups: its kids may live on under the element built in its place.
  const leave = (mount: Mount): void => {
    if (mount.cleanups.length === 0) return;
    for (const cleanup of mount.cleanups.splice(0)) cleanup();
  };

  const drop = (mount: Mount): void => {
    leave(mount);
    for (const kid of mount.kids) drop(kid);
  };

  const assemble = (node: ComponentRenderNode, ctx: Ctx, kids: Mount[], replaced?: Mount): Mount => {
    if (replaced !== undefined) leave(replaced);
    const builder = builderOf(node, ctx);
    if (builder === undefined) {
      for (const kid of kids) drop(kid);
      return leaf(node, ctx, errorEl('COMPONENT_NOT_FOUND', node.name));
    }
    const children = kids.filter((kid) => !isHeadNode(kid.node)).map((kid): Node => {
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
    if (node.model !== undefined) fields.set(el, field);
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
      const canvasCtx: Ctx = { ...ctx, dispatch: (event) => ctx.api.dispatch(canvasId, event) };
      const kids = canvasId === '' ? [] : ctx.api.canvasTree(canvasId).map((child) => build(child, canvasCtx));
      host.append(...flat(kids));
      return { node, ctx: canvasCtx, dom: [host], kids, host, cleanups: [], field: { stale: false } };
    }
    if (isHeadNode(node)) return { node, ctx, dom: [], kids: [], host: undefined, cleanups: [], field: { stale: false } };
    if (builderOf(node, ctx) === undefined) return leaf(node, ctx, errorEl('COMPONENT_NOT_FOUND', node.name));
    return assemble(node, ctx, node.children.map((child) => build(child, ctx)));
  };

  const place = (host: HTMLElement, before: Node[], after: Node[]): void => {
    if (sameNodes(before, after)) return;
    const wanted = new Set(after);
    if (host.childNodes.length === before.length && !before.some((node) => wanted.has(node))) {
      host.replaceChildren(gathered(after));
      writes += 1;
      return;
    }
    for (const node of before) {
      if (wanted.has(node) || node.parentNode !== host) continue;
      host.removeChild(node);
      writes += 1;
    }
    const stoodAt = new Map(before.map((node, i) => [node, i]));
    const stays = standing(after.map((node) => stoodAt.get(node) ?? -1));
    let anchor: Node | null = null;
    let run: Node[] = [];
    const putIn = (): void => {
      const [only] = run;
      if (only === undefined) return;
      host.insertBefore(run.length === 1 ? only : gathered(run.reverse()), anchor);
      writes += 1;
      run = [];
    };
    for (let i = after.length - 1; i >= 0; i -= 1) {
      const node = after[i];
      if (node === undefined) continue;
      if (stays.has(i)) {
        putIn();
        anchor = node;
      } else run.push(node);
    }
    putIn();
  };

  const reconcile = (olds: Mount[], nexts: readonly RenderNode[], ctx: Ctx): Mount[] => {
    if (olds.length === nexts.length && olds.every((old, i) => samePlace(old.node, nexts[i] ?? old.node))) {
      return olds.map((old, i) => patch(old, nexts[i] ?? old.node, ctx));
    }
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
      // No element of its own: the host above it puts its nodes in place.
      old.kids = reconcile(old.kids, next.children, old.ctx);
      old.dom = flat(old.kids);
      old.node = next;
      return old;
    }
    if (prev.type !== 'component' || next.type !== 'component') return equal(prev, next) ? old : afresh();
    // A different component, canvas or instance in the same place keeps nothing
    // of the old one: its listeners would go on dispatching as the old instance.
    if (prev.name !== next.name || !Object.is(slotOf(prev), slotOf(next))) return afresh();

    if (isHeadNode(next)) {
      old.node = next;
      return old;
    }

    if (next.name === CANVAS_SLOT) {
      const host = old.host;
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
        // While a bound field is being typed in, the typing wins: a tree that differs only in
        // the field's value keeps the field, with its caret, composition and pending debounce.
        if (!own && prev.ref === next.ref && equal(prev.model, next.model) && equal(withoutValue(prev.props), withoutValue(next.props))) {
          old.field.stale = true;
          own = true;
        }
      } else if (old.field.stale) {
        // No longer typed in, or a checkbox that was pressed: the tree's value
        // is the field's again. How a value is shown is the kit's business, so
        // the kit is asked for the field afresh.
        own = false;
      }
    }

    const handed = old.host === undefined ? old.kids.map((kid) => kid.dom) : undefined;
    const before = flat(old.kids);
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
        // Down to none is left to the component: it may draw itself differently when empty.
        if (after.length > 0) {
          place(old.host, before, after);
          return kept();
        }
      } else if (handed !== undefined && handed.length === kids.length && kids.every((kid, i) => sameNodes(handed[i] ?? [], kid.dom))) {
        // It would be handed the same nodes, so it would draw the same. What
        // changed further down was patched where it stands, which is on the
        // page only if this component put its children on the page.
        if (writes === mark || after.every((node) => el.contains(node))) return kept();
      }
    }
    return assemble(next, old.ctx, kids, old);
  };

  const render = (): void => {
    const doc = root.ownerDocument;
    const active = doc.activeElement !== null && root.contains(doc.activeElement) ? doc.activeElement : null;
    const typing = typingIn(active);
    // The first render replaces markup that arrived with the page. Somebody may
    // already be typing in it, so where they are is noted.
    const adopted = !drawn && active !== null ? placeUnder(root, active) : undefined;
    refocus.from = active;
    refocus.to = undefined;
    if (!drawn) root.replaceChildren();
    drawn = true;
    const before = flat(mounts);
    mounts = reconcile(mounts, api.frame(), top);
    place(root, before, flat(mounts));
    const twin = adopted === undefined ? undefined : nodeUnder(root, adopted);
    // An element that was moved lost focus in the move, and one built again never had it.
    // A field built again also gets what was being typed in the one it replaced.
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

export const mountShell = (
  root: HTMLElement,
  registry: ComponentRegistry<DomComponent>,
  shell: Shell,
  options: { fallback?: DomComponent } = {},
): { destroy: () => void } => {
  const view = shellView(shell);
  // One reading of the shell per render: the head is read off the trees the view just drew.
  let read: { frame?: RenderNode[]; trees: Map<string, RenderNode[]> } = { trees: new Map() };
  const api: DomRenderApi = {
    ...view.api,
    frame: () => (read.frame ??= view.api.frame()),
    canvasTree: (canvasId) => {
      const held = read.trees.get(canvasId);
      if (held !== undefined) return held;
      const tree = view.api.canvasTree(canvasId);
      read.trees.set(canvasId, tree);
      return tree;
    },
  };
  const dom = createDomView(root, registry, api, options);
  const keepHead = createHeadKeeper(root.ownerDocument);
  const render = (): void => {
    read = { trees: new Map() };
    dom.render();
    if (root.isConnected) keepHead(headOf(api)?.elements);
  };
  render();
  const stop = view.subscribe(render);
  return {
    destroy: () => {
      stop();
      dom.destroy();
    },
  };
};
