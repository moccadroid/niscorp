# @niscorp/nova

Declarative, framework-agnostic UI runtime for actions composed from JSON
layouts and effects.

**Status:** `0.x.x` — pre-1.0, breaking changes expected.

Framework adapter: `@niscorp/nova/react` ships a React adapter with
`<NovaRenderProvider>`, `<NovaShellProvider>`, `<RenderTree>`, and hooks
(`useShell`, `useShellState`, `useCanvas`, `useRenderTree`,
`useActionData`, `useActionStatus`, `useNovaDispatch`, `useNovaPublish`).
Components are decoupled from the shell — they receive only the
layout's `props` plus `children` / `novaModel`, and emit events via
context hooks.

An optional `slotWrapper` prop wraps every action instance's content at
its mount/unmount seam — one pluggable point for animation, auth / feature
gates, logging, or error boundaries, with nova owning none of that logic.
See `REACT_DOCS.md`.

---

## What it is

Nova is a runtime for **actions**: stateful units of work backed by data,
endpoints, triggers, lifecycle hooks, and a JSON layout. A `Shell` hosts
a stack of action instances per **canvas** (a logical surface — a screen,
a panel, a modal stack), drives their lifecycle, and routes events and
messages between them.

The core is pure TypeScript with **zero framework dependencies**. The
renderer produces a `RenderNode[]` tree — a plain JSON-shaped structure
that any framework adapter (React, Vue, headless test harness) can turn
into real elements. Layout, action, and shell logic are all testable
without ever importing a UI framework.

What makes it different from "just another UI library":

- **Declarative.** Layouts and actions are JSON. The runtime walks them.
- **Headless core.** No framework lock-in. Adapters are thin.
- **Two-way binding** built into the layout DSL via `model: "$.path"`.
- **Strict / lax modes** that decide whether errors throw or are
  surfaced via `onError`.

## What it isn't

Explicitly out of scope right now:

- **No LLM features.** No prompt scaffolding, no plan generation.
- **No JSON Schema generation / catalog.** Use `z.toJSONSchema()` on
  the exported Zod schemas if you need JSON Schema externally.
- **No built-in components.** The component registry is empty by default.
- **No SSR yet.** Nova hooks don't pass a `getServerSnapshot` to
  `useSyncExternalStore`, so calling them during server rendering throws.
  See the React compatibility section below.
- **No wire protocol.** Definitions are in-process objects, not a
  serialization format.

---

## Quick example

```ts
import {
  createShell,
  createComponentRegistry,
  createLayoutStore,
  type ActionDefinition,
} from '@niscorp/nova';

const counter: ActionDefinition = {
  id: 'counter',
  data: { count: 0 },
  triggers: [
    {
      event: 'ui:click',
      ref: 'inc',
      do: [{ increment: 'count' }],
    },
  ],
  layout: {
    component: 'Box',
    children: [
      { component: 'Text', props: { value: '{{$.count}}' } },
      { component: 'Button', ref: 'inc', props: { label: '+1' } },
    ],
  },
};

const shell = createShell({
  canvases: ['main'],
  registry: createComponentRegistry(),
  layoutStore: createLayoutStore(),
  actions: { counter },
});

const id = shell.push('main', 'counter');
const runtime = shell.getRuntime(id);
console.log(runtime?.render());
// → RenderNode[] tree describing the Box / Text / Button
```

There is no React in that example. A framework adapter would consume
the same `RenderNode[]` and produce real elements.

---

## The three subsystems

### Layout

A JSON tree of components, conditionals, loops, refs, and primitives.
`renderLayout(node, data)` walks the tree, resolves bindings, and emits
`RenderNode[]`. Bindings come in two forms:

- `"$.user.name"` — bare path, returns the raw value.
- `"Hello {{$.user.name}}"` — interpolated string.

Conditionals at the value level use `{ $if, $then, $else }`. Layout
nodes also have first-class `if` / `for` / `ref` shapes. See
`LayoutNodeSchema`.

### Action

A stateful unit. An `ActionDefinition` carries:

- `data` — the initial state record.
- `endpoints` — named HTTP-ish call configurations.
- `triggers` — `(event | message) + ref → do: Step[]` bindings.
- `lifecycle` — `mount`, `unmount`, `suspend`, `resume` hooks, each a
  `Step[]`.
- `layout` — the layout to render.

A `Step` is either a **mutation** (one of `set`, `toggle`, `increment`,
`decrement`, `push`, `pop`, `removeAt`, `clear`, `reset`) or an
**effect** (`call`, `emit`, navigation `push`/`pop`/`replace`).
Mutations are op-per-file under `action/mutations/ops/`.

The runtime is a closure factory (`createActionRuntime`) — no classes.
It owns a reactive data store, an `AbortController`, the trigger
handles, and the model-binding listeners.

