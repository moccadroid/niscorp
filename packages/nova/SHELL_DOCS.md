# Shell — Author Guide

How to wire nova together. The shell is the top-level orchestrator: it owns canvases, mounts and unmounts action instances, drives navigation, routes events and messages, and exposes the runtime tree to consumers.

If layouts are the "what" and actions are the "behavior," the shell is the "where and when." This guide is for **using** the shell. For the architecture see `DESIGN.md`.

---

## A first shell

```ts
import { createShell, createComponentRegistry, createLayoutStore } from '@niscorp/nova';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';
import { menuAction, settingsAction, profileAction } from './actions';

const registry = createComponentRegistry();
registerNovaReactComponents(registry);
const layoutStore = createLayoutStore();

const shell = createShell({
  canvases: ['main'],
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
  canvases: string[];                    // canvas ids — defines the universe of named canvases
  registry: ComponentRegistry;           // shared component registry for all actions
  layoutStore: LayoutStore;              // shared layout store for all actions
  actions: Record<string, ActionDefinition>;  // every action the shell knows about

  // Optional integrations
  fetch?: FetchFn;                       // fetch implementation for endpoint calls
  transform?: TransformFn;               // optional response transformer (Prism etc.)

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

The list of named canvases the shell hosts. A canvas is a stack of action instances; the topmost is the active one. You name your canvases by purpose:

```ts
canvases: ['main']                              // single-pane app
canvases: ['nav', 'content']                    // sidebar + main pane
canvases: ['main', 'modal', 'toast']            // app + overlays
```

The names are arbitrary strings. The shell tracks each canvas independently — pushing on `main` doesn't affect `modal`.

### `actions`

Every action the shell can mount, keyed by id. Actions are validated at shell init via `ActionDefinitionSchema`. Any malformed definition throws `DefinitionValidationError` with a list of Zod issues.

Actions can `{push: {action: 'someId'}}` other actions — but only ones that exist in this map. Trying to push an unknown action throws `UnknownActionError`.

### `registry` and `layoutStore`

These are **shared** across every action in the shell. All actions read components from the same registry and layout refs from the same store. Pass them in once at shell construction.

### `fetch` and `transform`

These are dependency injection points. Endpoint calls use `fetch`. Response shaping uses `transform` (typically a Prism transform). Default `fetch` is the global `fetch` if available; default `transform` is none (the response goes through unchanged).

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

  // Canvas operations
  push: (canvasId: string, actionId: string, input?: object) => string;
  pop: (canvasId: string) => void;
  replace: (canvasId: string, actionId: string, input?: object) => string;
  clear: (canvasId: string) => void;

  // State queries
  getCanvasState: (canvasId: string) => CanvasState;
  getRuntime: (instanceId: string) => PublicActionRuntime | undefined;
  getState: () => StateSnapshot;

  // Event/message dispatch
  dispatch: (event: NovaEvent) => void;
  publish: (channel: string, payload?: unknown) => void;

  // Telemetry subscriptions
  onStateChange: (handler) => Unsubscribe;
  onDataChange: (handler) => Unsubscribe;

  // Lifecycle
  dispose: () => void;
};
```

### Canvas operations

#### `push(canvasId, actionId, input?)`

Mount a fresh instance of an action on top of a canvas. Suspends the previous top (its `suspend` lifecycle hook fires). Returns the new instance id.

```ts
const instanceId = shell.push('main', 'editor', { fileId: 'f_42' });
```

The optional `input` is merged into the action's `data` before mount. Use it to seed the new instance with parameters from the caller.

#### `pop(canvasId)`

Unmount the top of a canvas. The unmounted action's `unmount` lifecycle hook fires. The new top (if any) resumes — its `resume` lifecycle hook fires.

```ts
shell.pop('main');
```

If the canvas is empty, this is a no-op.

#### `replace(canvasId, actionId, input?)`

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
canvases: ['nav', 'content']

shell.push('nav', 'navigator');
shell.push('content', 'welcome');

// Inside the navigator action:
triggers: [
  { event: 'ui:click', ref: 'home',     do: [{ replace: { action: 'home',     canvas: 'content' } }] },
  { event: 'ui:click', ref: 'settings', do: [{ replace: { action: 'settings', canvas: 'content' } }] },
],
```

Clicking nav buttons swaps the content canvas without affecting the nav canvas. Each is its own independent stack.

### Modal overlays

```ts
canvases: ['main', 'modal']

shell.push('main', 'home');

// From the home action:
{ push: { action: 'confirm-delete', canvas: 'modal' } }

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
- **`suspended`** — another action is on top. Triggers stay attached, but the runtime's abort signal prevents in-flight async work from completing during this state.
- **`unmounted`** — terminal. The runtime is disposed; `getRuntime` returns `undefined`.

Lifecycle hooks fire on each transition: `mount` (init→active), `suspend` (active→suspended), `resume` (suspended→active), `unmount` (any→unmounted).

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
  canvases: string[],
  registry: ComponentRegistry,
  layoutStore: LayoutStore,
  actions: Record<string, ActionDefinition>,
  fetch?: FetchFn,
  transform?: TransformFn,
  telemetry?: { onStateChange?, onDataChange? },
  strict?: boolean,
  onError?: (error) => void,
});

// Canvas ops
shell.push(canvasId, actionId, input?);    // → instanceId
shell.pop(canvasId);
shell.replace(canvasId, actionId, input?); // → instanceId
shell.clear(canvasId);

// State
shell.getCanvasState(canvasId);            // → CanvasState
shell.getRuntime(instanceId);              // → PublicActionRuntime | undefined
shell.getState();                          // → StateSnapshot

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
