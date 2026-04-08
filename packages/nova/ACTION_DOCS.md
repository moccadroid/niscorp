# Action — Author Guide

How to write nova actions. An action is a stateful unit: it owns a data store, runs lifecycle hooks, listens for events and messages, mutates its data, calls endpoints, and produces a layout that reads from its data. The shell drives instances of actions on canvases (see `SHELL_DOCS.md`).

This guide is for **authoring** actions. For the architecture see `DESIGN.md`.

---

## A first action

```ts
import type { ActionDefinition } from '@niscorp/nova';

const counter: ActionDefinition = {
  id: 'counter',
  data: { count: 0 },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 16, padding: 24 },
    children: [
      { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: 'Count: {{$.count}}' },
      { component: 'Stack', props: { direction: 'row', gap: 8 }, children: [
        { component: 'Button', ref: 'inc', children: 'Increment' },
        { component: 'Button', ref: 'dec', children: 'Decrement' },
      ]},
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'inc', do: [{ increment: 'count' }] },
    { event: 'ui:click', ref: 'dec', do: [{ decrement: 'count' }] },
  ],
};
```

This is a complete action definition. Pass it to a shell, push it onto a canvas, it runs.

## What's in an `ActionDefinition`

```ts
{
  id: string;                              // required — stable identifier
  name?: string;                           // human label (optional)
  description?: string;                    // free-form description
  layout?: LayoutNode | string;            // inline layout, or an id in the layout store
  data?: Record<string, unknown>;          // initial data merged with input on mount
  triggers?: TriggerConfig[];              // event/message → step bindings
  endpoints?: Record<string, EndpointConfig>;  // named HTTP calls
  lifecycle?: LifecycleConfig;             // mount/unmount/suspend/resume hooks
}
```

That's the entire surface. Everything else is composed from these fields.

---

## Data

The action's data is a plain object merged from `data` (defaults) + the `input` passed when the action is pushed onto a canvas. It's the **single source of truth** the layout reads from via bindings.

```ts
data: {
  count: 0,
  user: { name: '', email: '' },
  items: [],
  loading: false,
}
```

