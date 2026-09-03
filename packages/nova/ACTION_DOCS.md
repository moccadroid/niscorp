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
  title?: string;                          // resolvable instance label (e.g. '{{$.record.name}}'),
                                           // exposed as instance.title for stack-nav chrome
  layout?: LayoutNode | string;            // inline layout, or an id in the layout store
  data?: Record<string, unknown>;          // initial data merged with input on mount
  input?: Record<string, unknown>;         // JSON Schema of the data keys an opener may seed —
                                           // the openable-input contract (descriptive, not enforced)
  triggers?: TriggerConfig[];              // event/message → step bindings
  endpoints?: Record<string, EndpointConfig>;  // named HTTP or local-function calls
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

Triggers attach when the action mounts and detach when it unmounts. While the action is **suspended** (another action is pushed on top), triggers stay attached but do **not** fire — a suspended action reacts to nothing until it resumes, and the runtime's abort signal prevents in-flight async work from completing. On resume the `mount` hook re-runs (see [Lifecycle hooks](#lifecycle-hooks)), so the action refreshes its own data instead of reacting while backgrounded.

A `ui:model` trigger observes the value the event wrote: the runtime applies a `ui:model` to its own model bindings **before** it dispatches the event to triggers, so a trigger's steps read the just-typed value, not the one the field held before the keystroke.

---

## Steps

A step is either a **mutation** (sync, modifies the data store) or an **effect** (may be async, touches the outside world). Steps in a trigger's `do` array execute in order; mutations are applied as a batch when an effect or the end of the list is reached.

```ts
do: [
  { set: 'loading', value: true },              // mutation
  { call: 'fetchUser', onSuccess: [             // effect — the response lands at the endpoint's `target`
    { set: 'loading', value: false },           // mutation
  ]},
],
```

Mutations and effects share the same `do` slot — they're a discriminated union called `Step`.

---

## Mutations

Mutations are pure, sync operations that produce a new data store from the old one. There are 10 mutation kinds: `set`, `toggle`, `increment`, `decrement`, `push`, `pop`, `removeAt`, `move`, `clear`, `reset`.

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

The index can also be a template string (e.g. `"{{@event.payload}}"`) resolved before applying.

### `move`

Reorder an array element from one index to another.

```ts
{ move: 'items', from: 0, to: 2 }
{ move: 'items', from: '{{@event.payload}}', to: 0 }
```

`from` / `to` accept a number or a template string resolved before applying. An out-of-range `from` is a no-op; `to` is clamped into range.

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

Effects can be async and may reach outside the action's data store. There are ten: `call`, `emit`, `reload`, and the navigation effects `push`, `pop`, `replace`, `popTo`, `resetTo`, `removeInstance`, `removeSelf`.

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

The `onError` branch has access to a special **`@error`** scope inside templates: `{{@error.message}}`, `{{@error.status}}`, `{{@error.data}}`. Use it to surface error messages in the UI.

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
{ push: { action: 'edit-user', with: ['modal-frame'] } }   // composed with fragments

{ pop: true }                                              // pop the current action

{ replace: { action: 'step2' } }                           // replace current with another
{ replace: { action: 'article-a', canvas: 'content' } }    // on a different canvas
```

The `pop` effect uses `pop: true` (a literal boolean) to distinguish it from the `pop` mutation (which takes a string path).

`push`, `replace`, and `resetTo` accept an optional `with: [...]` — ids of `ActionFragment`s composed into the action before it is instantiated. Each fragment wraps the action (the action's layout fills the fragment's `{ slot: 'body' }`) and contributes its triggers/data; the action wins on conflict.

`input` values resolve against the current data plus the firing event, so a trigger can pass dynamic data to the action it opens — e.g. `input: { record: '@event.payload' }` or `input: { id: '@event.payload.todo_id' }`.

### `popTo`, `resetTo`

Stack-navigation effects.

```ts
{ popTo: { instance: 'act-3' } }                           // pop until this instance is on top
{ popTo: { canvas: 'main', instance: 'act-3' } }

{ resetTo: { action: 'home' } }                            // clear the canvas, push a new root
{ resetTo: { action: 'home', canvas: 'main', input: {...}, with: [...] } }
```

`popTo` unmounts everything above the given instance (a no-op if it isn't in the stack) — what a breadcrumb fires. `resetTo` clears the whole stack and pushes one new root — what a screen-level nav fires so drilling into a record doesn't leave a stale stack beneath the new screen.

### `reload`

```ts
{ reload: true }   // re-run THIS instance's mount hook
```

Re-reads the firing instance in place: same instance, same data object, no navigation. It re-runs whatever the action does on `mount`, which is the only definition of "current" the action itself has — a caller never names endpoints.

It exists for `mode: 'list'` canvases. A stack canvas suspends what it covers and `resume` already re-runs `mount`, so a revealed action is never stale; a list suspends nothing, so a card mounted once and opened much later would answer with the data it loaded then. `{ reload: true }` is what "opening it" means there. Harmless on an action with no `mount` hook.

---

## Endpoints

An endpoint is either a named HTTP call or a named local function call (`EndpointConfigSchema` is the union of the two). Define them once in the action, invoke them via `{call: 'name'}` from any trigger.

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
    request: { name: { $ref: '$.user.name' }, email: { $ref: '$.user.email' } },
    target: 'savedUser',
    errorTarget: 'lastError',
  },
}
```

