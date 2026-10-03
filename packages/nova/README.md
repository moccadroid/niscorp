# @niscorp/nova

Declarative, framework-agnostic UI runtime for actions composed from JSON
layouts and effects.

**Status:** on npm and live. The version is below 1.0; releases are compatible all the same — an app that works on one works on the next, and what should go is deprecated, not removed.

## Install

```bash
pnpm add @niscorp/nova @niscorp/prism @niscorp/strata zod
```

`@niscorp/prism`, `@niscorp/strata` and `zod` are required peers. Everything
else is optional and installed per surface: `react` for `/adapters/react`
and `/adapters/ink`, `vue` for `/adapters/vue`, `ink` and `ink-text-input` for
`/adapters/ink`, `@niscorp/cortex` for `/agent`. Node `>=22.12`.

## One tree, five renderers

Nova core renders layouts to plain `RenderNode[]` — no framework, no DOM,
no terminal. What consumes that tree is an adapter, and five ship here:

| adapter          | surface                   | interaction                                                |
| ---------------- | ------------------------- | ---------------------------------------------------------- |
| `adapters/react` | browser, your styled kit  | pointer + keyboard                                         |
| `adapters/vue`   | browser, your styled kit  | pointer + keyboard                                         |
| `adapters/dom`   | browser, zero framework   | pointer + keyboard                                         |
| `adapters/tty`   | any terminal, line REPL   | every interactive carries a `[n]` marker — type the number |
| `adapters/ink`   | any terminal, full-screen | the same `[n]` markers, plus focus and live typing         |

Same trees down, same `ui:click` / `ui:model` / `ui:key` events up — an app
renders in all five without changing a line, and a served host (see
`@niscorp/moss`) cannot tell them apart. The TTY numbering is computed once
and shared: `[7]` is the same interactive in the REPL and the TUI.

An adapter is a walker plus a component kit of ~15 domain-blind primitives.
[ADAPTER.md](ADAPTER.md) is the whole contract; the terminal adapters' APIs
are in [TERMINAL_DOCS.md](TERMINAL_DOCS.md); a Svelte or react-native
adapter is a sibling folder, built the way the Vue one is.

Components are decoupled from the shell — they receive only the layout's
`props` plus `children` / `novaModel`, and emit events via context hooks.
The React adapter additionally ships `<NovaRenderProvider>`,
`<NovaShellProvider>`, `<RenderTree>`, and the shell hooks; see
`REACT_DOCS.md`.

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

- **No LLM features in the core.** No prompt scaffolding, no plan generation.
  The one agent nova ships — the layout agent — is opt-in at `/agent` (see
  below).
- **No JSON Schema generation / catalog.** Use `z.toJSONSchema()` on
  the exported Zod schemas if you need JSON Schema externally.
- **No mandatory components.** The component registry is empty by
  default; opt-in reference kits ship at the adapter subpaths
  (`/adapters/react/components`, `/adapters/vue/components`,
  `/adapters/dom/components`, `/adapters/tty/components`, `/adapters/ink`).
- **No page around the screen.** Nova draws a shell to markup where there is
  no browser (the React hooks, Vue's server renderer, the DOM adapter's
  `renderToString`) and picks that markup up in the page — but the document,
  the paths and the checks a build makes are a host's (`@niscorp/cli`'s `nisc
  export`, or moss for a served shell). See the React compatibility section
  below.
- **No wire protocol.** Definitions are in-process objects, not a
  serialization format. The wire lives in moss; nova ships the render
  surface a remote terminal targets (`RenderApi`, flattened trees that
  keep `ActionSlot` identity).

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
  canvases: [{ id: 'main' }],
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
- `input` — optional JSON Schema of the `data` keys an opener may seed
  when loading the action (its openable-input contract; descriptive,
  not enforced by the runtime).
- `endpoints` — named HTTP or local-function call configurations, with
  optional `request`/`response` transform configs run by the injected
  evaluator.
- `triggers` — `(event | message) + ref → do: Step[]` bindings.
- `lifecycle` — `mount`, `unmount`, `suspend`, `resume` hooks, each a
  `Step[]`.
- `layout` — the layout to render.

A `Step` is either a **mutation** (one of `set`, `toggle`, `increment`,
`decrement`, `push`, `pop`, `removeAt`, `move`, `clear`, `reset`) or an
**effect** (`call`, `emit`, navigation `push`/`pop`/`replace`/`popTo`/`resetTo`/
`removeInstance`/`removeSelf`/`reconcile`, `reload`).
Mutations are op-per-file under `action/mutations/ops/`.

Every navigation step moves ONE action. `reconcile` is the one that moves as
many as data says: it makes a canvas hold exactly the actions a list in the
action's data names — missing ones pushed, unlisted ones removed, the rest kept
mounted (`shell/reconcile.ts`, as a step). A row naming an action the shell
does not have is skipped, as an ungranted `initial` candidate is.

```ts
{ reconcile: { canvas: 'tools', to: '$.tools', action: 'tool_id', own: 'canvas' } }
```

