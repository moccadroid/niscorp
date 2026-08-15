import { isArray } from '../shared/common';
import {
  ComponentNotFoundError,
  LayoutRefNotFoundError,
  NovaError,
  RenderError,
} from '../shared/errors';
import { createScopeChain, getPath, pushScope, resolve } from '../shared/bindings';
import type { ScopeChain } from '../shared/bindings';
import { isBinding } from '../i18n/phrases';
import { passFor, swap, walkValue } from '../i18n/swap';
import type { Pass } from '../i18n/swap';
import {
  isComponentNode,
  isConditionalNode,
  isLayoutPrimitive,
  isLayoutRefNode,
  isLoopNode,
  isSlotNode,
} from './guards';
import type { ComponentNode, LayoutNode } from './schemas';
import type {
  DataStoreView,
  ModelBindingDescriptor,
  RenderContext,
  RenderErrorNode,
  RenderNode,
  RenderOnError,
} from './types';

// ═══════════════════════════════════════════════════════════
// Renderer — converts a LayoutNode tree into a framework-agnostic
// RenderNode[] tree. Renders children in try/catch boundaries so a
// single broken subtree does not poison siblings, unless strict mode
// is enabled. All errors flow through the ctx.onError telemetry hook.
// ═══════════════════════════════════════════════════════════

const noopOnError: RenderOnError = (_error: NovaError): void => {
  // default — errors silently dropped if no handler provided
};

type InternalRenderContext = {
  store: RenderContext['store'];
  registry: RenderContext['registry'];
  strict: boolean;
  onError: RenderOnError;
  scopePaths: string[];
  // Undefined when the host named no book and no keys — the whole language
  // apparatus is then absent rather than idling, and a `{ phrase, slots }`
  // object passes through as the object it is.
  pass: Pass | undefined;
  // Where a miss was found, coarse: the chain of component names above it.
  // Only maintained while a pass is active, since nothing else reads it.
  where: string;
};

const textNode = (value: string): RenderNode => ({ type: 'text', value });

const fragment = (children: RenderNode[]): RenderNode => ({ type: 'fragment', children });

const errorNode = (
  error: NovaError,
  nodeRef: string | undefined,
): RenderErrorNode => ({
  type: 'error',
  code: error.code,
  message: error.message,
  ...(nodeRef === undefined ? {} : { nodeRef }),
});