An `ActionFragment` is a reusable partial action (every field optional, a
`kind: 'fragment'` marker) — layout chrome plus wired triggers/data. It is
composed into a concrete action at the call site via a push/replace
`with: ['id']`: the fragment wraps the action, dropping the action's layout
into its `{ slot: 'body' }`; the action wins on conflict. Pure data, so it
ships in a DB row and can be referenced rather than inlined.

### Shell

The orchestrator. `createShell(config)` validates every action
definition at construction (boundary Zod validation) and returns a
`Shell` with `push`, `pop`, `replace`, `clear`, `registerAction`,
`registerFragment`, `getCanvasState`, `getRuntime`, `onStateChange`,
`onDataChange`, `dispose`. It maintains a stack per canvas, drives
lifecycle hooks via the runtime, composes any `with` fragments into the
action at push/replace time, and routes navigation effects emitted from
action steps back into shell calls.

---

## Authoring

The Zod schemas are the source of truth and are validated at every
boundary. They are exported from the package root:

- `LayoutNodeSchema`, `ComponentNodeSchema`, `ConditionalNodeSchema`,
  `LoopNodeSchema`, `LayoutRefNodeSchema`, `SlotNodeSchema`
- `ActionDefinitionSchema`, `ActionFragmentSchema`, `MutationSchema`,
  `StepSchema`, `EffectSchema`, `TriggerConfigSchema`,
  `EndpointConfigSchema`, `LifecycleConfigSchema`

Boundary throws use `DefinitionValidationError` with a structured
`failures` array.

---

## Errors and strict mode

`ShellConfig` accepts `strict?: boolean` and `onError?: (err) => void`.

- **Lax mode (default).** Lifecycle failures route through `onError`.
  Renderer subtree failures become `RenderErrorNode`s and siblings
  continue.
- **Strict mode.** Lifecycle failures rethrow as `LifecycleError`. Shell
  methods stay synchronous, so the error is stored in a one-slot
  buffer and surfaces at the **next** public shell call (`push`,
  `pop`, `replace`, `clear`, `getCanvasState`). Renderer failures
  throw out of `render()`.

The error hierarchy lives in `shared/errors.ts`:

```
NovaError
├── RenderError
├── ComponentNotFoundError
├── LayoutRefNotFoundError
├── DefinitionValidationError
├── UnknownActionError
├── ShellDisposedError
└── LifecycleError
```

All carry a stable `code` (`ErrorCodes.*`), an optional `context`, and
a JS-native `cause`.

---

## Two-way binding

A layout component can declare `model: "$.user.name"`. The renderer
emits `model: { ref, path: 'user.name' }` on the corresponding
`RenderComponentNode`. The action runtime auto-installs a `ui:model`
event listener for that `ref`. The framework adapter is responsible
for emitting `ui:model` events on the event bus when its inputs
change; the runtime responds by applying a `set` mutation to the
configured path.

`model` paths inside loops are resolved to **absolute** paths
(`items.0.value`) by the renderer using its scope-path tracker, so
loop items round-trip correctly.

---

## Async safety

Every `StepContext` carries an `AbortSignal` from a runtime-owned
`AbortController`. `callEndpoint` forwards the signal to `fetch`. On
`unmount`, the controller is aborted, so in-flight calls bail out
without leaks. Unmount hooks themselves run on a fresh signal so they
can perform their own final async work (e.g. telemetry flush).

---

## React compatibility

- **React 18+ required.** The adapter uses `useSyncExternalStore`.
- **Concurrent rendering:** fully supported. `useSyncExternalStore` is
  tearing-safe by design — the snapshot getters in `useRenderTree` and
  `useCanvas` return referentially-stable values when the underlying data
  or canvas hasn't changed, which the reference-stability tests verify.
- **StrictMode:** supported. Snapshot caches correctly handle effect
  double-invocation; nothing tears and no "snapshot returned different
  values" warning appears.
- **Suspense:** not used as a loading model. Loading state is explicit
  data on the action (e.g. `{loading: true}` as a regular field), so the
  layout renderer reacts to it through data bindings. Consumers can still
  wrap nova components in `<Suspense>` but it never activates — nova
  hooks never throw promises. This is intentional: actions model their
  async state as data so layouts can bind to it directly, rather than
  unwinding the tree for Suspense to catch.
- **SSR:** not enabled yet. `useSyncExternalStore` requires a
  `getServerSnapshot` for SSR; nova hooks don't currently provide one.
  Adding SSR is a small per-hook change. Until then, calling nova hooks
  during server rendering throws "no server snapshot available".
- **React Server Components:** not tested. The hooks are client-only.

---

## Building / dev

```bash
pnpm build       # tsup ESM + CJS + DTS
pnpm test        # vitest run
pnpm typecheck   # tsc --noEmit
```

The `tsconfig.json` carries an `ignoreDeprecations` workaround for
`tsup`'s DTS bundler injecting `baseUrl`. This is intentional and
expected.

---

## Future work

- SSR support for the React adapter (`getServerSnapshot` on each hook)
- Headless component primitives shipped with the package
- Wire protocol for shipping action / layout definitions across
  processes
- Schema versioning for non-breaking 1.x evolution
