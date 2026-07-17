import type {
  ActionDefinition,
  ActionFragment,
  ActionInstance,
  FetchFn,
  FunctionHandler,
  OnErrorHandler,
  PublicActionRuntime,
  TransformFn,
} from '../action';
import type {
  ComponentRegistry,
  LayoutNode,
  LayoutStore,
  RegistrationInput,
  RenderNode,
} from '../layout';
import type { Unsubscribe } from '../shared/common';
import type { EventBus, NovaEvent } from '../shared/event-bus';
import type { MessageBus } from '../shared/message-bus';
import type { IdFactory } from '../shared/ids';

// ═══════════════════════════════════════════════════════════
// Canvas
// ═══════════════════════════════════════════════════════════

// A seed is either an action id (string) or an { action, input, with } object.
// Used by CanvasConfig.initial to pre-populate the stack on startup. `with` is a
// list of ActionFragment ids to compose the action with before instantiation —
// same as a push/replace effect's `with: [...]`.
export type CanvasInitialSeed =
  | string
  | { action: string; input?: Record<string, unknown>; with?: string[] };

export type CanvasConfig = {
  id: string;
  // Layout describing how this canvas arranges its action instances.
  // Either an inline LayoutNode or a LayoutStore id. When omitted, the
  // canvas renders only the top-of-stack (card-deck) action.
  // Data scope available to resolvables: { instances, active, count }.
  actionLayout?: LayoutNode | string;
  // Pre-populate the canvas stack on shell creation. Either a single seed
  // or an ordered list (pushed left-to-right). Equivalent to calling
  // shell.push(canvasId, ...) after createShell returns.
  initial?: CanvasInitialSeed | CanvasInitialSeed[];
};

export type CanvasState = {
  id: string;
  stack: ActionInstance[];
  active: ActionInstance | undefined;
};

// ═══════════════════════════════════════════════════════════
// Telemetry
// ═══════════════════════════════════════════════════════════

export type StateSnapshot = {
  canvases: Record<string, CanvasState>;
};

export type DataChangeEvent = {
  instanceId: string;
  canvasId: string;
  data: Record<string, unknown>;
};

export type StateChangeHandler = (snapshot: StateSnapshot) => void;
export type DataChangeHandler = (change: DataChangeEvent) => void;
export type CanvasChangeHandler = (state: CanvasState) => void;

// ═══════════════════════════════════════════════════════════
// Shell config + interface
// ═══════════════════════════════════════════════════════════

export type ShellTelemetry = {
  onStateChange?: StateChangeHandler;
  onDataChange?: DataChangeHandler;
};

export type ShellConfig = {
  canvases: CanvasConfig[];
  // Layout describing how the shell arranges its canvases. Either an
  // inline LayoutNode or a LayoutStore id. When omitted, canvases are
  // rendered in a single flex row in declaration order.
  // Data scope available to resolvables: { canvases }.
  canvasLayout?: LayoutNode | string;
  // Optional pre-built registry. When omitted, createShell builds a fresh
  // empty one. `components` (if provided) are merged into whichever registry
  // ends up being used.
  registry?: ComponentRegistry;
  // Convenience: a map of components to register on the shell's registry.
  // Equivalent to calling registry.registerAll(components).
  components?: Record<string, RegistrationInput>;
  // Optional pre-built layout store. When omitted, createShell builds a
  // fresh empty one. Pass explicitly to share fragments across shells.
  layoutStore?: LayoutStore;
  actions: Record<string, ActionDefinition>;
  // Reusable partial actions (ActionFragments), composed into a concrete action
  // at push/replace time via the effect's `with: [...]`. Keyed by fragment id.
  fragments?: Record<string, ActionFragment>;
  transform?: TransformFn;
  fetch?: FetchFn;
  // Handlers for `{ fn: '<name>' }` endpoints. See `EndpointConfigSchema`.
  functions?: Record<string, FunctionHandler>;
  telemetry?: ShellTelemetry;
  strict?: boolean;
  onError?: OnErrorHandler;
  shellIdFn?: IdFactory;
  instanceIdFn?: IdFactory;
  // Optional injection — primarily for tests that need to drive ui:model or
  // other events into the shell. Defaults to fresh per-shell buses.
  eventBus?: EventBus;
  messageBus?: MessageBus;
};

