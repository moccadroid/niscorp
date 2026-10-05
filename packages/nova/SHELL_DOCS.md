# Shell — Author Guide

How to wire nova together. The shell is the top-level orchestrator: it owns canvases, mounts and unmounts action instances, drives navigation, routes events and messages, and exposes the runtime tree to consumers.

If layouts are the "what" and actions are the "behavior," the shell is the "where and when." This guide is for **using** the shell. For the architecture see `DESIGN.md`.

---

## A first shell

```ts
import { createShell, createComponentRegistry, createLayoutStore } from '@niscorp/nova';
import { registerNovaReactComponents } from '@niscorp/nova/adapters/react/components';
import { menuAction, settingsAction, profileAction } from './actions';

const registry = createComponentRegistry();
registerNovaReactComponents(registry);
const layoutStore = createLayoutStore();

const shell = createShell({
  canvases: [{ id: 'main' }],
  registry,
  layoutStore,
  actions: {
    menu: menuAction,
    settings: settingsAction,
    profile: profileAction,
  },
  onError: (err) => console.error(err),
});

shell.push('main', 'menu');
```

`shell.push` mounts an action instance on a canvas. The shell drives the lifecycle from there. To render the result via React, see `REACT_DOCS.md`.

---

## What's in `ShellConfig`

```ts
type ShellConfig = {
  // Required
  canvases: CanvasConfig[];              // the canvases the shell hosts (see below)
  actions: Record<string, ActionDefinition>;  // every action the shell knows about

  // Layout of the shell itself
  canvasLayout?: LayoutNode | string;    // how the shell arranges its canvases; when omitted,
                                         // canvases render in a single flex row in declaration order

  // Registry / layouts (both built fresh when omitted)
  registry?: ComponentRegistry;          // shared component registry for all actions
  components?: Record<string, RegistrationInput>;  // convenience: registerAll'd onto the registry
  layoutStore?: LayoutStore;             // shared layout store for all actions

  // Fragments
  fragments?: Record<string, ActionFragment>;  // partial actions composed via a push/replace `with: [...]`

  // Optional integrations
  fetch?: FetchFn;                       // fetch implementation for endpoint calls
  transform?: TransformFn;               // evaluator for endpoint `request`/`response` configs (Prism etc.)
  functions?: Record<string, FunctionHandler>;  // handlers for `{ fn: '<name>' }` endpoints
  endpointTimeoutMs?: number;            // how long an endpoint call waits for its reply before it
                                         // fails to `onError` (default 30000); an endpoint's own
                                         // `timeoutMs` wins

  // Language (see I18N_DOCS.md)
  phrases?: Phrasebook;                  // the book every tree this shell renders is translated through
  phraseKeys?: PhraseKeys;               // which prop keys carry prose
  onPhraseMiss?: (phrase: string, where: string) => void;  // a phrase with no entry in the book

  // Telemetry / observability
  telemetry?: ShellTelemetry;            // onStateChange, onDataChange, onEndpoint callbacks
  onError?: (error: NovaError) => void;  // single error handler for the whole shell

  // Strictness
  strict?: boolean;                      // throw vs route through onError (default false)

  // Navigation history
  historyDepth?: number;                 // how many navigations `back` can walk (default 50; 0 = off)

  // Test injection / advanced
  shellIdFn?: IdFactory;
  instanceIdFn?: IdFactory;
  eventBus?: EventBus;
  messageBus?: MessageBus;
};
```

### `canvases`

The canvases the shell hosts. A canvas is a stack of action instances; the topmost is the active one. Each entry is a `CanvasConfig`:

```ts
type CanvasConfig = {
  id: string;                            // arbitrary name, by purpose
  mode?: 'stack' | 'list';               // 'stack' (default): only the top is active, the rest suspended.
                                         // 'list': every instance stays live — author an `actionLayout`
                                         // that loops `$.instances`
  actionLayout?: LayoutNode | string;    // how this canvas arranges its instances; when omitted,
                                         // only the top-of-stack (card-deck) action renders.
                                         // Scope available to resolvables: { instances, active, count }
  initial?: CanvasInitialSeed | CanvasInitialSeed[];  // pre-populate the stack on shell creation;
                                         // a list is pushed left to right
};

// A seed is an action id, or an object with input and fragment composition —
// equivalent to calling shell.push(canvasId, ...) after createShell returns.
type CanvasInitialSeed = string | { action: string; input?: Record<string, unknown>; with?: string[] };
```

