# `@niscorp/nova` — Design

Declarative, framework-agnostic UI runtime. JSON layouts, action lifecycles,
shell orchestration. The core is pure TypeScript with zero framework
dependencies. Framework adapters (React, plain DOM) consume the
`RenderNode[]` output.

This document describes the package as it actually exists today. Anything
not implemented is called out as **Future work**.

---

## Architecture

Four core areas, one package. Each area imports across boundaries via the
path aliases `@shared`, `@layout`, `@action`, `@shell`. Local imports stay
relative.

```
┌─────────────────────────────────────────────────────────────┐
│  shell/        Public factory, canvas stacks, navigation,   │
│                lifecycle bookkeeping, telemetry.            │
├─────────────────────────────────────────────────────────────┤
│  action/       Definitions (Zod schemas), runtime, mutation │
│                ops, step executor, triggers, endpoints,     │
│                lifecycle hooks, model bindings.             │
├─────────────────────────────────────────────────────────────┤
│  layout/       Layout schemas, renderer, layout store,      │
│                component registry, RenderNode output.       │
├─────────────────────────────────────────────────────────────┤
│  shared/       Errors, ids, common utilities, bindings      │
│                (paths, scope chain, unified resolver),      │
│                data store, event bus, message bus.          │
└─────────────────────────────────────────────────────────────┘
```

The `shared/` module is the only one any other area imports from. Layout,
action, and shell never import from each other transitively except via
`@layout` / `@action` / `@shell` aliases at well-defined seams (the shell
wires everything together at construction time).

Around the core sit four subpath areas:

- **`adapters/`** — framework bindings (`react/`, `dom/`), each with its own
  export subpath. Adapters import only the core public surface; core never
  imports an adapter. See [ADAPTER.md](ADAPTER.md).
- **`reflect/`** — read-only introspection (`@niscorp/nova/reflect`): layout
  walks, shell snapshots, the action graph, audit classification. Imports
  `@action`/`@shell`/`@layout`; pure and framework-free.
- **`devtools/`** — the shell inspector (`@niscorp/nova/devtools`), built as
  plain ActionDefinitions plus fns over `reflect/`.
- **`agent/`** — cortex agents owned by nova (`@niscorp/nova/agent`);
  importing the subpath is what pulls in the optional cortex peer.

---

## `shared/`

The substrate. Everything else builds on this.

### `shared/errors.ts`

Domain error hierarchy. Classes are permitted **only here** because
identity (`instanceof`) is required for typed catch sites.

```
NovaError                         (base; carries code + context + cause)
├── RenderError                   (renderer subtree failure)
├── ComponentNotFoundError        (registry miss)
├── LayoutRefNotFoundError        (layout store miss)
├── DefinitionValidationError     (Zod failure at boundary)
├── UnknownActionError            (shell.push of unregistered id)
├── UnknownFragmentError          (push `with` names an unregistered fragment)
├── ShellDisposedError            (post-dispose call)
└── LifecycleError                (hook failure; carries hook + cause)
```

Subclasses are added only when there is a real throw site. No dead exports.

### `shared/bindings/`

Unified resolver. The core function is

```ts
resolve(value: unknown, chain: ScopeChain, extras?: ExtraScopes): unknown
```

It is the **only** binding-resolution entry point. Every binding site —
component props, conditional `if`, loop `for`, endpoint url/headers, trigger
emit channel, mutation operands — calls it. (An endpoint's `request`/`response`
are the exception: they run through the injected `transform` evaluator, not the
binding resolver — see `endpoints.ts`.)

Resolution rules:

- **String, sole `{{ expr }}`** → returns the raw resolved value (preserves
  type — number stays number, object stays object).
- **String, `"text {{expr}} text"`** → string interpolation.
- **String, bare `"$.path"` or `"$item.field"`** → raw resolved value.
- **String, anything else** → returned literally.
- **Object `{ $if, $then, $else }`** → conditional. The only directive form.
  `$else` is optional.
- **Array** → walked recursively.
- **Plain object** → walked recursively.

The previous `BindingSchema` value-form objects (`{ template: ... }`,
`{ if, then, else }`) **no longer exist**. The unified resolver replaced
them.

Scope chains are arrays of records, innermost first. `createScopeChain(data)`
returns `[data]`. Loops push a new scope on the front (`{ [as]: item }`).
`extras` is a separate flat record for non-scoped names like `@error`.