export type Shell = {
  readonly id: string;

  // The component registry and layout store the shell was created with
  // (or the defaults createShell built when the caller didn't provide them).
  // Exposed so adapters (e.g. <Nova.Shell>) can read them without re-threading.
  readonly registry: ComponentRegistry;
  readonly layoutStore: LayoutStore;

  // `fragments` (optional) names ActionFragments to compose the action with
  // before instantiation — same as a push/replace effect's `with: [...]`.
  push: (canvasId: string, actionId: string, input?: Record<string, unknown>, fragments?: string[]) => string;
  pop: (canvasId: string) => void;
  // Pop a canvas down to a given instance (unmount everything above it). A no-op
  // if the instance isn't in the stack. Lets stack-nav chrome (a breadcrumb, a
  // tab) jump straight to an ancestor via `useShell().popTo(...)`.
  popTo: (canvasId: string, instanceId: string) => void;
  replace: (canvasId: string, actionId: string, input?: Record<string, unknown>, fragments?: string[]) => string;
  clear: (canvasId: string) => void;

  // Register an action definition at runtime, so a canvas can push/seed it. The
  // shell starts from createShell's `actions`; this adds (or replaces) one.
  registerAction: (definition: ActionDefinition) => void;

  // Remove a definition and unmount its live instances — revocation
  // semantics: a removed action is gone, not zombie-running. Unknown ids are
  // a no-op; fragments and other definitions' instances are untouched; if a
  // canvas's top instance is removed, the instance beneath resumes.
  removeAction: (actionId: string) => void;

  // Register an ActionFragment at runtime, referenceable from a push/replace
  // `with: [...]`. The shell starts from createShell's `fragments`.
  registerFragment: (fragment: ActionFragment) => void;

  // Mutate the canvas set and the shell's canvasLayout after creation. The shell
  // starts from createShell's `canvases` + `canvasLayout`; these change it live.
  // `addCanvas` appends (and seeds its `initial`); a no-op if the id exists.
  // `removeCanvas` unmounts the canvas's instances and drops it.
  addCanvas: (config: CanvasConfig) => void;
  removeCanvas: (canvasId: string) => void;
  setCanvasLayout: (layout: LayoutNode | string) => void;

  // Swap the target of a LayoutRef in the layout store. The canvasLayout
  // (frame) embeds `{ ref: id }` placeholders for dynamic regions; this
  // replaces what one resolves to and re-renders, leaving the frame/chrome
  // intact. The hot-swap hook for dynamic (e.g. LLM-chosen) region layouts.
  setLayout: (refId: string, layout: LayoutNode) => void;

  getCanvasState: (canvasId: string) => CanvasState;
  getRuntime: (instanceId: string) => PublicActionRuntime | undefined;
  getState: () => StateSnapshot;

  // Render the shell's canvasLayout against a synthetic scope exposing
  // all canvases. Slot components (CanvasSlot) inside the layout recurse
  // into per-canvas rendering.
  getShellRenderTree: () => RenderNode[];

  // Render a canvas's actionLayout against a synthetic scope exposing
  // the canvas's stack + active. Slot components (ActionSlot) inside the
  // layout recurse into per-instance rendering.
  getCanvasRenderTree: (canvasId: string) => RenderNode[];

  // Expand slot markers (CanvasSlot / ActionSlot) in a render tree into
  // their fully resolved content. Used by non-React consumers
  // (evaluators, exporters, tests) that need a materialised tree.
  // React consumers render trees through component boundaries instead.
  flattenRenderTree: (tree: RenderNode[]) => RenderNode[];

  dispatch: (event: NovaEvent) => void;
  publish: (channel: string, payload?: unknown) => void;

  onStateChange: (handler: StateChangeHandler) => Unsubscribe;
  onDataChange: (handler: DataChangeHandler) => Unsubscribe;

  // Subscribe to ONE canvas. Fires with the new CanvasState only when the
  // canvas meaningfully changed: stack length, item ids/statuses, or the
  // active instance. The shell owns this equality — adapters subscribe
  // without encoding what "changed" means.
  onCanvasChange: (canvasId: string, handler: CanvasChangeHandler) => Unsubscribe;

  dispose: () => void;
};