Bindings in the layout (`{{$.count}}`, `$.user.name`, etc.) resolve against this object. When mutations or `setData` change it, subscribers (the React adapter's `useRenderTree`, the inspector tabs, etc.) re-render automatically.

The data is **immutable from the outside** — every mutation produces a new top-level reference. Internally the store does structural sharing so unchanged subtrees keep their identity.

---

## Triggers

A trigger binds an event source to an ordered list of steps. When the event fires, the steps execute in sequence.

```ts
triggers: [
  // UI click on a component with ref="save"
  { event: 'ui:click', ref: 'save', do: [...] },

  // UI input change on a component with ref="email-field"
  { event: 'ui:input', ref: 'email-field', do: [...] },

  // Two-way model binding update
  { event: 'ui:model', ref: 'name-input', do: [...] },

  // Cross-action message bus subscription
  { message: 'cart-updated', do: [...] },
],
```

### Trigger fields

- **`event`** *(optional)* — UI event type. Common values: `ui:click`, `ui:input`, `ui:submit`, `ui:focus`, `ui:blur`, `ui:model`. Custom event names work too.
- **`message`** *(optional)* — message bus channel name. Listens via the shell's shared message bus, so this trigger fires from emits in any other action on any other canvas.
- **`ref`** *(optional)* — filter UI events by component ref. If unset, the trigger fires on every event of that type. Has no effect on message triggers.
- **`do`** *(required)* — ordered array of steps to run.

A trigger MUST have either `event` or `message`. Setting both is an error.

### When triggers fire

Triggers attach when the action mounts and detach when it unmounts. While the action is **suspended** (another action is pushed on top), triggers stay attached but the runtime's abort signal prevents in-flight async work from completing.

---

## Steps

A step is either a **mutation** (sync, modifies the data store) or an **effect** (may be async, touches the outside world). Steps in a trigger's `do` array execute in order; mutations are applied as a batch when an effect or the end of the list is reached.

```ts
do: [
  { set: 'loading', value: true },              // mutation
  { call: 'fetchUser', onSuccess: [             // effect
    { set: 'loading', value: false },           // mutation
    { set: 'user', from: 'fetchUserResponse' }, // mutation
  ]},
],
```

Mutations and effects share the same `do` slot — they're a discriminated union called `Step`.

---

## Mutations

Mutations are pure, sync operations that produce a new data store from the old one. There are 10 mutation kinds.

### `set`

Set a path to a literal value or copy from another path.

```ts
{ set: 'count', value: 0 }                       // literal
{ set: 'user.name', value: 'Ada' }               // nested path
{ set: 'previous', from: 'current' }             // copy from another path
```

### `toggle`

Flip a boolean.

```ts
{ toggle: 'isOpen' }
```

If the field doesn't exist or isn't a boolean, it becomes `true` on first toggle.

### `increment` / `decrement`

Add or subtract from a number.

```ts
{ increment: 'count' }                           // +1
{ increment: 'count', by: 5 }                    // +5
{ decrement: 'count', by: 2 }                    // -2
```

If the field isn't a number, it's treated as 0.

### `push` / `pop`

Append to or remove from the end of an array. **Note:** `push` / `pop` here are **mutations** that take a path string. The navigation `push`/`pop` effects (which take an object) live under [Effects](#effects).

```ts
{ push: 'items', value: { name: 'New item' } }
{ pop: 'items' }
```

### `removeAt`

Remove an element at a specific index.

```ts
{ removeAt: 'items', index: 0 }                  // remove first
{ removeAt: 'items', index: 2 }                  // remove third
```

### `clear`

Empty an array or object, or set a primitive to its zero value.

```ts
{ clear: 'items' }                               // → []
{ clear: 'user' }                                // → {}
{ clear: 'count' }                               // → 0
```

### `reset`

Reset the entire data store to the action's `data` defaults.

```ts
{ reset: true }
```

Use this in a "Cancel" or "Start over" handler.

---

## Effects

Effects can be async and may reach outside the action's data store. There are five.

### `call`

Invoke a named endpoint. Optional `onSuccess` and `onError` step branches run after the response.

```ts
{
  call: 'fetchUser',
  onSuccess: [
    { set: 'loading', value: false },
    { set: 'user', from: 'fetchUserResponse' },
  ],
  onError: [
    { set: 'loading', value: false },
    { set: 'errorMessage', value: '{{@error.message}}' },
  ],
}
```

The `onError` branch has access to a special **`@error`** scope inside templates: `{{@error.message}}`, `{{@error.status}}`, `{{@error.body}}`. Use it to surface error messages in the UI.

If the endpoint name doesn't exist in the action's `endpoints`, the call fails with a synthetic error and `onError` fires.

### `emit`

Publish a message on the shell's shared message bus. Other actions (on any canvas) with a matching `message:` trigger receive it.

```ts
{ emit: { channel: 'cart-updated' } }
{ emit: { channel: 'user-saved', payload: { id: '{{$.user.id}}' } } }
```

The `payload` is resolved against the current data — templates and bindings work.

### `push`, `pop`, `replace`

Navigation effects. They escape from the action via the shell's `onNavigate` callback and become canvas operations.

```ts
{ push: { action: 'edit-user' } }                          // push onto current canvas
{ push: { action: 'login', canvas: 'modal' } }             // push onto a different canvas
{ push: { action: 'edit-user', input: { id: 'u_42' } } }   // with initial data

{ pop: true }                                              // pop the current action

{ replace: { action: 'step2' } }                           // replace current with another
{ replace: { action: 'article-a', canvas: 'content' } }    // on a different canvas
```

The `pop` effect uses `pop: true` (a literal boolean) to distinguish it from the `pop` mutation (which takes a string path).

---

## Endpoints

Endpoints are named HTTP calls. Define them once in the action, invoke them via `{call: 'name'}` from any trigger.

```ts
endpoints: {
  fetchUser: {
    url: '/api/users/{{$.userId}}',
    method: 'GET',
    target: 'user',
  },
  saveUser: {
    url: '/api/users/{{$.user.id}}',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer {{$.token}}',
    },
    body: { name: '{{$.user.name}}', email: '{{$.user.email}}' },
    target: 'savedUser',
    errorTarget: 'lastError',
  },
}
```

### Endpoint fields

- **`url`** *(required)* — template URL. Bindings work.
- **`method`** *(required)* — `GET` | `POST` | `PUT` | `PATCH` | `DELETE`.
- **`headers`** *(optional)* — object of header name → value. Both names and values can be templated.
- **`body`** *(optional)* — request body. Either a string or an object. Object bodies are JSON-stringified after binding resolution.
- **`target`** *(optional)* — data path to write the parsed response into on success. If unset, the response is discarded.
- **`errorTarget`** *(optional)* — data path to write the error info into on failure.
- **`transform`** *(optional)* — a Prism config (or any object the injected transform function understands) applied to the response before it's stored. Useful for shaping API responses.

### The fetch implementation

The runtime needs a fetch implementation injected. The shell takes a `fetch?: FetchFn` config option. Default is the global `fetch` if available; otherwise endpoint calls fail.

For tests and the showroom, you inject a mock:

```ts
const mockFetch: FetchFn = async (url) => ({
  ok: true,
  status: 200,
  json: async () => ({ name: 'Ada Lovelace' }),
  text: async () => '{"name":"Ada Lovelace"}',
});

createShell({ ..., fetch: mockFetch });
```

---

## Lifecycle hooks

Run steps when the action transitions through its lifecycle states. Four hooks: `mount`, `unmount`, `suspend`, `resume`.

```ts
lifecycle: {
  mount: [
    { call: 'fetchUser', onSuccess: [{ set: 'loading', value: false }] },
  ],
  unmount: [
    { call: 'savePartialState' },
  ],
  suspend: [
    { set: 'wasSuspended', value: true },
  ],
  resume: [
    { set: 'wasSuspended', value: false },
  ],
}
```

### When each fires

- **`mount`** — once, when the action is pushed onto a canvas. Runs after `data` and `input` are merged but before triggers are attached.
- **`suspend`** — when another action is pushed on top, this action transitions from `active` → `suspended`. Triggers stay attached.
- **`resume`** — when the action above is popped, this action transitions from `suspended` → `active`.
- **`unmount`** — once, when the action is popped from the canvas (or the shell is disposed). Triggers detach AFTER the unmount steps run.

In **strict mode** (set `strict: true` on the shell), a failure inside a lifecycle hook surfaces on the next shell call as a `LifecycleError`. In **lax mode** (the default), it routes to the shell's `onError` telemetry and the lifecycle continues.

---

## The bindings inside steps

Step values can use bindings — same syntax as layout bindings.

```ts
// Set with a literal
{ set: 'count', value: 0 }

// Set from another path (copy)
{ set: 'previous', from: 'current' }

// Increment by a value from data
{ increment: 'total', by: '{{$.delta}}' }   // Wait — `by` is typed as number; templates here would need
                                             // the bare `{{ expr }}` form to preserve the number type.
```

Endpoint URL templates, body templates, header templates all resolve against the current data. The `@error` scope is available inside `onError` chains.

---

## The `@error` scope

When an endpoint call fails and the `onError` chain runs, the error is in scope as `@error`. Reference it via templates:

```ts
onError: [
  { set: 'errorMessage', value: '{{@error.message}}' },
  { set: 'errorStatus', value: '{{@error.status}}' },
],
```

Fields available on `@error`:
- `message: string`
- `status: number` (HTTP status, or 0 for network errors)
- `body: unknown` (the response body if any)
- `aborted?: boolean` (true if the call was aborted by an unmount)

---

## Action runtime methods

When you call `shell.getRuntime(instanceId)` you get a `PublicActionRuntime`:

```ts
type PublicActionRuntime = {
  readonly instance: ActionInstance;
  readonly definition: ActionDefinition;
  getData: () => Record<string, unknown>;
  setData: (next: Record<string, unknown>) => void;
  render: () => RenderNode[];
  onDataChange: (handler: DataChangeHandler) => Unsubscribe;
  onStatusChange: (handler: StatusChangeHandler) => Unsubscribe;
};
```

- **`getData`** — synchronous snapshot of the data store.
- **`setData`** — replace the entire data store with a new object. Use for tooling/debugging (the showroom's editable Data tab uses this). Normal mutations should go through triggers.
- **`render`** — produce the current `RenderNode[]` tree.
- **`onDataChange`** — subscribe to data changes. Returns an unsubscribe.
- **`onStatusChange`** — subscribe to status changes (`active`/`suspended`/`unmounted`). Returns an unsubscribe.

You don't construct runtimes directly — the shell does that. You access them via `shell.getRuntime(instanceId)`.

---

## Errors

Action-time errors all extend `NovaError`:

- **`LifecycleError`** — a step inside a lifecycle hook failed
- **`UnknownActionError`** — `shell.push(canvas, 'name')` where `'name'` isn't in `actions`
- **`DefinitionValidationError`** — an action definition fails Zod validation at shell init

In strict mode all of these throw. In lax mode they route through the shell's `onError` callback.

---

## Validation

Action definitions are validated against `ActionDefinitionSchema` when you pass them to `createShell`. Invalid definitions throw `DefinitionValidationError` with structured failures listing every Zod issue. So you cannot accidentally run an action with a malformed shape.

---

## Quick reference

```ts
type ActionDefinition = {
  id: string;
  name?: string;
  description?: string;
  layout?: LayoutNode | string;
  data?: Record<string, unknown>;
  triggers?: TriggerConfig[];
  endpoints?: Record<string, EndpointConfig>;
  lifecycle?: LifecycleConfig;
};

type TriggerConfig = {
  event?: string;       // OR message
  message?: string;
  ref?: string;
  do: Step[];
};

type Step = Mutation | Effect;

// Mutations
{ set: string, value: unknown }
{ set: string, from: string }
{ toggle: string }
{ increment: string, by?: number }
{ decrement: string, by?: number }
{ push: string, value: unknown }
{ pop: string }
{ removeAt: string, index: number }
{ clear: string }
{ reset: true }

// Effects
{ call: string, onSuccess?: Step[], onError?: Step[] }
{ emit: { channel: string, payload?: unknown } }
{ push: { action: string, canvas?: string, input?: object } }
{ pop: true }
{ replace: { action: string, canvas?: string, input?: object } }
```

For wiring actions onto a canvas via the shell, see `SHELL_DOCS.md`. For the layout language actions render through, see `LAYOUT_DOCS.md`.
