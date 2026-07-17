# Shell — Author Guide

How to wire nova together. The shell is the top-level orchestrator: it owns canvases, mounts and unmounts action instances, drives navigation, routes events and messages, and exposes the runtime tree to consumers.

If layouts are the "what" and actions are the "behavior," the shell is the "where and when." This guide is for **using** the shell. For the architecture see `DESIGN.md`.

---

## A first shell

```ts
import { createShell, createComponentRegistry, createLayoutStore } from '@niscorp/nova';
import { registerNovaReactComponents } from '@niscorp/nova/react/components';
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

  // Telemetry / observability
  telemetry?: ShellTelemetry;            // onStateChange, onDataChange callbacks
  onError?: (error: NovaError) => void;  // single error handler for the whole shell

  // Strictness
  strict?: boolean;                      // throw vs route through onError (default false)

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
  actionLayout?: LayoutNode | string;    // how this canvas arranges its instances; when omitted,
                                         // only the top-of-stack (card-deck) action renders.
                                         // Scope available to resolvables: { instances, active, count }
  initial?: CanvasInitialSeed | CanvasInitialSeed[];  // pre-populate the stack on shell creation
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

### `actions`

Every action the shell can mount, keyed by id. Actions are validated at shell init via `ActionDefinitionSchema`. Any malformed definition throws `DefinitionValidationError` with a list of Zod issues.

Actions can `{push: {action: 'someId'}}` other actions — but only ones that exist in this map. Trying to push an unknown action throws `UnknownActionError`.

### `registry` and `layoutStore`

These are **shared** across every action in the shell. All actions read components from the same registry and layout refs from the same store. Both are optional — createShell builds fresh empty ones when omitted, and exposes whichever ended up in use as `shell.registry` / `shell.layoutStore`. A `components` map, if provided, is `registerAll`'d onto the registry either way.

### `fragments`

Reusable partial actions (`ActionFragment`s), keyed by id, referenceable from a push/replace effect's `with: [...]`. More can be added at runtime via `shell.registerFragment`.

### `fetch`, `transform`, and `functions`

These are dependency injection points. HTTP endpoint calls use `fetch`. Endpoint `request`/`response` configs run through `transform` — an opaque `(config, source) => unknown` evaluator nova never interprets (the host typically wires Prism's `evaluate`); declaring a `request`/`response` without one is a hard error. `{ fn: '<name>' }` endpoints resolve their handler from `functions`. Default `fetch` is the global `fetch` if available; there is no default `transform` or `functions`.

### `telemetry`

```ts
telemetry: {
  onStateChange: (snapshot) => { /* whole-shell snapshot */ },
  onDataChange: (event)    => { /* per-instance data update */ },
}
```

Both fire whenever the shell's state changes. The React adapter uses these via `useSyncExternalStore` to drive re-renders. You can also use them directly to log, persist, or sync state externally.

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
  push: (canvasId: string, actionId: string, input?: object, fragments?: string[]) => string;
  pop: (canvasId: string) => void;
  popTo: (canvasId: string, instanceId: string) => void;
  replace: (canvasId: string, actionId: string, input?: object, fragments?: string[]) => string;
  clear: (canvasId: string) => void;

  // Runtime registration
  registerAction: (definition: ActionDefinition) => void;
  registerFragment: (fragment: ActionFragment) => void;

  // Canvas set / layout mutation
  addCanvas: (config: CanvasConfig) => void;
  removeCanvas: (canvasId: string) => void;
  setCanvasLayout: (layout: LayoutNode | string) => void;
  setLayout: (refId: string, layout: LayoutNode) => void;   // hot-swap a LayoutRef target

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
  onCanvasChange: (canvasId, handler) => Unsubscribe;

  // Lifecycle
  dispose: () => void;
};
```

### Canvas operations

#### `push(canvasId, actionId, input?, fragments?)`

Mount a fresh instance of an action on top of a canvas. Suspends the previous top (its `suspend` lifecycle hook fires). Returns the new instance id.

```ts
const instanceId = shell.push('main', 'editor', { fileId: 'f_42' });
shell.push('overlay', 'confirm', { id: 'u_42' }, ['modal-frame']);   // composed with a fragment
```

The optional `input` is merged into the action's `data` before mount. The optional `fragments` names `ActionFragment`s to compose the action with before instantiation — same as a push effect's `with: [...]`.

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

