# Nova adapter contract

Nova's core is framework-free. It renders layout trees into `RenderNode[]`
and owns all state, events, and subscriptions. An adapter binds that to a UI
framework. Adapters live under `src/adapters/`, one folder per framework with
its own export subpath. Four reference implementations ship: the React
adapter (`@niscorp/nova/adapters/react`), the plain-DOM adapter
(`@niscorp/nova/adapters/dom`, `createDomView` — no framework at all), the
line-terminal adapter (`@niscorp/nova/adapters/tty`, `createTtyView` — a
pure render to `{ text, interactives }`; the host maps commands onto the
numbered interactives), and the full-screen terminal kit
(`@niscorp/nova/adapters/ink` — an Ink component vocabulary riding the React
adapter's walker; Tab cycles focus, Enter activates). A Vue or Svelte
adapter is a sibling folder, built the same way.

A react-shaped host that is not the DOM threads three optional seams through
`NovaRenderProvider`: `fallback` (unregistered names render their children
instead of an error marker), `textWrapper` (ink forbids bare strings outside
`<Text>`; the DOM renders them raw), and `errorMarker` (the default is a
`<span>`, which crashes a non-DOM renderer). Browser consumers omit all
three. A `ref`'d node rendered by a permissive fallback must still be
actionable — the TTY walker marks refs universally, so a kit-level fallback
(ink's) carries the focus + click convention itself.

An adapter imports only from `@niscorp/nova`'s public surface (plus its own
framework). Core never imports from an adapter.

## Obligations

An adapter must provide six things.

### 1. A RenderNode walker

Map `RenderNode[]` to framework elements:

- `text` → a text node.
- `fragment` → its children, keyless grouping.
- `error` → a visible marker carrying `code` and `message` (the React
  adapter renders a `<span data-nova-error>`; match that convention).
- `component` → look the name up in the registry; unknown names render an
  error marker with code `COMPONENT_NOT_FOUND`, never throw.

Inject framework props from the node using the core constants:
`node.model` → `NOVA_MODEL_PROP` (`{ ref, path }`), `node.ref` →
`NOVA_REF_PROP` (string). Spread `node.props` on top.

List identity comes from core's `renderNodeKey(node, index)`. Do not invent
key rules.

### 2. Dependency injection for registry, dispatch, publish

Rendered components never touch the shell. The adapter provides a component
registry, a `dispatch(event)` function, and a `publish(channel, payload)`
function through the framework's DI (React context, Vue provide/inject).
Without a shell, dispatch and publish are no-ops so static layouts render
with no event infrastructure.

### 3. Subscription bindings

Bridge core subscriptions into the framework's reactivity:

- `shell.onStateChange(handler)` — whole-shell snapshots.
- `shell.onCanvasChange(canvasId, handler)` — one canvas; the shell owns
  the equality check and only fires on meaningful change.
- `runtime.onDataChange(handler)` / `runtime.onStatusChange(handler)` — one
  action instance (via `shell.getRuntime(instanceId)`).

Trees come from `shell.getShellRenderTree()`, `shell.getCanvasRenderTree(id)`,
and `runtime.render()`. Recompute on the matching subscription, not on a
timer or a broader signal.

A remote renderer (a moss terminal) has no shell to subscribe to; it is
handed core's `RenderApi` instead — `frame()`, `canvasTree(canvasId)`,
`dispatch(canvasId, event)`, `publish(channel, payload?)` — and re-renders
when its host says so. The DOM adapter's `createDomView` consumes exactly
this shape.

### 4. Structural slots and the component vocabulary

Register two structural components under the core names `CANVAS_SLOT_NAME`
and `ACTION_SLOT_NAME` — the shell's default layouts reference them:

- **CanvasSlot** (`{ canvasId }`): renders that canvas's tree; nothing when
  `canvasId` is missing.
- **ActionSlot** (`{ instanceId }`): renders that instance's tree; nothing
  when `instanceId` is missing. Wrap the dispatch handed to the instance's
  subtree with core's `scopeDispatch(dispatch, instanceId)` so its UI events
  reach its own triggers only. Do not reimplement the stamping rule.

`flattenRenderTree` resolves `CanvasSlot` markers away, but the `ActionSlot`
marker *survives* flattening: it arrives as a component node with
`props: { instanceId, canvasId, definitionId }`, `key: instanceId`, and the
instance's rendered tree as children. An adapter rendering flattened (served)
trees must key by instance so a swap remounts, and may read the identity
props (a slot wrapper's seam).

The registered ActionSlot's `propsSchema` stays the *authoring* contract —
`instanceId` only. The flatten-stamped identity props are runtime output,
never authored, so they don't belong in the schema (the layout agent's
palette reads it as "props you may set"). Do not validate served trees
against registry schemas — that checks output against an authoring contract.

Ship the primitive vocabulary — Stack, Text, Input, Button, Box at minimum,
plus the introspection primitives Panel and JsonTree (nova's devtools compose
against them) — with static `meta` (description + props schema) so registries
and agent tooling can introspect them. The DOM kit additionally ships Row,
Grid, Checkbox, Textarea, and Table, with Select and Switch as aliases of
Input and Checkbox.

### 5. SlotWrapper persistence

If the adapter supports an app-supplied slot wrapper (animation, gating,
logging at the ActionSlot seam), the wrapper renders *persistently* — with
content or with none — so a presence-managing wrapper can animate an
instance leaving. The adapter hands the wrapper identity only (`canvasId`,
`instanceId`, the `ActionDefinition`), never live state; identity fields are
undefined while the slot is empty or exiting. Nova owns no timing.

### 6. Remote round-trip obligations

The shell may be authoritative over a socket (moss serves canvas trees down,
`NovaEvent`s up), so a bound input's echo is *asynchronous* — the tree carrying
the value you just typed arrives a round trip later. Two behaviours that a local
shell gets for free (its echo is synchronous) an adapter must implement itself,
or bound inputs drop keystrokes the moment the shell is remote:

- **Preserve the in-progress value of a focused input.** While a `model`-bound
  input is focused, its local editing value is authoritative; an incoming tree
  must not overwrite it. Release to the server value on blur. The React `Input`
  holds a local `draft` (`null` = not editing, server wins); the DOM adapter
  captures the focused element's value + caret and restores them across its full
  rebuild (`captureFocus`/`restoreFocus`). Same rule, framework-shaped mechanism.
- **Honour the `debounce` prop on a `model`-bound node.** `props.debounce`
  (milliseconds, default 0) coalesces `ui:model` dispatches; flush any pending
  value on blur. Both reference adapters implement it — omitting it silently
  makes a served `debounce` a no-op in your terminal, so the same layout behaves
  differently across renderers.

These belong to *every* adapter because they are artifacts of the transport, not
of taste — unlike styling, hover, or animation, which *should* differ per kit.
The line is exactly that: an adapter shares nova's treatment of the round trip
and nothing about how pixels look.

A line renderer discharges both trivially: the TTY adapter has no focused
input (a `set <n> <text>` command is one atomic, complete value, so there is
no in-progress draft for an echo to clobber) and therefore nothing for
`debounce` to coalesce. The obligations bind any adapter that *does* hold
live input focus — a full-screen TUI included.