```ts
canvases: [{ id: 'main' }]                                       // single-pane app
canvases: [{ id: 'nav' }, { id: 'content' }]                     // sidebar + main pane
canvases: [{ id: 'main', initial: 'home' }, { id: 'modal' }]     // app + overlay, home pre-pushed
```

The shell tracks each canvas independently — pushing on `main` doesn't affect `modal`.

On a `mode: 'list'` canvas a push adds an instance without suspending the others, and `removeInstance` / `removeSelf` resume nothing; `pop` and `popTo` behave as on a stack — the instance they expose re-runs its `mount` and `resume` hooks. An instance closes itself with a `{ removeSelf: true }` step and re-reads itself with `{ reload: true }`. `addCanvas` applies `mode` the same way; a canvas removed and re-added under the same id takes the mode it is re-added with.

Each entry of the `instances` scope an `actionLayout` sees is the `ActionInstance` (`id`, `definitionId`, `canvasId`, `status`, `data`) plus `title` — the action's `title` resolved against the instance's data, falling back to its `name`, then its id.

In nova itself every `initial` seed is pushed, and one naming an unknown action throws `UnknownActionError`. Under moss the same field is read as a candidate list: the first seed the principal is granted is the one that mounts (see moss's docs).

### `actions`

Every action the shell can mount, keyed by id. Actions are validated at shell init via `ActionDefinitionSchema`. Any malformed definition throws `DefinitionValidationError` with a list of Zod issues.

Actions can `{push: {action: 'someId'}}` other actions — but only ones that exist in this map. Trying to push an unknown action throws `UnknownActionError`.

### `registry` and `layoutStore`

These are **shared** across every action in the shell. All actions read components from the same registry and layout refs from the same store. Both are optional — createShell builds fresh empty ones when omitted, and exposes whichever ended up in use as `shell.registry` / `shell.layoutStore`. A `components` map, if provided, is `registerAll`'d onto the registry either way.

### `fragments`

Reusable partial actions (`ActionFragment`s), keyed by id, referenceable from a push/replace effect's `with: [...]`. More can be added at runtime via `shell.registerFragment`.

### `fetch`, `transform`, and `functions`

These are dependency injection points. HTTP endpoint calls use `fetch`. Endpoint `request`/`response` configs run through `transform` — an opaque `(config, source) => unknown` evaluator nova never interprets (the host typically wires Prism's `evaluate`); declaring a `request`/`response` without one is a hard error. `{ fn: '<name>' }` endpoints resolve their handler from `functions`. There is no default for any of the three: nova does not reach for the global `fetch`, and an HTTP endpoint called with none injected fails to `onError`.

### `endpointTimeoutMs`

How long an endpoint call waits for its reply before it fails to `onError` — default 30000. An endpoint's own `timeoutMs` wins over it. It bounds the first answer only.

### `phrases`, `phraseKeys`, `onPhraseMiss`

The shell's language: the book every tree it renders is translated through, which prop keys carry prose, and a hook for phrases the book lacks. All absent means no i18n, at no cost. `shell.setPhrases` swaps the book live. See `I18N_DOCS.md`.

### `telemetry`

```ts
telemetry: {
  onStateChange: (snapshot) => { /* whole-shell snapshot */ },
  onDataChange: (event)    => { /* per-instance data update */ },
  onEndpoint: (event)      => { /* per-endpoint-call outcome */ },
}
```

The first two fire whenever the shell's state changes. The React adapter uses these via `useSyncExternalStore` to drive re-renders. You can also use them directly to log, persist, or sync state externally.

`onEndpoint` fires once per completed endpoint call — `fn:` and HTTP alike — with an `EndpointEvent`: `{ name, kind: 'fn' | 'http', ok, status, ms, instanceId, canvasId }` (`status` is 0 for fn calls; aborted calls are not reported). This is the observability seam devtools' timeline reads.

### `strict`

When `true`, errors throw all the way up through the shell's public methods. Lifecycle errors surface on the next shell call (because they're inherently async). Use strict mode in tests and dev. Use lax mode (`false`, the default) in production where you want graceful degradation via `onError`.

### `onError`

A single function that receives every `NovaError` produced anywhere in the shell. Use it for logging, telemetry, or showing an error UI. It fires for render errors, endpoint failures, lifecycle failures, navigation failures.

---

## The `Shell` interface

`createShell(config)` returns a `Shell`:

```ts
type Shell = {
  readonly id: string;
  readonly registry: ComponentRegistry;    // what the shell was created with (or built)
  readonly layoutStore: LayoutStore;

  // Canvas operations
  push: (canvasId: string, actionId: string, input?: object, fragments?: string[], options?: PushOptions) => string;
  originOf: (instanceId: string) => string | undefined;   // the `origin` an instance was pushed with
  pop: (canvasId: string) => void;
  popTo: (canvasId: string, instanceId: string) => void;
  removeInstance: (canvasId: string, instanceId: string) => void;
  replace: (canvasId: string, actionId: string, input?: object, fragments?: string[]) => string;
  clear: (canvasId: string) => void;
  back: () => boolean;                     // undo the last navigation, anywhere on the shell

  // Runtime registration
  registerAction: (definition: ActionDefinition) => void;
  removeAction: (actionId: string) => void;   // revocation: unmounts live instances
  registerFragment: (fragment: ActionFragment) => void;

  // Canvas set / layout mutation
  addCanvas: (config: CanvasConfig) => void;
  removeCanvas: (canvasId: string) => void;
  setCanvasLayout: (layout: LayoutNode | string) => void;
  setLayout: (refId: string, layout: LayoutNode) => void;   // hot-swap a LayoutRef target

  // Language
  setPhrases: (phrases: Phrasebook | undefined) => void;
  getPhrases: () => Phrasebook | undefined;

  // State queries
  getCanvasState: (canvasId: string) => CanvasState;
  getRuntime: (instanceId: string) => PublicActionRuntime | undefined;
  getState: () => StateSnapshot;

  // Render-tree access (canvas/shell layouts)
  getShellRenderTree: () => RenderNode[];
  getCanvasRenderTree: (canvasId: string) => RenderNode[];
  flattenRenderTree: (tree: RenderNode[]) => RenderNode[];

  // Event/message dispatch
  dispatch: (event: NovaEvent) => void;
  publish: (channel: string, payload?: unknown) => void;

  // Telemetry subscriptions
  onStateChange: (handler) => Unsubscribe;
  onDataChange: (handler) => Unsubscribe;
  onEndpoint: (handler) => Unsubscribe;
  onCanvasChange: (canvasId, handler) => Unsubscribe;

  // Lifecycle
  dispose: () => void;
};
```

### Canvas operations

#### `push(canvasId, actionId, input?, fragments?, options?)`

Mount a fresh instance of an action on top of a canvas. On a `stack` canvas it suspends the previous top (its `suspend` lifecycle hook fires). Returns the new instance id.

```ts
const instanceId = shell.push('main', 'editor', { fileId: 'f_42' });
shell.push('overlay', 'confirm', { id: 'u_42' }, ['modal-frame']);   // composed with a fragment
```

The optional `input` is merged into the action's `data` before mount. The optional `fragments` names `ActionFragment`s to compose the action with before instantiation — same as a push effect's `with: [...]`. An unknown action id throws `UnknownActionError`; an unknown fragment id throws `UnknownFragmentError`.

The optional `options` is a `PushOptions`:

```ts
type PushOptions = {
  origin?: string;     // who is placing this — read back with shell.originOf(instanceId)
  history?: boolean;   // default true; false keeps the push out of the navigation journal,
                       // so `back` cannot undo it
};
```

#### `originOf(instanceId)`

The `origin` an instance was pushed with, or `undefined` — for anything pushed without one, seeded by `initial`, or already unmounted. It is how a caller that places instances (a server-driven layout, an agent) asks whether one is still its own before closing it.

#### `pop(canvasId)`

Unmount the top of a canvas. The unmounted action's `unmount` lifecycle hook fires. The new top (if any) resumes — its `mount` hook re-runs to refresh its data, then its `resume` hook fires.

```ts
shell.pop('main');
```

If the canvas is empty, this is a no-op.

#### `popTo(canvasId, instanceId)`

Pop a canvas down to a given instance — everything above it unmounts, in stack order. A no-op if the instance isn't in the stack. This is what stack-nav chrome (a breadcrumb, a tab) uses to jump straight to an ancestor.

```ts
shell.popTo('main', instanceId);
```

#### `removeInstance(canvasId, instanceId)`

Remove one instance anywhere in a canvas's stack, not just the top. On a list canvas this is a card closing; on a stack, removing the top resumes the one beneath. A no-op if the instance isn't on the canvas.

```ts
shell.removeInstance('tray', instanceId);
```

#### `replace(canvasId, actionId, input?, fragments?)`

Replace the top of a canvas with a new action instance. The replaced action unmounts; the new one mounts. The action below stays unaffected.

```ts
shell.replace('main', 'next-step', { progress: 0.5 });
```

Useful for wizards where back-navigation isn't wanted.

#### `clear(canvasId)`

Unmount every action on a canvas. Each unmount runs `unmount` lifecycle hooks in stack order.

```ts
shell.clear('main');
```

#### `back()`

Undo the shell's last navigation. Returns `false` when there was nothing left to
undo — the answer a landing screen gives.

```ts
shell.back();
```

The shell keeps a **navigation journal**: before every `push`, `replace`,
`clear` and `resetTo` — and every `reconcile` that moved something — it writes
down the canvas that is about to change. One entry is one position somebody can
be returned to; `back` restores the newest.

- **Global and ordered.** One journal across every canvas, each entry naming the
  one canvas it describes — so back walks a person's own moves in the order they
  made them, and never reverts a canvas that changed underneath them (a
  delivered notice, an agent's card) while they were somewhere else.
- **What survives.** An instance the recorded position still names is kept, with
  everything it holds. One that is gone comes back derived from the action and
  input that made it: back re-opens a screen, it does not resurrect the form
  somebody replaced their way out of.
- **A pop is a back.** `pop`, `popTo` and `removeInstance` spend a journal entry
  instead of adding one — otherwise a person who used the app's own back button
  would have to press the browser's twice.
- **The floor.** Canvas seeds (`initial`, and any `push` passing `{ history:
  false }`) are never recorded, so `back` cannot empty the screen somebody landed
  on. A revoked action takes its entries with it: `removeAction` purges anything
  that would hand it back, and `removeCanvas` drops what can no longer be
  restored.
- **Depth.** `ShellConfig.historyDepth` (default 50) bounds the journal;
  `historyDepth: 0` switches it off and makes `back` a no-op.

Nothing about the gesture lives here — a browser's back button, a TUI's Escape
key and an app's own control all arrive as this one call. In moss it is
protocol-level: see its `back` client message.

### Runtime registration and canvas mutation

The shell starts from `createShell`'s `actions` / `fragments` / `canvases` / `canvasLayout` and can change all four live:

```ts
shell.registerAction(definition);        // add (or replace) an action definition
shell.removeAction(actionId);            // revocation: unmounts live instances, drops the definition
shell.registerFragment(fragment);        // add a fragment for `with: [...]`
shell.addCanvas({ id: 'aside', initial: 'inspector' });  // appends + seeds; no-op if the id exists
shell.removeCanvas('aside');             // unmounts its instances, then drops it
shell.setCanvasLayout(layout);           // swap how the shell arranges its canvases
shell.setLayout('region-a', layout);     // swap what a LayoutRef placeholder resolves to
```

`setLayout` is the hot-swap hook for dynamic region layouts: a canvasLayout embeds `{ ref: id }` placeholders, and this replaces what one resolves to — the frame/chrome stays intact.

### Language

```ts
shell.setPhrases(book);                  // replace the book; reaches instances already mounted
shell.setPhrases(undefined);             // back to the source language
shell.getPhrases();                      // the book in force, or undefined
```

`setPhrases` fires a state change, so mounted adapters re-render; stacks and instance data are untouched. See `I18N_DOCS.md`.

### `reconcileCanvas(shell, canvasId, desired, options)`

The declarative verb beside the imperative ones: make a canvas hold exactly a desired list. It is what the `reconcile` step runs (see `ACTION_DOCS.md`), exported for a host that produces a whole desired state itself.

```ts
import { reconcileCanvas } from '@niscorp/nova';

const { changed, notes } = reconcileCanvas(
  shell,
  'tools',
  [{ actionId: 'notes' }, { actionId: 'timer', input: { minutes: 5 }, with: ['card-frame'] }],
  { origin: 'agent', own: 'pushed' },
);
```

`origin` (required) is stamped on everything the call pushes. `own: 'pushed'` (default) moves only instances carrying that origin; `own: 'canvas'` moves everything on the canvas. One instance per action id. An optional `definitionOf(actionId)` enables the re-aim rule: when a live instance's input changed and that input carries a key the action declares in its `input` and its mount-time load reads through an endpoint `request`, the instance is re-opened instead of written into.

### Render-tree access

For non-React consumers (evaluators, exporters, tests):

```ts
shell.getShellRenderTree();              // the canvasLayout rendered against { canvases }
shell.getCanvasRenderTree('main');       // a canvas's actionLayout rendered against { instances, active, count }
shell.flattenRenderTree(tree);           // materialise a tree: CanvasSlot resolves away, ActionSlot survives
```

`flattenRenderTree` resolves `CanvasSlot` markers into their canvas trees, but the `ActionSlot` marker survives: a component node with `props: { instanceId, canvasId, definitionId }`, `key: instanceId`, and the instance's rendered tree as children. Served (remote) trees keep instance identity this way — a renderer keys by instance so a swap remounts, and a terminal-side slot wrapper has its seam.

React consumers render trees through component boundaries instead — see `REACT_DOCS.md`.

### State queries

#### `getCanvasState(canvasId)`

Returns the current state of one canvas.

```ts
const state = shell.getCanvasState('main');
// {
//   id: 'main',
//   stack: [ActionInstance, ActionInstance, ...],
//   active: ActionInstance | undefined,
// }
```

The `stack` is in mount order (oldest first). `active` is the topmost (or `undefined` if empty).

#### `getState()`

Returns a snapshot of every canvas at once.

```ts
const snapshot = shell.getState();
// { canvases: { main: CanvasState, modal: CanvasState, ... } }
```

This is what `useSyncExternalStore` calls under the hood for the React adapter.

#### `getRuntime(instanceId)`

Returns the runtime for a specific action instance, or `undefined` if it's been unmounted. The returned `PublicActionRuntime` is narrow — it doesn't expose internal lifecycle methods.

```ts
const runtime = shell.getRuntime('act-7');
runtime?.getData();          // current data snapshot
runtime?.render();           // current RenderNode tree
runtime?.onDataChange(handler);
runtime?.setData({...});    // tooling escape hatch
```

See `ACTION_DOCS.md` for the runtime methods.

### Event and message dispatch

#### `dispatch(event)`

Send a UI event into the shell. Triggers with a matching `event:` (and optional `ref:`) fire.

```ts
shell.dispatch({ type: 'ui:click', ref: 'save' });
shell.dispatch({ type: 'ui:input', ref: 'name', payload: 'Ada' });
shell.dispatch({ type: 'ui:model', ref: 'name', payload: 'Ada' });
shell.dispatch({ type: 'ui:key', ref: 'search', key: 'Enter' });
```

A `NovaEvent` is `{ type, ref?, payload?, origin? }` — `type` one of `ui:click`, `ui:submit`, `ui:input`, `ui:focus`, `ui:blur`, `ui:model`, `ui:key` (which also carries `key`), `ui:drop`. `origin` is an instance id: an event carrying one reaches that instance's triggers only; one without it reaches every instance listening. Adapters stamp it at the instance boundary.

This is how the React adapter's components push events into the shell when buttons get clicked, inputs change, etc. You normally don't call it directly from app code — components do.

#### `publish(channel, payload?)`

Send a message on a channel. Triggers with a matching `message:` fire — across all actions on all canvases.

```ts
shell.publish('cart-updated', { itemCount: 3 });
shell.publish('user-logged-out');
```

Use it to coordinate between actions that don't otherwise know about each other. A listening trigger reads the payload as `@event.payload`.

#### The `nova:navigated:<canvasId>` channel

The shell itself publishes one message per canvas whenever that canvas's **active** instance changes — whatever caused it (a push, `back`, a host's call). Chrome that follows a canvas (a sidebar highlight, a breadcrumb) listens to it instead of to the click that sent somebody there.

```ts
import { navigatedChannel } from '@niscorp/nova';

navigatedChannel('main');                // → 'nova:navigated:main'
// payload: { canvas: 'main', action?: string, instance?: string }
// `action` / `instance` are absent when the canvas went empty

triggers: [
  { message: 'nova:navigated:main', do: [{ set: 'current', value: '@event.payload.action' }] },
]
```

Announcements are deferred and coalesced: a burst (a `resetTo` is a clear and a push) says once where the canvas ended.

### Telemetry subscriptions

#### `onStateChange(handler)` / `onDataChange(handler)`

Imperative subscription form (alongside the declarative `telemetry` config option). Returns an `Unsubscribe`.

```ts
const off = shell.onDataChange((event) => {
  console.log(`${event.instanceId} data:`, event.data);
});
// later:
off();
```

The React adapter uses these internally; app code can use them to drive logging, persistence, devtools, etc.

#### `onEndpoint(handler)`

Fires once per completed endpoint call any action makes — `fn:` and HTTP alike — with `{ name, kind, ok, status, ms, instanceId, canvasId }` (`status` 0 for fn; aborted calls not reported). Returns an `Unsubscribe`. Devtools' endpoint timeline is built on this.

#### `onCanvasChange(canvasId, handler)`

Subscribes to one canvas. Fires with the new `CanvasState` only when the canvas meaningfully changed — stack length, item ids/statuses, or the active instance. The shell owns this equality check, so subscribers (adapters included) never encode what "changed" means.

```ts
const off = shell.onCanvasChange('main', (state) => {
  console.log('main active:', state.active?.id);
});
```

### `dispose()`

Tear down the entire shell. Unmounts every action on every canvas. Detaches all listeners. After `dispose()`, every shell method becomes a no-op or throws `ShellDisposedError`.

```ts
useEffect(() => {
  const shell = createShell({ ... });
  return () => shell.dispose();
}, []);
```

Always dispose shells you create — they hold references to runtimes which hold references to event listeners.

### `shellView(shell)`, `shellSettled(shell)` and `shellIdle(shell)`

Three helpers beside the shell: for anything that draws one, and for anything that presses something on one and reads what came of it.

```ts
import { shellView, shellSettled, shellIdle } from '@niscorp/nova';

const { api, subscribe } = shellView(shell);   // the shell, as a RenderApi
api.frame();                                   // the shell layout's tree
api.canvasTree('main');                        // one canvas — [] when nothing visible is mounted
api.dispatch('main', { type: 'ui:click', ref: 'save' });   // to the canvas's active instance
const stop = subscribe(() => redraw());        // once per burst of changes

const whole = await shellSettled(shell, { waitMs: 300 });  // true: nothing is still mounting

api.dispatch('main', { type: 'ui:click', ref: 'save' });
const done = await shellIdle(shell, { waitMs: 5000 });     // true: what the press set going has finished
```

`api.dispatch` stamps an event that names no `origin` with the canvas's active instance; `api.publish(channel, payload?)` is `shell.publish`. `shellSettled` and `shellIdle` also take `stopped?: () => boolean` — once it answers `true` the wait ends with `false`.

`shellView` is what lets an adapter written against `RenderApi` (the DOM and TTY adapters, a moss terminal) draw a shell that lives beside it. `shellSettled` resolves `true` once no instance is `initializing` — every mount hook, and what it chained to, has been awaited — and `false` if `waitMs` (default 300) runs out first. It is the moment to draw a shell to markup, and the moment for the page's own shell to adopt it.

`shellSettled` asks about mounts and nothing else. A trigger's steps run detached from the event that fired them, so after a press it can answer `true` while the call the press made is still out. `shellIdle` is the wider question: nothing is mounting **and** no chain the shell started is still running — no trigger's steps, no `emit` on its way to its listeners (and what they then call), no re-read of an action a `pop` revealed. It is what a check awaits after `dispatch` instead of sleeping, and what anything that runs an action for somebody else awaits before it reads the screen. Same options, same default wait, `false` when the wait runs out.

Two things it does not wait for, because they are not this shell's work: the next body of a read the shell is **following** (a reactive read under moss answers again when somebody writes — wait for that with `shell.onDataChange`), and anything outside the shell that an endpoint set going. A call that never answers holds it until the call's own timeout fails it (30s by default; an endpoint's `timeoutMs` wins), so pass the `waitMs` you mean.

`shellSettled` is deliberately not widened to this. A page is read whenever it is asked for, also while a long call is out, and that read should not wait on it.

---

## Multi-canvas patterns

### Sidebar + content

```ts
canvases: [{ id: 'nav', initial: 'navigator' }, { id: 'content', initial: 'welcome' }]

// Inside the navigator action:
triggers: [
  { event: 'ui:click', ref: 'home',     do: [{ replace: { action: 'home',     canvas: 'content' } }] },
  { event: 'ui:click', ref: 'settings', do: [{ replace: { action: 'settings', canvas: 'content' } }] },
],
```

Clicking nav buttons swaps the content canvas without affecting the nav canvas. Each is its own independent stack.

### Modal overlays

```ts
canvases: [{ id: 'main', initial: 'home' }, { id: 'modal' }]

// From the home action:
{ push: { action: 'confirm-delete', canvas: 'modal' } }
// Optionally composed with reusable modal chrome:
{ push: { action: 'confirm-delete', canvas: 'modal', with: ['modal-frame'] } }

// From inside the confirm-delete action:
{ pop: true }   // pops on the action's current canvas, which is 'modal'
```

The modal canvas is its own stack. The main canvas is unaffected.

### Cross-canvas messaging

Actions on different canvases can talk via the message bus:

```ts
// Producer canvas — emits when something happens
{ emit: { channel: 'item-added' } }

// Consumer canvas — has a trigger listening for it
triggers: [
  { message: 'item-added', do: [{ increment: 'count' }] },
]
```

The shell's message bus is shared across all canvases. Cross-canvas communication is just publish/subscribe.

---

## State machine

Each action instance lives in one of four states:

```
                  push
   [ initializing ] ────► [ active ]
                              │  ▲
                  push other  │  │ pop other
                              ▼  │
                          [ suspended ]
                              │
                              │ pop / clear
                              ▼
                         [ unmounted ]
```

- **`initializing`** — between `push()` and the moment the mount lifecycle hook completes.
- **`active`** — the topmost instance on a canvas. Triggers attached, render reflects current data.
- **`suspended`** — another action is on top (on a `stack` canvas; a `list` canvas suspends nothing). Triggers stay attached but do not fire (a suspended action reacts to nothing). Async work already in flight is not cancelled — only unmounting aborts it.
- **`unmounted`** — terminal. The runtime is disposed; `getRuntime` returns `undefined`.

Lifecycle hooks fire on each transition: `mount` (init→active), `suspend` (active→suspended), `mount` again then `resume` (suspended→active — the re-run of `mount` refreshes the data a backgrounded action ignored), `unmount` (any→unmounted).

---

## ID generation

Every shell has a unique id and assigns ids to action instances. By default both use `crypto.randomUUID()` if available, falling back to a Math.random-based scheme, prefixed `shell-` and `act-`. For deterministic tests, inject your own:

```ts
import { createIdFactory } from '@niscorp/nova';

const myInstanceIds = createIdFactory('act');
// or write a closure-based counter for full determinism

createShell({
  ...
  shellIdFn: () => 'test-shell',
  instanceIdFn: myInstanceIds,
});
```

---

## Errors

The shell can produce these:

- **`UnknownActionError`** — `shell.push(canvas, 'foo')` where `'foo'` isn't in `actions`
- **`UnknownFragmentError`** — a `fragments` / `with: [...]` id that isn't registered
- **`ShellDisposedError`** — `push`, `replace`, and the registration / canvas / layout / phrase setters after `dispose()` (`pop`, `popTo`, `removeInstance`, `clear`, `removeCanvas` and `back` are no-ops instead)
- **`DefinitionValidationError`** — at shell construction, if any action in `actions` fails schema validation; also from `registerAction` / `registerFragment`
- **`LifecycleError`** — a lifecycle hook step threw (in strict mode propagates, in lax mode routes via `onError`)

Plus all action-level errors (from `ACTION_DOCS.md`) and layout-level errors (from `LAYOUT_DOCS.md`) bubble up through the shell's error pipeline.

---

## Quick reference

```ts
const shell = createShell({
  canvases: CanvasConfig[],                // { id, mode?, actionLayout?, initial? }
  actions: Record<string, ActionDefinition>,
  canvasLayout?: LayoutNode | string,
  registry?: ComponentRegistry,            // built fresh when omitted
  components?: Record<string, RegistrationInput>,
  layoutStore?: LayoutStore,               // built fresh when omitted
  fragments?: Record<string, ActionFragment>,
  fetch?: FetchFn,
  transform?: TransformFn,
  functions?: Record<string, FunctionHandler>,
  endpointTimeoutMs?: number,              // default 30000
  phrases?: Phrasebook,
  phraseKeys?: PhraseKeys,
  onPhraseMiss?: (phrase, where) => void,
  telemetry?: { onStateChange?, onDataChange?, onEndpoint? },
  strict?: boolean,
  onError?: (error) => void,
  historyDepth?: number,                   // default 50; 0 = off
  shellIdFn?, instanceIdFn?, eventBus?, messageBus?,
});

// Canvas ops
shell.push(canvasId, actionId, input?, fragments?, options?);  // → instanceId; options: { origin?, history? }
shell.originOf(instanceId);                            // → string | undefined
shell.pop(canvasId);
shell.popTo(canvasId, instanceId);
shell.removeInstance(canvasId, instanceId);
shell.replace(canvasId, actionId, input?, fragments?); // → instanceId
shell.clear(canvasId);
shell.back();                                          // → boolean

// Runtime registration / canvas mutation
shell.registerAction(definition);
shell.removeAction(actionId);
shell.registerFragment(fragment);
shell.addCanvas(config);
shell.removeCanvas(canvasId);
shell.setCanvasLayout(layout);
shell.setLayout(refId, layout);

// Language
shell.setPhrases(phrases);                 // undefined → the source language
shell.getPhrases();                        // → Phrasebook | undefined

// State
shell.getCanvasState(canvasId);            // → CanvasState
shell.getRuntime(instanceId);              // → PublicActionRuntime | undefined
shell.getState();                          // → StateSnapshot

// Render trees (non-React consumers)
shell.getShellRenderTree();                // → RenderNode[]
shell.getCanvasRenderTree(canvasId);       // → RenderNode[]
shell.flattenRenderTree(tree);             // → RenderNode[]

// Events / messages
shell.dispatch({ type, ref?, ... });
shell.publish(channel, payload?);

// Telemetry
shell.onStateChange(handler);              // → Unsubscribe
shell.onDataChange(handler);               // → Unsubscribe
shell.onEndpoint(handler);                 // → Unsubscribe
shell.onCanvasChange(canvasId, handler);   // → Unsubscribe

// Teardown
shell.dispose();
```

For wiring a shell into a React app, see `REACT_DOCS.md`. For authoring the actions a shell hosts, see `ACTION_DOCS.md`.
