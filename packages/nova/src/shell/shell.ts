import type { ActionDefinition, ActionFragment, ActionInstance, ActionRuntime, PublicActionRuntime } from '../action';
// Note: ActionRuntime is used as the internal runtime type returned by spawn/registry.
import { composeAction } from '../action';
import { createScopeChain, resolve } from '../shared/bindings';
import type { LayoutNode, RenderNode } from '../layout';
import { createComponentRegistry, createLayoutStore, renderLayoutFromStore } from '../layout';
import { createEventBus } from '../shared/event-bus';
import { createMessageBus } from '../shared/message-bus';
import type { Unsubscribe } from '../shared/common';
import {
  LifecycleError,
  NovaError,
  ShellDisposedError,
  UnknownActionError,
  UnknownFragmentError,
} from '../shared/errors';
import { createIdFactory } from '../shared/ids';
import { rememberShellRegistry } from './shell-internals';
import { createCanvas, type Canvas } from './canvas';
import { DEFAULT_ACTION_LAYOUT, DEFAULT_SHELL_LAYOUT } from './default-layouts';
import { flattenRenderTree } from './flatten-render-tree';
import { createLifecycleOps } from './lifecycle-ops';
import { createNavigationHandler } from './navigation';
import { createRuntimeRegistry } from './runtime-registry';
import { createRuntimeFactory, snapshotCanvas, validateActions, validateFragments } from './shell-internals';
import { createTelemetry } from './telemetry';
import type {
  CanvasConfig,
  CanvasState,
  DataChangeHandler,
  Shell,
  ShellConfig,
  StateChangeHandler,
  StateSnapshot,
} from './types';

const defaultShellIdFactory = createIdFactory('shell');