`action` names the row field holding the action id; `input` (optional) the field
holding its input. `own: 'pushed'` (default) removes only what this action placed
there — stamped with its definition id — while `'canvas'` treats the whole canvas
as the action's. Added at grammar `nisc.nova` 1: a reader at 0 refuses an action
that uses it (`TOO_NEW`).

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
`Shell` with `push`, `pop`, `popTo`, `removeInstance`, `replace`, `clear`,
`back`, `originOf`, `registerAction`, `removeAction`, `registerFragment`,
`addCanvas`, `removeCanvas`, `setCanvasLayout`, `setLayout`, `setPhrases`,
`getPhrases`, `getCanvasState`, `getRuntime`, `getState`,
`getShellRenderTree`, `getCanvasRenderTree`, `flattenRenderTree`,
`dispatch`, `publish`, `onStateChange`, `onDataChange`, `onEndpoint`,
`onCanvasChange`, `dispose`. Canvases are `CanvasConfig`s (`{ id, mode?,
actionLayout?, initial? }`) — a canvas can pre-seed its stack, declare how
its instances are arranged, and hold them as a `stack` (default: the top is
active, the rest suspended) or a `list` (every instance stays live). The shell maintains a stack per
canvas, drives lifecycle hooks via the runtime, composes any `with`
fragments into the action at push/replace time, and routes navigation
effects emitted from action steps back into shell calls.

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
├── UnknownFragmentError
├── UnknownFunctionError
├── ShellDisposedError
├── LifecycleError
└── MutationError
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

- **React 19 required** (peer `react ^19.2.4`). The adapter uses `useSyncExternalStore`.
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
- **SSR:** supported both ways a screen can be held. A shell that lives with
  its adapter — `<NovaShell>` and the shell-backed hooks — draws under
  `renderToString` (each hook's server snapshot is the shell's own value) and
  is adopted by `hydrateRoot` over a second boot of the same shell: await
  `shellSettled(shell)` before either, so both draw the whole first screen. A
  served screen — `NovaRenderProvider` + `RenderTree` over a `RenderApi` —
  renders with no store at all; that is how moss draws a page server-side and
  how its React target adopts it. `shellView(shell)` reads a local shell as
  that same `RenderApi`, which is how the DOM adapter draws one
  (`mountShell`, and `renderToString` from `/adapters/dom/server`). The DOM
  adapter replaces drawn markup on its first render and patches from then on:
  what did not change keeps its element (ADAPTER.md, "The DOM adapter keeps
  what did not change" — a DOM kit's contract is there).
- **React Server Components:** not tested. The hooks are client-only.

---

## Reflection and devtools

- **`@niscorp/nova/reflect`** — read-only introspection over definitions
  and live shells; pure and framework-free. `walkNodes` / `componentsOf` /
  `refsOf` / `loopVarsOf` (layout walks), `snapshotShell` /
  `describeInstance` (running state), `actionGraph` (emit/message wiring),
  `classifyAudit` / `auditCatalog` (closure-audit triage), `livenessOf` (what
  an action can still do once drawn: gestures, the channels it waits on, every
  endpoint and whether it is called on open or later).
- **`@niscorp/nova/devtools`** — a shell inspector built as pure nova:
  `devtoolsActions` (`devtools.dock`, `devtools.inspect` — plain
  ActionDefinitions over generic primitives), `DEVTOOLS_CANVAS`, and
  `createDevtoolsFunctions` serving the `devtools.*` fns (the endpoint
  timeline is a ring buffer fed by `shell.onEndpoint`). An app opts in by
  granting `devtools.*` to a dev role, adding the canvas plus a frame
  slot, and spreading the fns into its `functions(session)`.

---

## Agent and i18n

- **`@niscorp/nova/agent`** — the layout-authoring surface: `layoutAgent`
  (a `@niscorp/cortex` agent definition — intent + component palette + data
  example in, a `LayoutNode` out, validated against `LayoutNodeSchema`),
  `paletteFromRegistry` (the palette, read off a component registry's
  `meta`), and `collectInteractive` (a layout's refs, models and bound data
  keys, derived by walking the tree). Needs the optional peer
  `@niscorp/cortex`.
- **`@niscorp/nova/i18n`** — nova is language-blind: a host hands the shell a
  phrasebook (`phrases` on `ShellConfig`, `shell.setPhrases` at runtime) and
  nova swaps prose at render. The subpath holds the pieces around that:
  `translateRenderTree`, `fillPhrase`, and the harvest (`harvestLayout`,
  `harvestDefinition`, `harvestDefinitions`, `missingFrom`) that lists the
  phrases a dictionary must cover. See [I18N_DOCS.md](I18N_DOCS.md).

---

## The grammar and its versions

nova's documents — actions, fragments, layouts — are a grammar with a version,
published at **`@niscorp/nova/migrations`** for [strata](../strata/README.md):

- **`NOVA_SEQUENCE`** — the grammar sequence `nisc.nova`: its kinds
  (`nisc.nova/action`, `/fragment`, `/layout`), where documents nest inside
  them (a layout's `children`, `children[]`, `then`, `else`, `do`; an action's
  `layout` and its endpoints' `request`/`response`, which are Prism configs),
  and its migrations. Stored and submitted documents carry the stamp they were
  written at and are upgraded where they are read (moss does this for
  integration actions).
- **`NOVA_SCHEMAS`** — the Zod schema behind each kind, snapshotted by the
  repo's grammar gate (`pnpm check:grammars`).

**Changing a schema here is a migration** (AGENTS.md rule 18): an empty marker
appended to `NOVA_SEQUENCE` for an addition, document steps — a Prism config
over one node — for anything else. The gate refuses the change until it has
one, and checks every captured lab-app document still upgrades and parses.

---

## Building / dev

```bash
pnpm build       # tsup ESM + CJS + DTS
pnpm test        # vitest run
pnpm typecheck   # tsc --noEmit
```

The repo's root `tsconfig.json`, which this package's `tsconfig.json`
extends, carries an `ignoreDeprecations` workaround for `tsup`'s DTS bundler
injecting `baseUrl`. This is intentional and expected.