### Runtime registration and canvas mutation

The shell starts from `createShell`'s `actions` / `fragments` / `canvases` / `canvasLayout` and can change all four live:

```ts
shell.registerAction(definition);        // add (or replace) an action definition
shell.registerFragment(fragment);        // add a fragment for `with: [...]`
shell.addCanvas({ id: 'aside', initial: 'inspector' });  // appends + seeds; no-op if the id exists
shell.removeCanvas('aside');             // unmounts its instances, then drops it
shell.setCanvasLayout(layout);           // swap how the shell arranges its canvases
shell.setLayout('region-a', layout);     // swap what a LayoutRef placeholder resolves to
```

`setLayout` is the hot-swap hook for dynamic region layouts: a canvasLayout embeds `{ ref: id }` placeholders, and this replaces what one resolves to — the frame/chrome stays intact.

### Render-tree access

For non-React consumers (evaluators, exporters, tests):

```ts
shell.getShellRenderTree();              // the canvasLayout rendered against { canvases }
shell.getCanvasRenderTree('main');       // a canvas's actionLayout rendered against { instances, active, count }
shell.flattenRenderTree(tree);           // expand CanvasSlot/ActionSlot markers into resolved content
```

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
shell.dispatch({ type: 'ui:input', ref: 'name', value: 'Ada' });
shell.dispatch({ type: 'ui:model', ref: 'name', payload: 'Ada' });
```

This is how the React adapter's components push events into the shell when buttons get clicked, inputs change, etc. You normally don't call it directly from app code — components do.

#### `publish(channel, payload?)`

Send a message on a channel. Triggers with a matching `message:` fire — across all actions on all canvases.

```ts
shell.publish('cart-updated', { itemCount: 3 });
shell.publish('user-logged-out');
```

Use it to coordinate between actions that don't otherwise know about each other.

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
- **`suspended`** — another action is on top. Triggers stay attached but do not fire (a suspended action reacts to nothing), and the runtime's abort signal prevents in-flight async work from completing during this state.
- **`unmounted`** — terminal. The runtime is disposed; `getRuntime` returns `undefined`.

Lifecycle hooks fire on each transition: `mount` (init→active), `suspend` (active→suspended), `mount` again then `resume` (suspended→active — the re-run of `mount` refreshes the data a backgrounded action ignored), `unmount` (any→unmounted).

---

## ID generation

Every shell has a unique id and assigns ids to action instances. By default both use `crypto.randomUUID()` if available, falling back to a Math.random-based scheme. For deterministic tests, inject your own:

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
- **`ShellDisposedError`** — any operation after `dispose()`
- **`DefinitionValidationError`** — at shell construction, if any action in `actions` fails schema validation
- **`LifecycleError`** — a lifecycle hook step threw (in strict mode propagates, in lax mode routes via `onError`)

Plus all action-level errors (from `ACTION_DOCS.md`) and layout-level errors (from `LAYOUT_DOCS.md`) bubble up through the shell's error pipeline.

---

## Quick reference

```ts
const shell = createShell({
  canvases: CanvasConfig[],                // { id, actionLayout?, initial? }
  actions: Record<string, ActionDefinition>,
  canvasLayout?: LayoutNode | string,
  registry?: ComponentRegistry,            // built fresh when omitted
  components?: Record<string, RegistrationInput>,
  layoutStore?: LayoutStore,               // built fresh when omitted
  fragments?: Record<string, ActionFragment>,
  fetch?: FetchFn,
  transform?: TransformFn,
  functions?: Record<string, FunctionHandler>,
  telemetry?: { onStateChange?, onDataChange? },
  strict?: boolean,
  onError?: (error) => void,
});

// Canvas ops
shell.push(canvasId, actionId, input?, fragments?);    // → instanceId
shell.pop(canvasId);
shell.popTo(canvasId, instanceId);
shell.replace(canvasId, actionId, input?, fragments?); // → instanceId
shell.clear(canvasId);

// Runtime registration / canvas mutation
shell.registerAction(definition);
shell.registerFragment(fragment);
shell.addCanvas(config);
shell.removeCanvas(canvasId);
shell.setCanvasLayout(layout);
shell.setLayout(refId, layout);

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

// Teardown
shell.dispose();
```

For wiring a shell into a React app, see `REACT_DOCS.md`. For authoring the actions a shell hosts, see `ACTION_DOCS.md`.
