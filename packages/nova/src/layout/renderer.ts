import { isArray } from '../shared/common';
import {
  ComponentNotFoundError,
  LayoutRefNotFoundError,
  NovaError,
  RenderError,
} from '../shared/errors';
import { createScopeChain, pushScope, resolve } from '../shared/bindings';
import type { ScopeChain } from '../shared/bindings';
import {
  isComponentNode,
  isConditionalNode,
  isLayoutPrimitive,
  isLayoutRefNode,
  isLoopNode,
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
    return [textNode(String(resolved))];
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
      const innerChain = pushScope(chain, { [node.as]: item, index });
      const itemPath = loopBasePath === undefined ? undefined : `${loopBasePath}.${index}`;
      const nextScopePaths =
        itemPath === undefined
          ? ctx.scopePaths
          : [...ctx.scopePaths, `${node.as}=${itemPath}`];
      const innerCtx: InternalRenderContext = { ...ctx, scopePaths: nextScopePaths };
      out.push(...safeRenderSingle(node.do, innerChain, innerCtx, undefined));
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
  const props: Record<string, unknown> = Object.fromEntries(
    Object.entries(node.props ?? {}).map(([k, v]) => [k, resolve(v, chain)]),
  );
  const children = renderChildren(node.children, chain, ctx);

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
};

export const render = (options: RenderOptions): RenderNode[] =>
  renderLayout(options.layout, options.data ?? {}, {
    store: options.store,
    registry: options.registry,
    ...(options.strict === undefined ? {} : { strict: options.strict }),
    ...(options.onError === undefined ? {} : { onError: options.onError }),
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
