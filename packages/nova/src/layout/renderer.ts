import { isArray } from '../shared/common';
import {
  ComponentNotFoundError,
  LayoutRefNotFoundError,
  NovaError,
  RenderError,
} from '../shared/errors';
import { createScopeChain, getPath, pushScope, resolve, unwrapSoleTemplate } from '../shared/bindings';
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
import { HEAD_NAMES } from './head';
import type { ComponentNode, LayoutNode } from './schemas';
import type {
  DataStoreView,
  ModelBindingDescriptor,
  RenderContext,
  RenderErrorNode,
  RenderNode,
  RenderOnError,
} from './types';

const noopOnError: RenderOnError = (_error: NovaError): void => {};

type InternalRenderContext = {
  store: RenderContext['store'];
  registry: RenderContext['registry'];
  strict: boolean;
  onError: RenderOnError;
  scopePaths: string[];
  pass: Pass | undefined;
  where: string;
  refsEntered: readonly { ref: string; chain: ScopeChain }[];
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

const resolveDataPath = (
  written: string,
  scopePaths: string[],
): string | undefined => {
  const binding = unwrapSoleTemplate(written);
  if (!binding.startsWith('$')) return undefined;
  const isDotted = binding.startsWith('$.');
  const after = binding.slice(isDotted ? 2 : 1);
  const segments = after.split('.');
  const head = segments[0];
  if (head === undefined || head.length === 0) return isDotted ? after : undefined;
  for (let i = scopePaths.length - 1; i >= 0; i -= 1) {
    const entry = scopePaths[i];
    if (entry === undefined) continue;
    const eq = entry.indexOf('=');
    if (eq < 0) continue;
    const key = entry.slice(0, eq);
    if (key !== head) continue;
    const rooted = entry.slice(eq + 1);
    if (rooted === '') return undefined;
    const rest = segments.slice(1).join('.');
    if (rest.length === 0) return rooted;
    return `${rooted}.${rest}`;
  }
  return isDotted ? after : undefined;
};

const sameEntries = (a: ReadonlyMap<string, unknown>, b: ReadonlyMap<string, unknown>): boolean =>
  a.size === b.size && [...a].every(([key, value]) => b.has(key) && b.get(key) === value);

// A `$.name` reads the innermost scope that has `name`; `$` and `$prism` read the innermost scope itself.
const bindingsOf = (chain: ScopeChain): Map<string, unknown> => new Map([...chain].reverse().flatMap((scope) => Object.entries(scope)));

const readsAlike = (a: ScopeChain, b: ScopeChain): boolean =>
  a === b ||
  (sameEntries(new Map(Object.entries(a[0] ?? {})), new Map(Object.entries(b[0] ?? {}))) && sameEntries(bindingsOf(a), bindingsOf(b)));

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
    // A literal text child is prose. A bound one is data in a text position,
    // and is not offered to the book.
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
    // Entered again where every binding reads as it did last time, a ref renders the same thing again, forever.
    const first = ctx.refsEntered.findIndex((entered) => entered.ref === node.ref && readsAlike(entered.chain, chain));
    if (first >= 0) {
      const path = [...ctx.refsEntered.slice(first).map((entered) => entered.ref), node.ref].join(' → ');
      throw new RenderError(`Layout ref "${node.ref}" comes back to itself: ${path}`, { ref: node.ref });
    }
    return renderNode(target, chain, { ...ctx, refsEntered: [...ctx.refsEntered, { ref: node.ref, chain }] });
  }
  if (isSlotNode(node)) {
    // Slots are filled when fragments merge (`fillSlots`): one that reaches a
    // render was never filled.
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
      const innerChain = pushScope(chain, { [node.as]: item, index, items });
      // `index=` has no path: the loop index is nowhere in the data, so a model on `$.index` binds nothing.
      const nextScopePaths =
        loopBasePath === undefined
          ? ctx.scopePaths
          : [...ctx.scopePaths, 'index=', `${node.as}=${loopBasePath}.${index}`, `items=${loopBasePath}`];
      const innerCtx: InternalRenderContext = { ...ctx, scopePaths: nextScopePaths };
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
  if (!HEAD_NAMES.includes(node.component) && !ctx.registry.has(node.component)) {
    throw new ComponentNotFoundError(
      `Component not found in registry: ${node.component}`,
      { name: node.component },
    );
  }
  // Unlike a text child, a bound prop is translated. The key decides what is
  // prose (`label` is, `name` is not), never the value.
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
      // A field with a `ref` bound through a loop name gets a model ref per row; its own `ref` stays as written.
      const isPerRow = node.ref !== undefined && resolveDataPath(node.model, []) !== resolvedPath;
      const ref = node.ref === undefined ? makeAutoRef(node.component, resolvedPath) : isPerRow ? `${node.ref}@${resolvedPath}` : node.ref;
      model = { path: resolvedPath, ref };
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
  refsEntered: [],
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

export const renderLayoutFromStore = (
  node: LayoutNode,
  store: DataStoreView,
  ctx: RenderContext,
): RenderNode[] => {
  const internal = toInternal(ctx);
  return safeRenderSingle(node, createScopeChain(store.get()), internal, undefined);
};

export type { ScopeChain };
