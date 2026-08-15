import type { ActionDefinition, ActionFragment, ActionInstance, ActionRuntime, EndpointHandler, LanguageOptions, PublicActionRuntime } from '../action';
// Note: ActionRuntime is used as the internal runtime type returned by spawn/registry.
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
import { createLifecycleOps } from './lifecycle-ops';
import { createNavigationHandler } from './navigation';
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

  // WHO PUT THIS HERE. A caller that pushes with an `origin` can ask later
  // whether an instance is still one of its own — the question any server-driven
  // or agent-driven layout must answer before it closes something, and one
  // nobody can answer by inspecting the screen. Dropped with the instance.
  const origins = new Map<string, string>();

  const ops = createLifecycleOps({
    registry,
    telemetry,
    onLifecycleError: handleLifecycleRejection,
    onUnmount: (instanceId) => origins.delete(instanceId),
  });

  const canvases = new Map<string, Canvas>();
  const actionLayouts = new Map<string, LayoutNode | string>();
  // Canvases declared `mode: 'list'` keep EVERY instance live and visible at
  // once (a tray of cards), instead of the default stack where only the top is
  // active and the rest are suspended. Two behaviours follow: push does not
  // suspend the previous top, and removing a card does not resume another.
  const listCanvases = new Set<string>();
  for (const cfg of config.canvases) {
    canvases.set(cfg.id, createCanvas(cfg.id));
    if (cfg.actionLayout !== undefined) actionLayouts.set(cfg.id, cfg.actionLayout);
    if (cfg.mode === 'list') listCanvases.add(cfg.id);
  }

  // Mutable so addCanvas / removeCanvas / setCanvasLayout can change the rendered
  // canvas set and arrangement after creation. Seeded from config; the canvas
  // ids keep declaration order (getShellRenderTree renders them in this order).
  const canvasOrder: string[] = config.canvases.map((cfg) => cfg.id);
  let canvasLayout = config.canvasLayout;

  // Mutable so registerAction can add definitions at runtime (push/seed resolve
  // through this, not config.actions).
  const actions: Record<string, ActionDefinition> = { ...config.actions };

  // ONE CELL FOR THE LANGUAGE, read at every render by everything that renders.
  // Mutable so `setPhrases` reaches instances that are already mounted; the key
  // set and the miss handler are fixed at build, because they describe the
  // application rather than the reader.
  let phrases = config.phrases;

  // WITHDRAWING A BOOK IS THE SOURCE LANGUAGE, NOT SWITCHING i18n OFF — and the
  // difference is not cosmetic. A shell that has stopped doing i18n leaves a
  // counted phrase as the `{ phrase, slots }` object it travels as, and the
  // renderer below has nobody left to close its holes; the object reaches the
  // adapter, which is handed a structure where a word should be and throws.
  //
  // So the question "is this shell language-bearing" is answered ONCE, by
  // whether it was ever given a book or a key set, and `setPhrases(undefined)`
  // cannot un-answer it. Only a shell that never mentioned language at all pays
  // nothing — which is still the common case, and still free.
  let bearing = config.phrases !== undefined || config.phraseKeys !== undefined;
  const SOURCE: Phrasebook = {};

  const language = (): LanguageOptions | undefined => {
    if (!bearing) return undefined;
    return {
      // An empty book translates nothing and still fills patterns, which is
      // exactly what the source language needs.
      phrases: phrases ?? SOURCE,
      ...(config.phraseKeys === undefined ? {} : { phraseKeys: config.phraseKeys }),
      ...(config.onPhraseMiss === undefined ? {} : { onPhraseMiss: config.onPhraseMiss }),
    };
  };

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

  // Remove a definition and unmount its live instances (revocation: a
  // removed action is gone, not zombie-running). Other instances keep their
  // stack positions; when a canvas's top was removed, the new top resumes.
  // Unknown ids are a no-op; fragments are untouched.
  const removeAction = (actionId: string): void => {
    guard();
    if (actions[actionId] === undefined) return;
    delete actions[actionId];
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
    removeInstance: (cid, iid) => removeInstance(cid, iid),
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
    i18n: language,
    instanceIdFn,
    onNavigate: (cid, effect) => navigationHandler(cid, effect),
    // Every endpoint call an action makes flows to telemetry — the shell's one
    // observability surface (state, data, and now endpoints all land here).
    onEndpoint: (event) => telemetry.fireEndpoint(event),
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
    const canvas = getCanvas(canvasId);
    const definition = resolveDefinition(actionId, fragmentIds);
    // A list canvas keeps its existing cards live; only a stack suspends the top.
    if (!listCanvases.has(canvasId)) ops.suspendTop(canvas);
    const runtime = spawn(canvasId, definition, input);
    canvas.pushInstance(runtime.instance);
    if (options?.origin !== undefined) origins.set(runtime.instance.id, options.origin);
    fireState();
    return runtime.instance.id;
  };

  // Remove ONE instance anywhere in a canvas's stack. On a list canvas this is
  // a card dismissing itself (its X fires `removeSelf`); on a stack, removing
  // the top resumes the one beneath, like `pop`. A no-op if the instance is not
  // in the canvas (a stale close can't clear the wrong card).
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
    // Stack canvases resume a newly-exposed top; list canvases never suspended,
    // so there is nothing to resume.
    if (!listCanvases.has(canvasId) && canvas.peek() !== previousTop) ops.resumeTop(canvas);
    fireState();
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

  // Swap the book. Every tree this shell renders from here on wears the new
  // words, including the instances already mounted — they ask for the book at
  // render rather than holding one from spawn, which is the whole reason
  // `i18n` is a function and not a value.
  //
  // A state change, not a rebuild: the words are the only thing that moved, so
  // canvases keep their stacks and instances keep their data. An application
  // whose SERVER-derived text was composed in the old language (a greeting, a
  // seeded label) still needs its own rebuild — this reaches what nova renders,
  // and nova does not know what a host built before handing it over.
  const setPhrases = (next: Phrasebook | undefined): void => {
    guard();
    phrases = next;
    // A host may build first and find its book later. Handing one over is the
    // same declaration as naming one at build.
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

  // The shell's definition of "this canvas changed": stack length, item
  // ids/statuses, or the active instance. Snapshot objects are rebuilt on
  // every state change, so identity can't be used.
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
    originOf: (instanceId) => origins.get(instanceId),
    pop,
    popTo,
    removeInstance,
    replace,
    clear,
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

  // Seed canvases whose config declares an `initial` action (or list). Done
  // after the shell object is assembled so `push` works exactly as it would
  // for a consumer calling push themselves.
  for (const cfg of config.canvases) seedCanvas(cfg);

  return shell;
};
