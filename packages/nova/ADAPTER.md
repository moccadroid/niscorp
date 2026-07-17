# Nova adapter contract

Nova's core is framework-free. It renders layout trees into `RenderNode[]`
and owns all state, events, and subscriptions. An adapter binds that to a UI
framework. The React adapter (`@niscorp/nova/react`, `src/react/`) is the
reference implementation; a Vue or Svelte adapter is a sibling folder with
its own export subpath, built the same way.

An adapter imports only from `@niscorp/nova`'s public surface (plus its own
framework). Core never imports from an adapter.

## Obligations

An adapter must provide five things.

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

### 4. Structural slots and the component vocabulary

Register two structural components under the core names `CANVAS_SLOT_NAME`
and `ACTION_SLOT_NAME` — the shell's default layouts reference them:

- **CanvasSlot** (`{ canvasId }`): renders that canvas's tree; nothing when
  `canvasId` is missing.
- **ActionSlot** (`{ instanceId }`): renders that instance's tree; nothing
  when `instanceId` is missing. Wrap the dispatch handed to the instance's
  subtree with core's `scopeDispatch(dispatch, instanceId)` so its UI events
  reach its own triggers only. Do not reimplement the stamping rule.

Ship the primitive vocabulary (Stack, Text, Input, Button, Box) with static
`meta` (description + props schema) so registries and agent tooling can
introspect them.

### 5. SlotWrapper persistence

If the adapter supports an app-supplied slot wrapper (animation, gating,
logging at the ActionSlot seam), the wrapper renders *persistently* — with
content or with none — so a presence-managing wrapper can animate an
instance leaving. The adapter hands the wrapper identity only (`canvasId`,
`instanceId`, the `ActionDefinition`), never live state; identity fields are
undefined while the slot is empty or exiting. Nova owns no timing.