### `shared/data-store/`

A small reactive `Record<string, unknown>` store with `get`, `update`, and
`subscribe`. Used as the single source of truth per action runtime: the
runtime writes to it, the layout renderer reads from it via a narrow
`DataStoreView` (`{ get }`-only) interface.

### `shared/event-bus/`

Topic-based pub/sub. Validates events against `NovaEventSchema` before
dispatch. Used for ambient UI events such as `ui:model`. Handlers receive
typed `NovaEvent` payloads. Subscriptions return cleanup functions.

### `shared/message-bus/`

Channel-based pub/sub, distinct from the event bus. Carries
`MessageEnvelope` structures with a `channel` and arbitrary `payload`.
Trigger configs with a `message` field bind to this bus.

The two buses are **independent**. The previous `msg:<channel>` prefix
bridge through the event bus is gone.

### `shared/ids.ts`, `shared/common.ts`

`createIdFactory(prefix)` for instance/shell ids; small type guards
(`isObject`, `isString`, etc.); shared `Unsubscribe` type.

---

## `layout/`

### Schemas (`layout/schemas.ts`)

Zod schemas for the layout DSL:

- `LayoutPrimitiveSchema` — string, number, boolean, null.
- `ComponentNodeSchema` — `{ component, props?, children?, ref?, model?,
  events? }`.
- `ConditionalNodeSchema` — `{ if, then, else? }`.
- `LoopNodeSchema` — `{ for, as, key?, do }`.
- `LayoutRefNodeSchema` — `{ ref }`. Resolves against the layout store.
- `LayoutNodeSchema` — discriminated union of all of the above plus arrays.

### Renderer (`layout/renderer.ts`)

Walks a `LayoutNode` and emits a `RenderNode[]` tree:

```
RenderComponentNode  { type: 'component'; name; props; children;
                       ref?; model?: { ref, path } }
RenderTextNode       { type: 'text'; value }
RenderFragmentNode   { type: 'fragment'; children }
RenderErrorNode      { type: 'error'; message }
```

The renderer:

1. Resolves every binding via `@shared/bindings.resolve`.
2. Wraps every child render in a try/catch boundary. In **lax mode**,
   subtree failures become `RenderErrorNode`s; siblings continue. In
   **strict mode**, the throw escapes.
3. Looks up component metadata in the `ComponentRegistry`. Missing
   components throw `ComponentNotFoundError`.
4. Resolves `LayoutRefNode` against the `LayoutStore`. Missing refs throw
   `LayoutRefNotFoundError`.
5. Tracks absolute scope paths. When a `model: "$item.field"` appears
   inside a loop, the renderer materializes the absolute path
   (`items.0.field`) on the emitted `RenderComponentNode.model.path`.
   This is what makes two-way binding work for loop items.

### Layout store and registry

`LayoutStore.set` validates every layout against `LayoutNodeSchema` and
throws `DefinitionValidationError` on failure — boundary validation.

`ComponentRegistry` is a name → metadata map. Adapters fill it with their
own component implementations later.

---

## `action/`

### Schemas (`action/schemas/`)

Split into focused files:

- `effects.ts` — `CallEffect`, `EmitEffect`, navigation effects (`Push`,
  `Pop`, `Replace`).
- `triggers.ts` — `TriggerConfigSchema { event?, message?, ref?, do }`.
- `endpoints.ts` — `EndpointConfigSchema`: a function call `{ fn, target?,
  errorTarget? }` **or** an HTTP call `{ method, url, headers?, request?,
  response?, target?, errorTarget? }`. `request` is run by the injected
  `transform` evaluator over the action data to build the body; `response` is
  run over the reply exactly as received (`$` is the reply — object, array, or
  scalar; no wrapping) to produce the value stored at `target`. Both are opaque
  to Nova (the host injects the interpreter, e.g.
  Prism), so Prism stays an optional dependency; declaring either without an
  injected transform errors. The injected transform is endpoint-only — initial
  data is never transformed.
- `lifecycle.ts` — `LifecycleConfigSchema { mount?, unmount?, suspend?,
  resume? }`. Each is `Step[]`.
- `index.ts` — `StepSchema = Mutation | Effect`, `ActionDefinitionSchema`,
  exports.

### Mutations (`action/mutations/`)

