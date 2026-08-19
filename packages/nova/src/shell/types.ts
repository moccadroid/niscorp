import type {
  ActionDefinition,
  ActionFragment,
  ActionInstance,
  EndpointHandler,
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
import type { PhraseKeys, Phrasebook } from '../i18n/phrases';
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
  // How the canvas treats its stack. 'stack' (default) is a card deck: only the
  // top instance is active, the rest are suspended, and the default render shows
  // the top alone. 'list' is a tray: every instance stays LIVE and the canvas
  // renders them all (author an `actionLayout` that loops `instances`) — pushing
  // adds a card without suspending the others, and a card can dismiss itself with
  // a `{ removeSelf: true }` effect. push/pop/popTo behave the same; only the
  // suspend-and-render-top default changes.
  mode?: 'stack' | 'list';
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

// The tail of `push`, named rather than positional: the head (canvas, action,
// input, fragments) is the operation and reads well in order; anything else is
// metadata about the call, and a fifth positional argument would only invite
// `push(c, a, input, undefined, x)`.
export type PushOptions = {
  // Who is placing this. A caller that names one can ask `originOf` later
  // whether an instance is still its own — the question any server-driven or
  // agent-driven layout must answer before it closes something.
  origin?: string;
  // Is this push a PLACE somebody can come back from? Default true. Pass false
  // for a push that furnishes the shell rather than moves through it — a host
  // seeding the landing screen after build, say — so `back` cannot undo the
  // floor and leave a canvas empty.
  history?: boolean;
};

export type CanvasState = {
  id: string;
  stack: ActionInstance[];
  active: ActionInstance | undefined;
};

// ═══════════════════════════════════════════════════════════
// Render surface — the pull+sink contract a REMOTE renderer paints
// against. Core owns it so every adapter (dom, react, a TUI) and every
// transport (moss's socket wire, an in-process shell bridge) speaks one
// shape: read the frame and per-canvas trees, send events tagged by canvas,
// publish channel messages. A renderer never touches a shell or a socket
// directly — it is handed one of these. (The local, shell-backed path uses
// the shell subscriptions in ADAPTER.md §3; this is its remote twin.)
// ═══════════════════════════════════════════════════════════

export type RenderApi = {
  // the frame: the canvas ARRANGEMENT — a tree whose CanvasSlot markers
  // resolve against the per-canvas trees
  frame: () => RenderNode[];
  // the current render tree for one canvas ([] when nothing is mounted)
  canvasTree: (canvasId: string) => RenderNode[];
  // an event from inside a canvas, tagged with the canvas it came from —
  // origin stamping is the host's job, not the renderer's
  dispatch: (canvasId: string, event: NovaEvent) => void;
  publish: (channel: string, payload?: unknown) => void;
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
  onEndpoint?: EndpointHandler;
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
  // How many navigations `back` can walk. Default DEFAULT_HISTORY_DEPTH; `0`
  // switches the journal off entirely and makes `back` a no-op.
  historyDepth?: number;
  // Optional injection — primarily for tests that need to drive ui:model or
  // other events into the shell. Defaults to fresh per-shell buses.
  eventBus?: EventBus;
  messageBus?: MessageBus;
  // THE WORDS EVERY TREE THIS SHELL RENDERS WEARS.
  //
  // Handed to the renderer, which is where a language enters — so no canvas, no
  // action, no component and no adapter below this line learns that a second
  // language exists. `setPhrases` replaces the book live.
  //
  // Both absent = not doing i18n, and free. `phraseKeys` alone is the SOURCE
  // language: nothing is translated, but counted phrases (`{ phrase, slots }`)
  // are still filled, which no consumer downstream knows how to do.
  phrases?: Phrasebook;
  phraseKeys?: PhraseKeys;
  onPhraseMiss?: (phrase: string, where: string) => void;
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
  push: (canvasId: string, actionId: string, input?: Record<string, unknown>, fragments?: string[], options?: PushOptions) => string;
  // What `origin` the instance was pushed with, if any. Undefined for anything
  // a person opened, anything seeded at build, and any push that named none.
  originOf: (instanceId: string) => string | undefined;
  pop: (canvasId: string) => void;
  // Pop a canvas down to a given instance (unmount everything above it). A no-op
  // if the instance isn't in the stack. Lets stack-nav chrome (a breadcrumb, a
  // tab) jump straight to an ancestor via `useShell().popTo(...)`.
  popTo: (canvasId: string, instanceId: string) => void;
  // Remove ONE instance anywhere in a canvas's stack (not just the top). On a
  // list canvas this is a card closing itself; on a stack, removing the top
  // resumes the one beneath. A no-op if the instance isn't in the canvas.
  removeInstance: (canvasId: string, instanceId: string) => void;
  replace: (canvasId: string, actionId: string, input?: Record<string, unknown>, fragments?: string[]) => string;
  clear: (canvasId: string) => void;

  // UNDO THE LAST NAVIGATION — the whole shell's, not one canvas's. Walks the
  // journal (see ./journal) newest-first and restores the first position that
  // is not already on screen; `false` when there was nothing left to undo,
  // which is the answer a landing screen gives.
  //
  // An instance the recorded position still names is KEPT, with everything it
  // holds. One that is gone comes back derived from the action and input that
  // made it — back re-opens a screen, it does not resurrect a half-filled form
  // somebody replaced their way out of. Nothing here can walk below the shell
  // as it was built: a seeded canvas is the floor, never an entry.
  back: () => boolean;

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

  // Replace the book every subsequent render reads — a language switch, or a
  // per-tenant vocabulary landing after the shell was built. Reaches the
  // screens already open, because a runtime asks for the book at render rather
  // than holding one from spawn. Passing undefined returns the shell to the
  // source language. Fires a state change so mounted adapters re-render.
  setPhrases: (phrases: Phrasebook | undefined) => void;

  // The book in force. Symmetric with `setPhrases`, and needed by anyone
  // OVERLAYING rather than replacing — a studio that calls its members
  // "athletes" is the same mechanism as a language, spread over the words the
  // deployment already had, and it cannot spread over a book it cannot read.
  getPhrases: () => Phrasebook | undefined;

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

  // Materialise a render tree: CanvasSlot markers resolve away into their
  // canvas trees; the ActionSlot marker SURVIVES as a component node with
  // identity props ({ instanceId, canvasId, definitionId }, key: instanceId)
  // and the instance's rendered tree as children — a served tree keeps
  // instance identity so a remote renderer can key by instance and a
  // terminal-side slot wrapper has a seam. Used by non-React consumers
  // (moss, evaluators, exporters, tests); React consumers render trees
  // through component boundaries instead.
  flattenRenderTree: (tree: RenderNode[]) => RenderNode[];

  dispatch: (event: NovaEvent) => void;
  publish: (channel: string, payload?: unknown) => void;

  onStateChange: (handler: StateChangeHandler) => Unsubscribe;
  onDataChange: (handler: DataChangeHandler) => Unsubscribe;

  // Subscribe to every endpoint call the shell's actions make — `fn:` and HTTP
  // alike — with its outcome (ok/status) and duration. The observability seam
  // devtools' timeline reads.
  onEndpoint: (handler: EndpointHandler) => Unsubscribe;

  // Subscribe to ONE canvas. Fires with the new CanvasState only when the
  // canvas meaningfully changed: stack length, item ids/statuses, or the
  // active instance. The shell owns this equality — adapters subscribe
  // without encoding what "changed" means.
  onCanvasChange: (canvasId: string, handler: CanvasChangeHandler) => Unsubscribe;

  dispose: () => void;
};