### HTTP endpoint fields

- **`url`** *(required)* — template URL. Bindings work.
- **`method`** *(required)* — `GET` | `POST` | `PUT` | `PATCH` | `DELETE`.
- **`headers`** *(optional)* — object of header name → value. Values can be templated; names cannot.
- **`request`** *(optional)* — a transform config run by the **injected evaluator** (see below) over the action data to build the request body. Static parts are literal; dynamic parts use the evaluator's ops. A string result is sent as-is; anything else is JSON-stringified. Declaring `request` without an injected transform is a hard error — never a silent empty body.
- **`response`** *(optional)* — a transform config run by the injected evaluator over the reply **exactly as received** (`$` is the reply — object, array, or scalar; no wrapping) to produce the value stored at `target`. Declaring it without an injected transform is a hard error — never the unshaped reply.
- **`target`** *(optional)* — data path to write the (possibly transformed) response into on success. If unset, the response is discarded.
- **`errorTarget`** *(optional)* — data path to write the error info into on failure.

The evaluator is dependency-injected: `ShellConfig.transform` is a `(config, source) => unknown` function nova never interprets — the host wires in Prism's `evaluate` (or anything else). Initial data is never transformed.

### Function endpoints

The other side of the union: a call to a host-registered function instead of a URL.

```ts
endpoints: {
  exportCsv: { fn: 'exportCsv', target: 'exportResult' },
}
```

- **`fn`** *(required)* — key of a function registered in `ShellConfig.functions`. The handler receives `(data, signal)` and its return value is stored at `target`. An unregistered name fails the call.
- **`target`** / **`errorTarget`** — as above.

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

- **`mount`** — when the action is pushed onto a canvas (after `data` and `input` are merged, before triggers attach), and **again on every resume**, before the `resume` hook. A suspended action ignores everything while backgrounded, so re-running `mount` is what brings its data current when it is revealed again.
- **`suspend`** — when another action is pushed on top, this action transitions from `active` → `suspended`. Triggers stay attached but do not fire while suspended.
- **`resume`** — when the action above is popped, this action transitions from `suspended` → `active`. Runs after the re-run of `mount`.
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
- `status: number` (HTTP status, or 0 for network/function errors)
- `data: unknown` (the response body if any)
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

### `auditAction` — static wiring audit

A definition can parse, mount, and render politely while being broken at click time. `auditAction(def, { catalog? })` cross-references the definition against itself: layout bindings ↔ `data` defaults, layout refs ↔ triggers (dead chrome and phantom triggers both), `call` steps ↔ endpoint names, endpoint targets ↔ `data`, mutation paths ↔ `data`, and — when a `catalog` of `{ id, input }` entries is given — push/replace/resetTo targets and their seeded input keys. Returns `{ ok, issues: string[] }` with precise messages.

Scope: SELF-CONTAINED definitions with inline layouts (generated actions above all). Hand-authored actions that receive triggers from fragments or bind stored layouts should audit the COMPOSED definition, or skip.

---

## Quick reference

```ts
type ActionDefinition = {
  id: string;
  name?: string;
  description?: string;
  title?: string;                          // resolvable instance label for stack-nav chrome
  layout?: LayoutNode | string;
  data?: Record<string, unknown>;
  input?: Record<string, unknown>;         // JSON Schema — the openable-input contract
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
{ removeAt: string, index: number | string }
{ move: string, from: number | string, to: number | string }
{ clear: string }
{ reset: true }

// Effects
{ call: string, onSuccess?: Step[], onError?: Step[] }
{ emit: { channel: string, payload?: unknown } }
{ push: { action: string, canvas?: string, input?: object, with?: string[] } }
{ pop: true }
{ replace: { action: string, canvas?: string, input?: object, with?: string[] } }
{ popTo: { canvas?: string, instance: string } }
{ resetTo: { action: string, canvas?: string, input?: object, with?: string[] } }
{ removeInstance: { canvas?: string, instance: string } }
{ removeSelf: true }
{ reload: true }

// Endpoints (EndpointConfig = HTTP | Function)
{ url: string, method: string, headers?: object, request?: unknown, response?: unknown, target?: string, errorTarget?: string }
{ fn: string, target?: string, errorTarget?: string }
```

For wiring actions onto a canvas via the shell, see `SHELL_DOCS.md`. For the layout language actions render through, see `LAYOUT_DOCS.md`.