export const createShell = (config: ShellConfig): Shell => {
  validateActions(config.actions);

  const id = (config.shellIdFn ?? defaultShellIdFactory)();
  const instanceIdFn = config.instanceIdFn ?? createIdFactory('act');
  const strict = config.strict ?? false;
  const eventBus = config.eventBus ?? createEventBus();
  const messageBus = config.messageBus ?? createMessageBus();
  const registry = createRuntimeRegistry();
  const telemetry = createTelemetry(config.telemetry);

  // Resolve component registry + layout store: use caller-provided ones when
  // present, otherwise fabricate empty defaults. `components` (if provided) is
  // merged into whichever registry we end up using.
  const componentRegistry = config.registry ?? createComponentRegistry();
  if (config.components !== undefined) componentRegistry.registerAll(config.components);
  const layoutStore = config.layoutStore ?? createLayoutStore();

  // In strict mode, the next public shell call rethrows this error.
  // Lifecycle hooks are async fire-and-forget, so failures cannot
  // propagate synchronously to the original push/pop caller; instead
  // we surface them at the boundary of the next operation.
  let pendingStrictError: LifecycleError | undefined;

  const toLifecycleError = (err: unknown): LifecycleError => {
    if (err instanceof LifecycleError) return err;
    const message = err instanceof Error ? err.message : String(err);
    return new LifecycleError(message, {}, { cause: err });
  };

  const handleLifecycleRejection = (err: unknown): void => {
    const lifecycleErr = toLifecycleError(err);
    if (strict && pendingStrictError === undefined) {
      pendingStrictError = lifecycleErr;
    }
    if (config.onError === undefined) return;
    if (err instanceof NovaError) {
      config.onError(err);
      return;
    }
    config.onError(lifecycleErr);
  };

  const ops = createLifecycleOps({
    registry,
    telemetry,
    onLifecycleError: handleLifecycleRejection,
  });

  const canvases = new Map<string, Canvas>();
  const actionLayouts = new Map<string, LayoutNode | string>();
  for (const cfg of config.canvases) {
    canvases.set(cfg.id, createCanvas(cfg.id));
    if (cfg.actionLayout !== undefined) actionLayouts.set(cfg.id, cfg.actionLayout);
  }

  // Mutable so addCanvas / removeCanvas / setCanvasLayout can change the rendered
  // canvas set and arrangement after creation. Seeded from config; the canvas
  // ids keep declaration order (getShellRenderTree renders them in this order).
  const canvasOrder: string[] = config.canvases.map((cfg) => cfg.id);
  let canvasLayout = config.canvasLayout;

  // Mutable so registerAction can add definitions at runtime (push/seed resolve
  // through this, not config.actions).
  const actions: Record<string, ActionDefinition> = { ...config.actions };

  // Reusable partial actions, composed into a concrete action at push/replace
  // time via the effect's `with: [...]`. Abstract — never instantiated alone.
  const fragments: Record<string, ActionFragment> = { ...(config.fragments ?? {}) };

  let disposed = false;

  const guardNotDisposed = (): void => {
    if (disposed) throw new ShellDisposedError('Shell disposed');
  };

  const guardNoPendingStrictError = (): void => {
    if (pendingStrictError === undefined) return;
    const err = pendingStrictError;
    pendingStrictError = undefined;
    throw err;
  };

  const guard = (): void => {
    guardNotDisposed();
    guardNoPendingStrictError();
  };

  const getCanvas = (canvasId: string): Canvas => {
    const existing = canvases.get(canvasId);
    if (existing !== undefined) return existing;
    const created = createCanvas(canvasId);
    canvases.set(canvasId, created);
    return created;
  };

  const getDefinition = (actionId: string): ActionDefinition => {
    const def = actions[actionId];
    if (def === undefined) throw new UnknownActionError(`Unknown action: ${actionId}`, { actionId });
    return def;
  };

  const registerAction = (definition: ActionDefinition): void => {
    guard();
    validateActions({ [definition.id]: definition });
    actions[definition.id] = definition;
  };

  const getFragment = (fragmentId: string): ActionFragment => {
    const frag = fragments[fragmentId];
    if (frag === undefined) throw new UnknownFragmentError(`Unknown fragment: ${fragmentId}`, { fragmentId });
    return frag;
  };

  const registerFragment = (fragment: ActionFragment): void => {
    guard();
    if (fragment.id === undefined) throw new UnknownFragmentError('Fragment is missing an id', { fragmentId: '' });
    validateFragments({ [fragment.id]: fragment });
    fragments[fragment.id] = fragment;
  };

  // Resolve an action id to its (optionally fragment-composed) definition. The
  // effect's `with: [...]` names fragments to merge in; the action wins on
  // conflict. See composeAction.
  const resolveDefinition = (actionId: string, fragmentIds?: string[]): ActionDefinition => {
    const def = getDefinition(actionId);
    if (fragmentIds === undefined || fragmentIds.length === 0) return def;
    return composeAction(def, fragmentIds.map(getFragment));
  };

  const fireState = (): void => {
    if (disposed) return;
    const out: Record<string, CanvasState> = {};
    for (const [cid, c] of canvases) out[cid] = snapshotCanvas(c);
    const snapshot: StateSnapshot = { canvases: out };
    telemetry.fireStateChange(snapshot);
  };

  const navigationHandler = createNavigationHandler({
    push: (cid, aid, input, frags) => push(cid, aid, input, frags),
    pop: (cid) => pop(cid),
    replace: (cid, aid, input, frags) => replace(cid, aid, input, frags),
    clear: (cid) => clear(cid),
    popTo: (cid, iid) => popTo(cid, iid),
  });

  const buildRuntime = createRuntimeFactory({
    eventBus,
    messageBus,
    layoutStore,
    registry: componentRegistry,
    ...(config.transform === undefined ? {} : { transform: config.transform }),
    ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
    ...(config.functions === undefined ? {} : { functions: config.functions }),
    strict,
    ...(config.onError === undefined ? {} : { onError: config.onError }),
    instanceIdFn,
    onNavigate: (cid, effect) => navigationHandler(cid, effect),
  });

  const spawn = (
    canvasId: string,
    definition: ActionDefinition,
    input: Record<string, unknown> | undefined,
  ): ActionRuntime => {
    const runtime = buildRuntime(canvasId, definition, input);
    const instId = runtime.instance.id;
    registry.register(runtime, (data) => {
      if (disposed) return;
      telemetry.fireDataChange({ instanceId: instId, canvasId: runtime.instance.canvasId, data });
    });
    runtime.mount(input).catch(handleLifecycleRejection);
    return runtime;
  };

  const push = (
    canvasId: string,
    actionId: string,
    input?: Record<string, unknown>,
    fragmentIds?: string[],
  ): string => {
    guard();
    const canvas = getCanvas(canvasId);
    const definition = resolveDefinition(actionId, fragmentIds);
    ops.suspendTop(canvas);
    const runtime = spawn(canvasId, definition, input);
    canvas.pushInstance(runtime.instance);
    fireState();
    return runtime.instance.id;
  };

  const pop = (canvasId: string): void => {
    if (disposed) return;
    guardNoPendingStrictError();
    const canvas = canvases.get(canvasId);
    if (canvas === undefined) return;
    const top = canvas.popInstance();
    if (top !== undefined) ops.unmountInstance(top.id);
    ops.resumeTop(canvas);
    fireState();
  };

  // Pop a canvas down to a given instance — unmount everything above it, then
  // resume the target once. A no-op if the instance isn't in this canvas's stack
  // (so a stale breadcrumb can't clear the canvas). Powers the breadcrumb jump.
  const popTo = (canvasId: string, instanceId: string): void => {
    if (disposed) return;
    guardNoPendingStrictError();
    const canvas = canvases.get(canvasId);
    if (canvas === undefined) return;
    if (!snapshotCanvas(canvas).stack.some((i) => i.id === instanceId)) return;
    let changed = false;
    for (;;) {
      const active = snapshotCanvas(canvas).active;
      if (active === undefined || active.id === instanceId) break;
      const top = canvas.popInstance();
      if (top === undefined) break;
      ops.unmountInstance(top.id);
      changed = true;
    }
    if (changed) {
      ops.resumeTop(canvas);
      fireState();
    }
  };

  const replace = (
    canvasId: string,
    actionId: string,
    input?: Record<string, unknown>,
    fragmentIds?: string[],
  ): string => {
    guard();
    const canvas = getCanvas(canvasId);
    const definition = resolveDefinition(actionId, fragmentIds);
    const old = canvas.popInstance();
    if (old !== undefined) ops.unmountInstance(old.id);
    const runtime = spawn(canvasId, definition, input);
    canvas.pushInstance(runtime.instance);
    fireState();
    return runtime.instance.id;
  };

  const clear = (canvasId: string): void => {
    if (disposed) return;
    guardNoPendingStrictError();
    const canvas = canvases.get(canvasId);
    if (canvas === undefined) return;
    for (const inst of canvas.clearStack()) ops.unmountInstance(inst.id);
    fireState();
  };

  // Push a canvas's `initial` action(s), if any. Shared by createShell's seeding
  // loop and addCanvas, so both seed identically.
  const seedCanvas = (cfg: CanvasConfig): void => {
    if (cfg.initial === undefined) return;
    const seeds = Array.isArray(cfg.initial) ? cfg.initial : [cfg.initial];
    for (const seed of seeds) {
      if (typeof seed === 'string') push(cfg.id, seed);
      else push(cfg.id, seed.action, seed.input, seed.with);
    }
  };

  const addCanvas = (cfg: CanvasConfig): void => {
    guard();
    if (canvases.has(cfg.id)) return;
    canvases.set(cfg.id, createCanvas(cfg.id));
    if (cfg.actionLayout !== undefined) actionLayouts.set(cfg.id, cfg.actionLayout);
    canvasOrder.push(cfg.id);
    seedCanvas(cfg);
    fireState();
  };

  const removeCanvas = (canvasId: string): void => {
    if (disposed) return;
    guardNoPendingStrictError();
    const canvas = canvases.get(canvasId);
    if (canvas === undefined) return;
    for (const inst of canvas.clearStack()) ops.unmountInstance(inst.id);
    canvases.delete(canvasId);
    actionLayouts.delete(canvasId);
    const index = canvasOrder.indexOf(canvasId);
    if (index >= 0) canvasOrder.splice(index, 1);
    fireState();
  };

  const setCanvasLayout = (layout: LayoutNode | string): void => {
    guard();
    canvasLayout = layout;
    fireState();
  };

  // Swap the target of a LayoutRef. The frame (canvasLayout) embeds
  // `{ ref: id }` placeholders for dynamic regions; this replaces what one
  // resolves to and re-renders. The frame/chrome itself is never touched, so
  // a swap can't remove the sidebar/topbar — they live in the frame, not the
  // ref. This is the hook an LLM/agent uses to hot-swap a region's layout.
  const setLayout = (refId: string, layout: LayoutNode): void => {
    guard();
    layoutStore.set(refId, layout);
    fireState();
  };

  const getCanvasState = (canvasId: string): CanvasState => {
    guardNoPendingStrictError();
    const canvas = canvases.get(canvasId);
    if (canvas === undefined) return { id: canvasId, stack: [], active: undefined };
    return snapshotCanvas(canvas);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const [, canvas] of canvases) {
      for (const inst of canvas.clearStack()) ops.unmountInstance(inst.id);
    }
    registry.disposeAll();
    canvases.clear();
    telemetry.clear();
  };

  const getRuntime = (iid: string): PublicActionRuntime | undefined => registry.get(iid);
  const onStateChange = (h: StateChangeHandler): Unsubscribe => telemetry.onStateChange(h);
  const onDataChange = (h: DataChangeHandler): Unsubscribe => telemetry.onDataChange(h);

  const getState = (): StateSnapshot => {
    const out: Record<string, CanvasState> = {};
    for (const [cid, c] of canvases) out[cid] = snapshotCanvas(c);
    return { canvases: out };
  };

  const renderLayoutOrRef = (
    layout: LayoutNode | string,
    data: Record<string, unknown>,
  ): RenderNode[] => {
    const resolved = typeof layout === 'string' ? layoutStore.get(layout) : layout;
    if (resolved === undefined) return [];
    return renderLayoutFromStore(
      resolved,
      { get: () => data },
      {
        store: layoutStore,
        registry: componentRegistry,
        strict,
        ...(config.onError === undefined ? {} : { onError: config.onError }),
      },
    );
  };

  const getShellRenderTree = (): RenderNode[] => {
    const canvasList: CanvasState[] = [];
    for (const cid of canvasOrder) {
      const c = canvases.get(cid);
      canvasList.push(c === undefined ? { id: cid, stack: [], active: undefined } : snapshotCanvas(c));
    }
    return renderLayoutOrRef(canvasLayout ?? DEFAULT_SHELL_LAYOUT, { canvases: canvasList });
  };

  // An instance's display label: the (composed) definition's `title` resolvable
  // evaluated against the instance's own live data, falling back to `name` then
  // the action id. Surfaced as `instance.title` on the actionLayout scope so
  // stack-nav chrome (crumbs, tabs) can label without reaching into raw data.
  const titleOf = (instance: ActionInstance): string => {
    const def = registry.get(instance.id)?.definition ?? actions[instance.definitionId];
    if (def?.title !== undefined) {
      const resolved = resolve(def.title, createScopeChain(instance.data));
      if (resolved !== undefined && resolved !== null && resolved !== '') return String(resolved);
    }
    return def?.name ?? instance.definitionId;
  };

  const getCanvasRenderTree = (canvasId: string): RenderNode[] => {
    const canvas = canvases.get(canvasId);
    const state: CanvasState =
      canvas === undefined ? { id: canvasId, stack: [], active: undefined } : snapshotCanvas(canvas);
    const instances = state.stack.map((i) => ({ ...i, title: titleOf(i) }));
    const scope = {
      instances,
      active: instances.length === 0 ? undefined : instances[instances.length - 1],
      count: instances.length,
    };
    return renderLayoutOrRef(actionLayouts.get(canvasId) ?? DEFAULT_ACTION_LAYOUT, scope);
  };

  const dispatch = (event: Parameters<typeof eventBus.emit>[0]): void => {
    eventBus.emit(event);
  };

  const publish = (channel: string, payload?: unknown): void => {
    messageBus.publish(channel, payload);
  };

  const shell: Shell = {
    id,
    registry: componentRegistry,
    layoutStore,
    push,
    pop,
    popTo,
    replace,
    clear,
    registerAction,
    registerFragment,
    addCanvas,
    removeCanvas,
    setCanvasLayout,
    setLayout,
    getCanvasState,
    getRuntime,
    getState,
    getShellRenderTree,
    getCanvasRenderTree,
    flattenRenderTree: (tree) => flattenRenderTree(tree, shell),
    dispatch,
    publish,
    onStateChange,
    onDataChange,
    dispose,
  };
  rememberShellRegistry(shell, registry);

  // Seed canvases whose config declares an `initial` action (or list). Done
  // after the shell object is assembled so `push` works exactly as it would
  // for a consumer calling push themselves.
  for (const cfg of config.canvases) seedCanvas(cfg);

  return shell;
};
