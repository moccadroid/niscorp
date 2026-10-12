import type { ActionDefinition, ActionFragment, ActionInstance, ActionRuntime, EndpointHandler, LanguageOptions, PublicActionRuntime } from '../action';
import { composeAction } from '../action';
import { createScopeChain, resolve } from '../shared/bindings';
import type { LayoutNode, RenderNode } from '../layout';
import type { Phrasebook } from '../i18n/phrases';
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
import { reconcileCanvas } from './reconcile';
import { createJournal, DEFAULT_HISTORY_DEPTH } from './journal';
import type { HistoryEntry, HistoryFrame } from './journal';
import { createLifecycleOps } from './lifecycle-ops';
import { createChainCount, rememberChainCount } from './chains';
import { createNavigationHandler, navigatedChannel } from './navigation';
import type { NavigatedMessage } from './navigation';
import { createRuntimeRegistry } from './runtime-registry';
import { createRuntimeFactory, snapshotCanvas, validateActions, validateFragments } from './shell-internals';
import { createTelemetry } from './telemetry';
import type {
  CanvasChangeHandler,
  CanvasConfig,
  CanvasState,
  DataChangeHandler,
  PushOptions,
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

  const componentRegistry = config.registry ?? createComponentRegistry();
  if (config.components !== undefined) componentRegistry.registerAll(config.components);
  const layoutStore = config.layoutStore ?? createLayoutStore();

  // Lifecycle hooks run detached, so a strict failure cannot reach the call
  // that started them: the next shell call throws it.
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

  const origins = new Map<string, string>();

  const births = new Map<string, { action: string; input?: Record<string, unknown>; with?: string[] }>();

  const journal = createJournal(config.historyDepth ?? DEFAULT_HISTORY_DEPTH);

  const chains = createChainCount();

  const ops = createLifecycleOps({
    registry,
    telemetry,
    onLifecycleError: handleLifecycleRejection,
    onChain: chains.hold,
    onUnmount: (instanceId) => {
      origins.delete(instanceId);
      births.delete(instanceId);
    },
  });

  const canvases = new Map<string, Canvas>();
  const actionLayouts = new Map<string, LayoutNode | string>();
  const listCanvases = new Set<string>();
  for (const cfg of config.canvases) {
    canvases.set(cfg.id, createCanvas(cfg.id));
    if (cfg.actionLayout !== undefined) actionLayouts.set(cfg.id, cfg.actionLayout);
    if (cfg.mode === 'list') listCanvases.add(cfg.id);
  }

  const canvasOrder: string[] = config.canvases.map((cfg) => cfg.id);
  let canvasLayout = config.canvasLayout;

  const actions: Record<string, ActionDefinition> = { ...config.actions };

  let phrases = config.phrases;

  // Never unset: once a shell was given a book or a key set,
  // `setPhrases(undefined)` is the source language, not no i18n. Rendered with
  // no book at all, a counted phrase would reach the adapter as its
  // `{ phrase, slots }` object.
  let bearing = config.phrases !== undefined || config.phraseKeys !== undefined;
  const SOURCE: Phrasebook = {};

  const language = (): LanguageOptions | undefined => {
    if (!bearing) return undefined;
    return {
      phrases: phrases ?? SOURCE,
      ...(config.phraseKeys === undefined ? {} : { phraseKeys: config.phraseKeys }),
      ...(config.onPhraseMiss === undefined ? {} : { onPhraseMiss: config.onPhraseMiss }),
    };
  };

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

  const removeAction = (actionId: string): void => {
    guard();
    if (actions[actionId] === undefined) return;
    delete actions[actionId];
    journal.forgetAction(actionId);
    let changed = false;
    for (const [, canvas] of canvases) {
      if (!canvas.stack.some((inst) => inst.definitionId === actionId)) continue;
      const previousTop = canvas.peek();
      for (const inst of canvas.clearStack()) {
        if (inst.definitionId === actionId) ops.unmountInstance(inst.id);
        else canvas.pushInstance(inst);
      }
      if (canvas.peek() !== previousTop) ops.resumeTop(canvas);
      changed = true;
    }
    if (changed) fireState();
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

  const resolveDefinition = (actionId: string, fragmentIds?: string[]): ActionDefinition => {
    const def = getDefinition(actionId);
    if (fragmentIds === undefined || fragmentIds.length === 0) return def;
    return composeAction(def, fragmentIds.map(getFragment));
  };

  const announced = new Map<string, string | undefined>();
  let announcing = false;

  // Deferred: a listener woken mid-mutation would run steps against a
  // half-moved shell. Coalesced: a burst (a resetTo is a clear and a push)
  // announces where the canvas ended, once.
  const announceNavigation = (): void => {
    if (announcing || disposed) return;
    announcing = true;
    queueMicrotask(() => {
      announcing = false;
      if (disposed) return;
      for (const [canvasId, canvas] of canvases) {
        const active = canvas.peek();
        if (announced.get(canvasId) === active?.id) continue;
        announced.set(canvasId, active?.id);
        const message: NavigatedMessage =
          active === undefined
            ? { canvas: canvasId }
            : { canvas: canvasId, action: active.definitionId, instance: active.id };
        messageBus.publish(navigatedChannel(canvasId), message);
      }
    });
  };

  const fireState = (): void => {
    if (disposed) return;
    const out: Record<string, CanvasState> = {};
    for (const [cid, c] of canvases) out[cid] = snapshotCanvas(c);
    const snapshot: StateSnapshot = { canvases: out };
    telemetry.fireStateChange(snapshot);
    announceNavigation();
  };

  // Taken before the navigation that displaces it: recorded afterwards, it is
  // the position already on screen.
  const positionOf = (canvasId: string): readonly HistoryFrame[] => {
    const canvas = canvases.get(canvasId);
    if (canvas === undefined) return [];
    return canvas.stack.map((inst) => {
      const birth = births.get(inst.id);
      return {
        instance: inst.id,
        action: birth?.action ?? inst.definitionId,
        ...(birth?.input === undefined ? {} : { input: birth.input }),
        ...(birth?.with === undefined ? {} : { with: birth.with }),
      };
    });
  };

  const record = (canvasId: string): void => journal.record(canvasId, positionOf(canvasId));

  const navigationHandler = createNavigationHandler({
    push: (cid, aid, input, frags) => push(cid, aid, input, frags),
    pop: (cid) => pop(cid),
    replace: (cid, aid, input, frags) => replace(cid, aid, input, frags),
    clear: (cid) => clear(cid),
    resetTo: (cid, aid, input, frags) => {
      record(cid);
      journal.mute(() => {
        clear(cid);
        push(cid, aid, input, frags);
      });
    },
    popTo: (cid, iid) => popTo(cid, iid),
    removeInstance: (cid, iid) => removeInstance(cid, iid),
    reconcile: (cid, desired, options) => {
      const before = positionOf(cid);
      const known = desired
        .filter((entry) => actions[entry.actionId] !== undefined)
        .map((entry) => (options.with === undefined ? entry : { ...entry, with: options.with }));
      const result = journal.mute(() =>
        reconcileCanvas(shell, cid, known, {
          origin: options.origin,
          ...(options.own === undefined ? {} : { own: options.own }),
          definitionOf: (actionId) => actions[actionId],
        }),
      );
      if (result.changed) journal.record(cid, before);
    },
  });

  const buildRuntime = createRuntimeFactory({
    eventBus,
    messageBus,
    layoutStore,
    registry: componentRegistry,
    ...(config.transform === undefined ? {} : { transform: config.transform }),
    ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
    ...(config.functions === undefined ? {} : { functions: config.functions }),
    ...(config.endpointTimeoutMs === undefined ? {} : { endpointTimeoutMs: config.endpointTimeoutMs }),
    strict,
    ...(config.onError === undefined ? {} : { onError: config.onError }),
    i18n: language,
    instanceIdFn,
    onNavigate: (cid, effect) => navigationHandler(cid, effect),
    onEndpoint: (event) => telemetry.fireEndpoint(event),
    onChain: chains.hold,
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
    options?: PushOptions,
  ): string => {
    guard();
    if (options?.history !== false) record(canvasId);
    const canvas = getCanvas(canvasId);
    const definition = resolveDefinition(actionId, fragmentIds);
    if (!listCanvases.has(canvasId)) ops.suspendTop(canvas);
    const runtime = spawn(canvasId, definition, input);
    canvas.pushInstance(runtime.instance);
    births.set(runtime.instance.id, {
      action: actionId,
      ...(input === undefined ? {} : { input }),
      ...(fragmentIds === undefined ? {} : { with: fragmentIds }),
    });
    if (options?.origin !== undefined) origins.set(runtime.instance.id, options.origin);
    fireState();
    return runtime.instance.id;
  };

  const removeInstance = (canvasId: string, instanceId: string): void => {
    if (disposed) return;
    guardNoPendingStrictError();
    const canvas = canvases.get(canvasId);
    if (canvas === undefined) return;
    if (!canvas.stack.some((i) => i.id === instanceId)) return;
    const previousTop = canvas.peek();
    for (const inst of canvas.clearStack()) {
      if (inst.id === instanceId) ops.unmountInstance(inst.id);
      else canvas.pushInstance(inst);
    }
    journal.consume(canvasId);
    if (!listCanvases.has(canvasId) && canvas.peek() !== previousTop) ops.resumeTop(canvas);
    fireState();
  };

  const pop = (canvasId: string): void => {
    if (disposed) return;
    guardNoPendingStrictError();
    const canvas = canvases.get(canvasId);
    if (canvas === undefined) return;
    const top = canvas.popInstance();
    if (top === undefined) return;
    ops.unmountInstance(top.id);
    journal.consume(canvasId);
    ops.resumeTop(canvas);
    fireState();
  };

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
      journal.consume(canvasId);
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
    record(canvasId);
    const canvas = getCanvas(canvasId);
    const definition = resolveDefinition(actionId, fragmentIds);
    const old = canvas.popInstance();
    if (old !== undefined) ops.unmountInstance(old.id);
    const runtime = spawn(canvasId, definition, input);
    canvas.pushInstance(runtime.instance);
    births.set(runtime.instance.id, {
      action: actionId,
      ...(input === undefined ? {} : { input }),
      ...(fragmentIds === undefined ? {} : { with: fragmentIds }),
    });
    fireState();
    return runtime.instance.id;
  };

  const clear = (canvasId: string): void => {
    if (disposed) return;
    guardNoPendingStrictError();
    const canvas = canvases.get(canvasId);
    if (canvas === undefined) return;
    // Recorded, not consumed as a pop is: emptying a canvas is a move `back`
    // puts back.
    if (canvas.stack.length > 0) record(canvasId);
    for (const inst of canvas.clearStack()) ops.unmountInstance(inst.id);
    fireState();
  };

  const restore = (entry: HistoryEntry): boolean => {
    const canvas = canvases.get(entry.canvas);
    if (canvas === undefined) return false;

    // Matched by instance id alone: two instances of one action with equal
    // input are not interchangeable (a half-filled form).
    let common = 0;
    while (
      common < canvas.stack.length &&
      common < entry.stack.length &&
      canvas.stack[common]?.id === entry.stack[common]?.instance
    ) {
      common += 1;
    }
    if (common === canvas.stack.length && common === entry.stack.length) return false;

    // Checked before anything moves: a position half put back is a screen
    // nobody authored.
    for (let i = common; i < entry.stack.length; i += 1) {
      const frame = entry.stack[i];
      if (frame !== undefined && actions[frame.action] === undefined) return false;
    }

    journal.mute(() => {
      const standing = canvas.clearStack();
      for (let i = 0; i < standing.length; i += 1) {
        const inst = standing[i];
        if (inst === undefined) continue;
        if (i < common) canvas.pushInstance(inst);
        else ops.unmountInstance(inst.id);
      }
      if (common === entry.stack.length) {
        if (!listCanvases.has(entry.canvas)) ops.resumeTop(canvas);
        return;
      }
      for (let i = common; i < entry.stack.length; i += 1) {
        const frame = entry.stack[i];
        if (frame === undefined) continue;
        push(entry.canvas, frame.action, frame.input, frame.with);
      }
    });
    fireState();
    return true;
  };

  const back = (): boolean => {
    if (disposed) return false;
    guardNoPendingStrictError();
    for (;;) {
      const entry = journal.take();
      if (entry === undefined) return false;
      if (restore(entry)) return true;
    }
  };

  const seedCanvas = (cfg: CanvasConfig): void => {
    if (cfg.initial === undefined) return;
    const seeds = Array.isArray(cfg.initial) ? cfg.initial : [cfg.initial];
    // Muted: a seed is the floor. Recorded, it would let `back` empty the landing screen.
    journal.mute(() => {
      for (const seed of seeds) {
        if (typeof seed === 'string') push(cfg.id, seed);
        else push(cfg.id, seed.action, seed.input, seed.with);
      }
    });
  };

  const addCanvas = (cfg: CanvasConfig): void => {
    guard();
    if (canvases.has(cfg.id)) return;
    canvases.set(cfg.id, createCanvas(cfg.id));
    if (cfg.actionLayout !== undefined) actionLayouts.set(cfg.id, cfg.actionLayout);
    if (cfg.mode === 'list') listCanvases.add(cfg.id);
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
    journal.forgetCanvas(canvasId);
    announced.delete(canvasId);
    actionLayouts.delete(canvasId);
    listCanvases.delete(canvasId);
    const index = canvasOrder.indexOf(canvasId);
    if (index >= 0) canvasOrder.splice(index, 1);
    fireState();
  };

  const setCanvasLayout = (layout: LayoutNode | string): void => {
    guard();
    canvasLayout = layout;
    fireState();
  };

  const setLayout = (refId: string, layout: LayoutNode): void => {
    guard();
    layoutStore.set(refId, layout);
    fireState();
  };

  const setPhrases = (next: Phrasebook | undefined): void => {
    guard();
    phrases = next;
    if (next !== undefined) bearing = true;
    fireState();
  };

  const getPhrases = (): Phrasebook | undefined => phrases;

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
  const onEndpoint = (h: EndpointHandler): Unsubscribe => telemetry.onEndpoint(h);

  const sameCanvasState = (a: CanvasState, b: CanvasState): boolean => {
    if (a.stack.length !== b.stack.length) return false;
    if (a.active?.id !== b.active?.id) return false;
    for (let i = 0; i < a.stack.length; i += 1) {
      const aItem = a.stack[i];
      const bItem = b.stack[i];
      if (aItem === undefined || bItem === undefined) return false;
      if (aItem.id !== bItem.id || aItem.status !== bItem.status) return false;
    }
    return true;
  };

  const onCanvasChange = (canvasId: string, handler: CanvasChangeHandler): Unsubscribe => {
    let prev = getCanvasState(canvasId);
    return telemetry.onStateChange(() => {
      const next = getCanvasState(canvasId);
      if (sameCanvasState(prev, next)) return;
      prev = next;
      handler(next);
    });
  };

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
    const current = language();
    return renderLayoutFromStore(
      resolved,
      { get: () => data },
      {
        store: layoutStore,
        registry: componentRegistry,
        strict,
        ...(config.onError === undefined ? {} : { onError: config.onError }),
        ...(current?.phrases === undefined ? {} : { phrases: current.phrases }),
        ...(current?.phraseKeys === undefined ? {} : { phraseKeys: current.phraseKeys }),
        ...(current?.onPhraseMiss === undefined ? {} : { onPhraseMiss: current.onPhraseMiss }),
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
    originOf: (instanceId) => origins.get(instanceId),
    pop,
    popTo,
    removeInstance,
    replace,
    clear,
    back,
    registerAction,
    removeAction,
    registerFragment,
    addCanvas,
    removeCanvas,
    setCanvasLayout,
    setPhrases,
    getPhrases,
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
    onEndpoint,
    onCanvasChange,
    dispose,
  };
  rememberShellRegistry(shell, registry);
  rememberChainCount(shell, chains);

  for (const cfg of config.canvases) seedCanvas(cfg);

  return shell;
};