**Op-per-file.** Each operator lives in `action/mutations/ops/{name}.ts`
and exports a `match` predicate plus an `apply` function. A registry
(`action/mutations/registry.ts`) dispatches by walking the ops and using
the first match. Adding a mutation is a new file, not an edit to a
giant switch.

Current ops: `set`, `toggle`, `increment`, `decrement`, `push`, `pop`,
`removeAt`, `clear`, `reset`.

Each op has its own Zod schema. The combined `MutationSchema` is the
union.

### Runtime (`action/runtime/`)

`createActionRuntime(config)` produces an `ActionRuntime`:

- **`runtime.ts`** — assembles the data store, abort controller,
  trigger handle, model listeners, status subscribers. Owns the
  lifecycle methods (`mount`, `unmount`, `suspend`, `resume`).
- **`lifecycle.ts`** — `buildInitialData` merges `definition.data` with
  input (clone only — no transform); `runLifecycleHook`
  invokes the hook's steps with `lifecycleHook` set on the step
  context. In strict mode it rethrows hook failures as `LifecycleError`;
  in lax mode it routes them through `ctx.onError`.
- **`steps.ts`** — `executeSteps` walks a `Step[]`. Mutations are
  buffered and flushed in batches; effects (`call`, `emit`, navigation)
  flush first, then run. `runCall` invokes endpoints via `callEndpoint`
  and routes success/failure through `onSuccess` / `onError` step
  branches. When a step is running inside a lifecycle hook
  (`ctx.lifecycleHook` set) and an unknown endpoint or unhandled
  endpoint failure occurs, `runCall` throws `LifecycleError` so the
  lifecycle wrapper can route it.
- **`endpoints.ts`** — pure `callEndpoint(...)` returning a `Result`.
  Honors `AbortSignal` from `ctx.signal`.
- **`triggers.ts`** — wires trigger configs to the event bus or
  message bus and runs their `do` steps when fired.
- **`render.ts`** — calls `renderLayoutFromStore` (or inline layout)
  with the action's data, returning `RenderNode[]`.
- **`model-bindings.ts`** — walks a `RenderNode[]` collecting
  `(ref, path)` pairs from `model` fields.

### Two-way binding

When the layout author writes `model: "$.user.name"` on a component, the
renderer emits `model: { ref, path: 'user.name' }` on the
`RenderComponentNode`. After every render, the runtime reconciles its
`ui:model` event-bus listeners against the live set of model refs:

- New ref → install a listener that, on `ui:model` events for that ref,
  applies a `set` mutation to `path`.
- Removed ref or changed path → tear down the old listener.

The framework adapter is responsible for emitting `ui:model` events on
the event bus when its inputs change.

### AbortSignal threading

Each runtime owns an `AbortController`. Its signal is threaded into every
`StepContext` and forwarded to `fetch` calls inside `callEndpoint`. On
`unmount`, the controller is aborted before any unmount hooks run, so
in-flight endpoint calls bail out. Unmount hooks themselves run on a
fresh (non-aborted) controller so they can perform their own final
async work.

### Public vs internal runtime types

The shell exposes runtimes via `shell.getRuntime(id)` typed as
`PublicActionRuntime`:

```
PublicActionRuntime = {
  readonly instance, definition;
  getData(); render();
  onDataChange(handler); onStatusChange(handler);
}
```

The wider internal `ActionRuntime` adds `mount`, `unmount`, `suspend`,
`resume`, `applyMutations`, `executeSteps`, `updateData`, `dispose`, and
the underlying `dataStore`. **It is not re-exported from the package
root.** Tests that exercise internals reach it via
`@shell/shell-internals.getInternalRuntime`.

---

## `shell/`

The user's entry point. Splits responsibilities across small files:

- **`shell.ts`** — public `createShell` factory. Composes everything,
  defines the public methods, holds the `pendingStrictError` slot, and
  owns the canvas map.
- **`runtime-registry.ts`** — instance-id → runtime map with subscribe
  hooks for telemetry.
- **`telemetry.ts`** — state-change, data-change, and endpoint subscriber
  lists. Endpoint events (`EndpointEvent`: name, `fn`/`http`, ok, status,
  ms, stamped with instance and canvas) are reported by `runCall` at the
  `callEndpoint` seam — the one point every call passes through, so a
  server shell whose actions are all `fn:` is observed exactly like an
  HTTP one. Aborted calls are not reported.