const toRenderError = (err: unknown): NovaError => {
  if (err instanceof NovaError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new RenderError(message, {}, { cause: err });
};

// Resolve a `$.x.y` or `$loopVar.y` binding to an absolute data path
// (used to construct stable model binding descriptors inside loops).
const resolveDataPath = (
  binding: string,
  scopePaths: string[],
): string | undefined => {
  if (!binding.startsWith('$')) return undefined;
  const after = binding.slice(1);
  if (after.startsWith('.')) return after.slice(1);
  const segments = after.split('.');
  const head = segments[0];
  if (head === undefined || head.length === 0) return undefined;
  for (let i = scopePaths.length - 1; i >= 0; i -= 1) {
    const entry = scopePaths[i];
    if (entry === undefined) continue;
    const eq = entry.indexOf('=');
    if (eq < 0) continue;
    const key = entry.slice(0, eq);
    if (key !== head) continue;
    const rooted = entry.slice(eq + 1);
    const rest = segments.slice(1).join('.');
    if (rest.length === 0) return rooted;
    return `${rooted}.${rest}`;
  }
  return undefined;
};

const makeAutoRef = (componentName: string, path: string): string =>
  `auto-${componentName}-${path}`;

const renderNode = (
  node: LayoutNode,
  chain: ScopeChain,
  ctx: InternalRenderContext,
): RenderNode[] => {
  if (node === null) return [textNode('')];
  if (typeof node === 'string') {
    const resolved = resolve(node, chain);
    if (resolved === undefined || resolved === null) return [textNode('')];
    const value = String(resolved);
    // A LITERAL text child is prose; a BOUND one is data wearing a text
    // position, and offering it to the book is how a member called "Pass" gets
    // renamed. Nothing but the renderer can tell those apart — by the time a
    // tree exists both are the same plain string — which is why this rule
    // could not be written in `translateRenderTree` and can be written here.
    if (ctx.pass === undefined || !ctx.pass.text || isBinding(node)) return [textNode(value)];
    return [textNode(swap(value, `${ctx.where}#text`, ctx.pass))];
  }
  if (isLayoutPrimitive(node)) {
    return [textNode(String(node))];
  }
  if (isArray(node)) {
    const children = renderChildArray(node, chain, ctx);
    return [fragment(children)];
  }
  if (isLayoutRefNode(node)) {
    const target = ctx.store.get(node.ref);
    if (target === undefined) {
      throw new LayoutRefNotFoundError(`Layout ref not found: ${node.ref}`, { ref: node.ref });
    }
    return renderNode(target, chain, ctx);
  }
  if (isSlotNode(node)) {
    // A slot is filled at fragment-merge time (fillSlots). One that survives to
    // render was never filled — render nothing.
    return [];
  }
  if (isConditionalNode(node)) {
    const condition = resolve(node.if, chain);
    const truthy =
      condition !== undefined &&
      condition !== null &&
      condition !== false &&
      condition !== 0 &&
      condition !== '';
    const branchTruthy = isArray(condition) ? condition.length > 0 : truthy;
    if (branchTruthy) return renderNode(node.then, chain, ctx);
    if (node.else !== undefined) return renderNode(node.else, chain, ctx);
    return [];
  }
  if (isLoopNode(node)) {
    const items = resolve(node.for, chain);
    if (!isArray(items)) return [];
    const loopBasePath = typeof node.for === 'string'
      ? resolveDataPath(node.for, ctx.scopePaths)
      : undefined;
    const out: RenderNode[] = [];
    items.forEach((item, index) => {
      // Each iteration binds three reserved loop vars: the element (`$<as>`),
      // its position (`$index`), and the array itself (`$items`). `$items`
      // lets a control inside the loop edit the whole list — remove or reorder
      // an element — not just its own value. Both `index` and `items` are
      // reserved names; an `as` of `'index'` or `'items'` would shadow them.
      const innerChain = pushScope(chain, { [node.as]: item, index, items });
      // `$items` resolves to a *writable* path (so `model: "$items"` works) only
      // when the loop's source is itself a resolvable path; a literal-array loop
      // exposes the value but stays read-only, exactly as `$<as>` does.
      const nextScopePaths =
        loopBasePath === undefined
          ? ctx.scopePaths
          : [...ctx.scopePaths, `${node.as}=${loopBasePath}.${index}`, `items=${loopBasePath}`];
      const innerCtx: InternalRenderContext = { ...ctx, scopePaths: nextScopePaths };
      // Stamp a stable React-identity key on each item's output: the value at
      // `node.key` (e.g. the row id), or the index when no key path is given.
      // This is what lets looped rows share a `ref` (the trigger target) without
      // colliding as React keys. `withKey` (in render-tree) prefers it over ref.
      const idKey = node.key !== undefined ? getPath(item, node.key) : index;
      const rendered = safeRenderSingle(node.do, innerChain, innerCtx, undefined);
      rendered.forEach((rn, sub) => {
        out.push({ ...rn, key: rendered.length === 1 ? String(idKey) : `${String(idKey)}:${sub}` });
      });
    });
    return [fragment(out)];
  }
  if (isComponentNode(node)) {
    return [renderComponent(node, chain, ctx)];
  }
  return [];
};

const renderComponent = (
  node: ComponentNode,
  chain: ScopeChain,
  ctx: InternalRenderContext,
): RenderNode => {
  if (!ctx.registry.has(node.component)) {
    throw new ComponentNotFoundError(
      `Component not found in registry: ${node.component}`,
      { name: node.component },
    );
  }
  // THE ONE PLACE A PROP BECOMES A WORD ON A SCREEN. The swap belongs here
  // rather than in a later walk over the finished tree: the value is already
  // in hand, so translating it costs one lookup instead of a second traversal
  // of everything that was just built.
  //
  // Unlike a text child, a BOUND prop is translated — that is the whole
  // `_display` mechanism, where a query manufactures a closed-set word and a
  // read puts it on the screen. What protects data here is the KEY: `label` is
  // prose, `name` is not, and no value ever votes on the question.
  const pass = ctx.pass;
  const at = pass === undefined ? '' : `${ctx.where}/${node.component}`;
  const props: Record<string, unknown> = Object.fromEntries(
    Object.entries(node.props ?? {}).map(([k, v]) => {
      const resolved = resolve(v, chain);
      if (pass === undefined) return [k, resolved];
      return [k, walkValue(resolved, pass.isProse(k), `${at}.${k}`, pass)];
    }),
  );
  const children = renderChildren(node.children, chain, pass === undefined ? ctx : { ...ctx, where: at });

  let model: ModelBindingDescriptor | undefined;
  if (node.model !== undefined) {
    const resolvedPath = resolveDataPath(node.model, ctx.scopePaths);
    if (resolvedPath !== undefined) {
      const ref = node.ref ?? makeAutoRef(node.component, resolvedPath);
      model = { path: resolvedPath, ref };
      // Two-way binding: if the component doesn't already have an explicit
      // `value` prop, auto-derive it from the model expression so the
      // displayed value tracks the data store. Without this, controlled
      // inputs always show their initial value because nothing updates the
      // `value` prop on re-render.
      if (!('value' in props)) {
        props['value'] = resolve(node.model, chain);
      }
    }
  }

  const component: RenderNode = {
    type: 'component',
    name: node.component,
    props,
    children,
    ...(node.ref === undefined ? {} : { ref: node.ref }),
    ...(model === undefined ? {} : { model }),
  };
  return component;
};

const safeRenderSingle = (
  node: LayoutNode,
  chain: ScopeChain,
  ctx: InternalRenderContext,
  nodeRef: string | undefined,
): RenderNode[] => {
  try {
    return renderNode(node, chain, ctx);
  } catch (err) {
    const novaError = toRenderError(err);
    if (ctx.strict) throw novaError;
    ctx.onError(novaError);
    return [errorNode(novaError, nodeRef)];
  }
};

const renderChildArray = (
  nodes: LayoutNode[],
  chain: ScopeChain,
  ctx: InternalRenderContext,
): RenderNode[] => {
  const out: RenderNode[] = [];
  for (const child of nodes) out.push(...safeRenderSingle(child, chain, ctx, undefined));
  return out;
};

const renderChildren = (
  children: LayoutNode | LayoutNode[] | undefined,
  chain: ScopeChain,
  ctx: InternalRenderContext,
): RenderNode[] => {
  if (children === undefined) return [];
  if (isArray(children)) return renderChildArray(children, chain, ctx);
  return safeRenderSingle(children, chain, ctx, undefined);
};

const toInternal = (ctx: RenderContext): InternalRenderContext => ({
  store: ctx.store,
  registry: ctx.registry,
  strict: ctx.strict ?? false,
  onError: ctx.onError ?? noopOnError,
  scopePaths: [],
  // Built once per render call. The matcher compiles a Set and a suffix list,
  // and doing that per node would make the cheapest branch the expensive one.
  pass: passFor({
    ...(ctx.phrases === undefined ? {} : { phrases: ctx.phrases }),
    ...(ctx.phraseKeys === undefined ? {} : { keys: ctx.phraseKeys }),
    ...(ctx.onPhraseMiss === undefined ? {} : { onMiss: ctx.onPhraseMiss }),
  }),
  where: '',
});

export const renderLayout = (
  node: LayoutNode,
  data: Record<string, unknown>,
  ctx: RenderContext,
): RenderNode[] => {
  const internal = toInternal(ctx);
  return safeRenderSingle(node, createScopeChain(data), internal, undefined);
};

// Object-form alias for renderLayout. Same semantics, named parameters —
// so the caller doesn't have to remember the positional order of
// (layout, data, ctx) and so `data` can be omitted when the layout has
// no resolvables.
export type RenderOptions = {
  layout: LayoutNode;
  data?: Record<string, unknown>;
  store: RenderContext['store'];
  registry: RenderContext['registry'];
  strict?: boolean;
  onError?: RenderOnError;
  phrases?: RenderContext['phrases'];
  phraseKeys?: RenderContext['phraseKeys'];
  onPhraseMiss?: RenderContext['onPhraseMiss'];
};

export const render = (options: RenderOptions): RenderNode[] =>
  renderLayout(options.layout, options.data ?? {}, {
    store: options.store,
    registry: options.registry,
    ...(options.strict === undefined ? {} : { strict: options.strict }),
    ...(options.onError === undefined ? {} : { onError: options.onError }),
    ...(options.phrases === undefined ? {} : { phrases: options.phrases }),
    ...(options.phraseKeys === undefined ? {} : { phraseKeys: options.phraseKeys }),
    ...(options.onPhraseMiss === undefined ? {} : { onPhraseMiss: options.onPhraseMiss }),
  });

// Render a layout reading its root data from a DataStore view. Used by the
// action runtime so layout and action share a single data store instance.
export const renderLayoutFromStore = (
  node: LayoutNode,
  store: DataStoreView,
  ctx: RenderContext,
): RenderNode[] => {
  const internal = toInternal(ctx);
  return safeRenderSingle(node, createScopeChain(store.get()), internal, undefined);
};

export type { ScopeChain };