- **`navigation.ts`** — converts `NavigationEffect` (from inside an
  action's steps) into `push`/`pop`/`replace` calls on the shell.
- **`lifecycle-ops.ts`** — `unmountInstance`, `suspendTop`, `resumeTop`
  bookkeeping. Idempotent unmount via an internal `Set`.
- **`canvas.ts`** — pure stack: `pushInstance`, `popInstance`,
  `clearStack`, `peek`. No I/O.
- **`shell-internals.ts`** — `validateActions` (boundary Zod validation
  on the action map at construction), `snapshotCanvas`,
  `createRuntimeFactory`, and the test escape hatch
  `getInternalRuntime`.

### Public API

```
createShell(config: ShellConfig): Shell
```

`Shell` exposes:

```
push(canvasId, actionId, input?, fragments?): string
pop(canvasId): void
popTo(canvasId, instanceId): void
replace(canvasId, actionId, input?, fragments?): string
clear(canvasId): void
registerAction(definition): void
removeAction(actionId): void
registerFragment(fragment): void
addCanvas(config): void
removeCanvas(canvasId): void
setCanvasLayout(layout): void
setLayout(refId, layout): void
getCanvasState(canvasId): CanvasState
getRuntime(instanceId): PublicActionRuntime | undefined
getState(): StateSnapshot
getShellRenderTree(): RenderNode[]
getCanvasRenderTree(canvasId): RenderNode[]
flattenRenderTree(tree): RenderNode[]
dispatch(event): void
publish(channel, payload?): void
onStateChange(handler): Unsubscribe
onDataChange(handler): Unsubscribe
onEndpoint(handler): Unsubscribe
onCanvasChange(canvasId, handler): Unsubscribe
dispose(): void
```

`fragments` is a list of `ActionFragment` ids to compose the action with
before it is instantiated (same as a push/replace effect's `with: [...]`).
See "ActionFragment composition" below.

`push`, `pop`, `replace`, `clear`, `getCanvasState` are **synchronous**
in both lax and strict mode. The runtime's lifecycle methods are async
underneath, fired with `.catch(handleLifecycleRejection)`.

### Strict mode and error surfacing

`ShellConfig.strict: boolean` and `ShellConfig.onError?: (err) => void`
are plumbed through `ActionRuntimeConfig` into every `StepContext`.

- **Lax mode (default).** Lifecycle hook failures are caught inside
  `runLifecycleHook` and routed through `onError`. Renderer subtree
  failures become `RenderErrorNode`s. The shell never throws from a
  lifecycle hook.

- **Strict mode.** `runLifecycleHook` rethrows failures as
  `LifecycleError`. The shell catches the rejection in
  `handleLifecycleRejection` and stores it in a single
  `pendingStrictError` slot. The **next** public shell call
  (`push`/`pop`/`replace`/`clear`/`getCanvasState`) consumes the slot
  and throws the stored error before doing any work. Renderer failures
  in strict mode throw out of `render()`.

This is the documented contract: shell method signatures stay
synchronous; strict-mode lifecycle errors surface deterministically at
the next operation boundary. It is the only honest way to expose async
fire-and-forget failures via a synchronous API without making
`push`/`pop` return promises.

### Definition validation at boundaries

- `createShell` validates every entry in `config.actions` via
  `ActionDefinitionSchema.safeParse`, aggregating failures into a
  single `DefinitionValidationError`.
- `LayoutStore.set` validates every layout the same way.
- `runtime.executeSteps` validates `Step[]` input via
  `StepSchema.safeParse` before running.

### ActionFragment composition

An `ActionFragment` is a reusable **partial action** — every
`ActionDefinition` field optional, plus a `kind: 'fragment'` discriminator.
It is **abstract**: it lives in a separate registry (`ShellConfig.fragments`
/ `registerFragment`), can never be `push`ed as an action (its id isn't in
`actions`, so that throws `UnknownActionError`), and only exists once merged.
Because it is pure data it ships in a DB row and an agent can author it; a
reference (`with: ['modal']`) collapses an arbitrary amount of chrome to a
single token in the model's context.

Composition is **call-site**, not on the action — an action never knows where
it renders, so the modal-ness lives on the push: `{ push: { action:
'new-contact', with: ['modal'], canvas: 'modal' } }`. The same `with: [...]` is
accepted on a `replace` effect and on a canvas `initial` seed (`{ action,
with }`), and as the `fragments?` arg of `shell.push`/`replace`.
`composeAction(action, fragments[])` produces the effective `ActionDefinition`
that spawns:

- **layout** — `fillSlots(fragment.layout, { body: action.layout })`: the
  fragment is the outer chrome, the action's own layout is dropped into the
  fragment's `{ slot: 'body' }` node. The fragment wraps; the action is the
  innermost content. Multiple fragments fold in array order (last listed is
  outermost). An unfilled slot renders nothing.
- **data / endpoints** — shallow-merge, **action wins** on conflict.
- **triggers** — concat, fragment's first (so a fragment's `close`/`cancel`
  and the action's `confirm` coexist; authors keep refs distinct).
- **lifecycle** — per-hook concat, fragment steps run before the action's.
- **id / name / description** — the action's. The result is a full
  `ActionDefinition` with no `kind` — composition, not inheritance.

`slot` is a fourth layout placeholder (beside `LayoutRef`): `{ slot: name }`,
filled only at compose time by `fillSlots`. A slot that survives to the
renderer was never filled, so the renderer emits nothing for it. This is the
single seam a fragment uses to wrap an action; named/multiple slots are future
work (v1 fills one `body` slot with the action's `layout`).

---

## Data flow (push to render)

1. User calls `shell.push('main', 'A', input)`.
2. `validateActions` already passed at construction. `getDefinition('A')`
   returns the validated `ActionDefinition`. When the call carries
   `fragments` (or the effect a `with: [...]`), `composeAction` folds the
   named fragments into the definition first (see "ActionFragment
   composition"); the merged result is what spawns.
3. `ops.suspendTop(canvas)` runs the previous top's `suspend` hook
   (fire-and-forget; strict mode wires errors back).
4. `spawn` calls `buildRuntime` → `createActionRuntime`. The runtime
   builds its data store from `definition.data` merged with `input`,
   creates an `AbortController`, registers triggers.
5. `runtime.mount(input)` is fired and not awaited. It runs the
   `mount` lifecycle hook via `runLifecycleHook`, then transitions to
   `active`. Failures route through the strict/lax pipeline.
6. The new instance is pushed onto the canvas; `fireState()` notifies
   state subscribers.
7. The adapter (when one exists) calls `runtime.render()` which returns
   `RenderNode[]`. The runtime reconciles model bindings against the
   produced tree.

---

## Future work

The following are explicitly **not implemented** and have no design
yet beyond a placeholder:

- ~~**React adapter.**~~ **Implemented.** See "React adapter" below.
- ~~**Headless component primitives.**~~ **Implemented.** Reference kits
  ship at `/adapters/react/components`, `/adapters/dom/components`,
  `/adapters/tty/components`, and `/adapters/ink`.
- **Wire protocol.** No serialization format for shipping *definitions*
  across processes. Serving rendered trees over a socket is moss's job;
  nova ships the surface it targets (`RenderApi`, ActionSlot-preserving
  `flattenRenderTree`).
- **Schema versioning.** Breaking changes in 0.x are unversioned.
- **LLM tooling / JSON Schema generation / catalog.** Excluded by
  design — nova is a runtime, not a generator.

---

## React adapter

The React adapter lives under `src/adapters/react/` and ships at the
`@niscorp/nova/adapters/react` subpath. It is a thin layer over the
framework-agnostic core — no shell logic lives in React, and React is a
peer (optional) dependency of the core package.

### Two-provider pattern

There are deliberately two providers:

- **`<NovaRenderProvider>`** — pairs a component registry with a
  `dispatch` and `publish` function. It does NOT require a shell. This
  is the minimum needed to render a `RenderNode[]` into React. Use it
  for static layouts, snapshot tests, or any scenario where you have
  data but no orchestrator.
- **`<NovaShellProvider>`** — a thin wrapper around `<NovaRenderProvider>`
  that ALSO exposes a `Shell` via context. Internally it derives
  `dispatch`/`publish` from `shell.dispatch` / `shell.publish` and
  forwards them to the inner render provider. Hooks like `useShellState`,
  `useCanvas`, `useRenderTree`, `useActionData`, `useActionStatus`
  require a `<NovaShellProvider>` ancestor; the bare hooks
  (`useNovaDispatch`, `useNovaPublish`, `useNovaRegistry`) work under
  either.

### The provider does NOT own the shell

This is a deliberate contract. `NovaShellProvider` never calls
`shell.dispose()` on unmount or on shell-prop change — it merely
re-points its context. Lifecycle ownership stays with the consumer that
created the shell. This is verified by `test/react/shell-swap.test.tsx`,
which spies on `shell.dispose` and asserts it is never invoked. Swapping
the `shell` prop causes hooks to resubscribe to the new shell on the
next render via the standard `useSyncExternalStore` plumbing.

### Component prop injection is minimal

A nova component registered with the React adapter receives:

- `children?: ReactNode` — populated when the layout node has children
- `novaModel?: { ref, path }` — populated when the layout node has a
  `model:` binding (so the component can dispatch `ui:model` events)
- ...the layout node's `props` spread on top

That's it. Components do not receive a `shell`, an `instanceId`, an
`onChange`, or any other framework-supplied callback. If a component
needs to emit, it calls `useNovaDispatch()` or `useNovaPublish()`. If a
component needs to introspect the registry, it calls
`useNovaRegistry()`. New props on the `NovaComponentProps` bag require
explicit justification — see `CONTEXT.md`.

### The `slotWrapper` seam

Cross-cutting rendering concerns — enter/leave animation, auth / feature
gates, logging, error boundaries — do not belong in the core. Animation in
particular is fickle and opinionated (framer-motion vs react-transition-group
vs plain CSS), so the core owns **none** of it. Instead the React adapter
exposes a single seam: an optional `slotWrapper` component, threaded through
`NovaRenderContext` (so it reaches deeply-nested slots) and accepted on
`<Nova.Shell>` and both providers.

Deliberate boundaries:

- **Adapter-only, never core.** `slotWrapper` is a React component — it lives
  in `src/adapters/react`, not in `ShellConfig` or any schema. The core stays
  serializable data + a state machine; a future Vue adapter would expose its
  own equivalent. Nothing here touches `LayoutNode`, so a model-authored (or
  DB-stored) layout never carries animation/gate concerns.
- **One seam: `ActionSlot`.** That is the single place an instance's content
  mounts and unmounts. `CanvasSlot` is a router (it expands to `ActionSlot`s),
  so it is not wrapped — there is exactly one place a wrapper exists, which is
  why the wrapper takes no `kind` discriminator.
- **Identity, not state.** The wrapper receives `{ canvasId, instanceId,
  action }` (resolved from `shell.getRuntime(instanceId)`), never the live
  data. `canvasId`/`action` are the policy axes (route by region or by
  `action.id`); `instanceId` is the keying axis. Passing live data would turn
  a presence/gate seam into a reactive render path — the wrong tool.
- **Persistent render, no timing.** When a `slotWrapper` is present,
  `ActionSlot` renders it even with no active instance (`children` becomes
  `null`, identity becomes `undefined`), so a presence-managing wrapper can
  hold and animate the leaving content. The core disposes the instance
  immediately on pop; nova never waits on `animationend` or any completion
  callback — the wrapper (and whatever library it plugs in) owns the exit
  lifecycle entirely.
- **Passthrough default.** With no `slotWrapper`, `ActionSlot` renders exactly
  as before. Generated layouts that introduce new canvases flow through the
  same single wrapper and hit its default branch — nothing is registered per
  slot.

Verified by `test/react/slot-wrapper.test.tsx` (correct identity, passthrough
default, and that the wrapper still mounts for an empty slot so exits can run).

### Snapshot caching strategy

Both `useRenderTree` and `useCanvas` cache their snapshot via `useRef`
so `useSyncExternalStore`'s `getSnapshot` returns a stable reference
when nothing has changed. This is mandatory for tearing-safety in
React 18 concurrent rendering.

- **`useRenderTree`** caches by **data identity**. The runtime exposes
  the current data object; if the cached data reference is `===` to the
  current one, the cached `RenderNode[]` is returned unchanged. When
  the runtime mutates data, the new data object replaces the old, the
  cache misses, the layout is re-rendered, and the new `RenderNode[]`
  becomes the cached snapshot. A missing instance returns a singleton
  `EMPTY` constant so re-renders are also stable in that case.
- **`useCanvas`** caches via a structural comparison helper
  (`sameActive`) over the canvas's stack length, active id, and per-
  frame `(id, status)` tuples. If two consecutive `getCanvasState`
  results compare equal under that helper, the cached value is reused;
  otherwise the new state is captured and the React store is notified.

Both contracts are verified by `test/react/snapshot-stability.test.tsx`,
which asserts referential equality across re-renders without state
changes and reference inequality after a real data or stack change.

### React 18+ compatibility

- Requires React 18 or later (uses `useSyncExternalStore`).
- Concurrent rendering: tearing-safe by construction.
- StrictMode: works correctly; snapshot caches survive effect double-
  invocation.
- Suspense: not used as a loading model. Loading state is explicit data
  on the action. Nova hooks never throw promises.
- SSR: not enabled — hooks lack a `getServerSnapshot` parameter. Adding
  SSR is a small per-hook change (each hook's `getSnapshot` already
  returns a serializable value; only the `subscribe` side needs a
  no-op for the server path).
- React Server Components: not tested. Hooks are client-only.

---

## Serving trees: `RenderApi` and flattening

A remote renderer (a moss terminal) never holds a shell; it is handed a
`RenderApi` — `frame()`, `canvasTree(canvasId)`, `dispatch(canvasId, event)`,
`publish(channel, payload?)`. One shape shared by the DOM adapter, the React
terminal target, and moss's conductor, aliased rather than redeclared, so a
renderer written against one host drops onto another. Origin stamping is the
host's job, not the renderer's.

`flattenRenderTree` resolves `CanvasSlot` markers away but keeps the
`ActionSlot` marker: a component node with
`props: { instanceId, canvasId, definitionId }`, `key: instanceId`, children
= the instance's rendered tree. Deliberate: a served tree must still carry
instance identity, so a remote renderer can key by instance (a swap remounts
— no stale DOM state crossing instances, enter animations fire) and a
terminal-side slot wrapper has a seam. Identity only, never the definition —
wire weight.

## DOM adapter

`src/adapters/dom/` (`@niscorp/nova/adapters/dom`) renders a served tree to
vanilla DOM against a `RenderApi`: events wired by convention (`ref` →
`ui:click`, `model` → `ui:model`/`ui:key`), `debounce` honoured, focus and
caret captured/restored across full rebuilds (ADAPTER.md §6). Its components
kit (`/adapters/dom/components`: `defaultRegistry`, `fallback`,
`DEFAULT_CSS`, `ROOT_CLASS`) is the batteries-included reference set. It
exists as the proof that a terminal needs no framework — and as the adapter
sibling that keeps the adapter contract honest.

## Terminal adapters

`src/adapters/tty/` renders a served tree to plain text: `createTtyView` is
a pure `RenderApi` → `{ text, interactives }` — no framework, no I/O, no
node builtins. The walker applies the event conventions itself (`ref` →
a numbered `[n]` marker registered as a click, `model` → model/toggle by
value type), so the interactives table is a complete, ordered action space
a host maps commands (or an agent's tool calls) onto. `src/adapters/ink/`
is the full-screen sibling: an Ink component kit riding the REACT walker
(the walker is renderer-agnostic — zero react-dom), with the same `[n]`
markers resolved through `CanvasMarkersContext` — the host computes the
numbering by running the TTY walker over the same trees, so both terminals
agree on what `[7]` is. Marker identity is the click payload for
click-kinds (a list's rows share one ref) and sibling order for
model-kinds. See TERMINAL_DOCS.md.

## Reflect and devtools

`reflect/` formalizes the walks moss and app devtools kept re-deriving.
Everything in nova is closed, validated data — definitions, layouts, the
live shell — so introspection can be complete, a thing no code-based UI
framework offers. Structural walkers (`walkNodes`, `componentsOf`, `refsOf`,
`loopVarsOf`), shell state (`snapshotShell`, `describeInstance`), the action
adjacency (`actionGraph`), and audit triage (`classifyAudit`,
`auditCatalog`). Pure, framework-free, read-only.

`devtools/` is the consumer proof: the dock and inspector are plain
ActionDefinitions over generic primitives (Panel, JsonTree), so they render
in any terminal. `createDevtoolsFunctions` builds the `devtools.*` fns per
session — a closure over that session's shell, no module globals, so
introspection is per-session-correct under moss. The endpoint timeline is a
capped ring buffer fed by `shell.onEndpoint` (notify-then-pull: the fn is
the pull), and the devtools canvas excludes itself so the inspector never
observes its own traffic.
