# Moss — API Reference

Six entry points: `@niscorp/moss` (the server), `@niscorp/moss/node` (the Node
listener), `@niscorp/moss/client` (the wire), `@niscorp/moss/terminal` (the
terminal), `@niscorp/moss/terminal/react` and `@niscorp/moss/terminal/dom` (the
render targets). API is pre-1.0 and moves.

## `@niscorp/moss`

### The manifest

#### `defineApp(app: NiscApp): NiscApp`

Identity today, a validation seam tomorrow. The one name an app file needs
besides its artifacts.

#### `NiscApp`

```typescript
type NiscApp = {
  charter: Charter;                                   // resolved per principal
  assignments: Record<string, readonly string[]>;     // principal → roles
  actions: Record<string, ActionDefinition>;          // the app's actions
  layouts?: Record<string, LayoutVariant>;            // ring 2: variant id → { action, layout }
  behaviors?: ScopeBehaviors;                          // row-level scope semantics
  entries?: readonly (SeedEntry | SeedMutation)[];     // the prewarmed API surface
  resources?: Record<string, readonly string[] | { entities: readonly string[] }>;
  shell?: ShellManifest;                              // the server shell, as data
  functions?: (session: FunctionSession) => Record<string, FunctionHandler>;
};
```

Every field is an artifact (authored data) except `functions`, which is the code
escape hatch. Absent `shell`, the app serves data only (no server shells). Absent
`functions`, `fn:` endpoints fail loudly.

A `LayoutVariant` is `{ action: string; layout: LayoutNode }` — ring 2: the
charter's `layouts` section selects who holds which variant id, and moss
substitutes the granted variant's layout onto the definition at shell build. The
base is the floor; variants enrich upward as grants.

#### `ShellManifest`

```typescript
type ShellManifest = {
  canvases: ShellCanvas[];        // a canvas's `initial` may be a CANDIDATE list
  layout?: LayoutNode;            // the frame — CanvasSlot markers, served verbatim
  fragments?: Record<string, ActionFragment>;
  inputs?: (session: { principal, actions, roles }) => Record<string, Record<string, unknown>>;
  components?: Record<string, { meta?: { description?; propsSchema? } }>;
};
```

`inputs` is the app's one per-principal boot-derivation hook (nav flags, user
chips), merged over each canvas's static seed.

#### `FunctionSession`

What the manifest's in-process functions close over:

```typescript
type FunctionSession = {
  shell: Shell;                    // the session's living, durable shell
  principal: string | null;
  roles: readonly string[];
  wire: FetchFn;                   // the server's own surfaces, as this session
  runtime: NiscRuntime;
  policy: ScopePolicy;             // the caller's compiled scope policy
  grant: (token: string) => void;  // session GRANT (login): send it down, reconnect
  revoke: () => void;              // session REVOKE (sign-out): close 4403, evict
};
```

### The environment

#### `NiscRuntime`

```typescript
type NiscRuntime = {
  pool: PgPool;                    // SQL
  db: MutationClient;              // writes
  cache?: CacheBackend;            // defaults to vex's postgres cache on `pool`
  session?: (token) => string | null | Promise<string | null>;  // defaults to devSession
};
```

#### `mintDevToken(sub, claims?) : string` / `devSession(token) : string | null`

The dev token pair — base64url JSON, `sub` is the principal. Real auth replaces
both ends together; nothing else touches token mechanics.

### The server

#### `createServer(app, runtime): Promise<MossServer>`

Stands up the data layer, **refuses to boot** on an incoherent charter
(`verifyCharter` + nova's closure audit), memoizes per-principal policy,
catalogs, and ring-2 variant bindings, mounts the vex surfaces and `/catalog`, and — when the manifest
declares a shell — the shell host behind the socket. Returns a Hono app extended
with `{ socket, shells? }`.

#### `MossServer`

`Hono<Env> & { socket: SocketAccept; shells?: ShellHost }`. It's a Hono app —
mount it, extend it, or hand it to a listener.

### Resolution (exposed for tools)

- `resolveRoles(app, principal): readonly string[]` — assignment rows; anonymous/
  unassigned wears `['public']`.
- `resolvePolicy(app, grants, principal): ScopePolicy` — the compiled vex policy
  this principal reads and writes under.
- `resolveCatalog(app, principal): Catalog` — `{ ids, hash }`, granted action ids
  sorted, with a content-hash version token (equal hash, equal application).
- `resolveVariants(app, principal): ReadonlyMap<string, LayoutNode>` — action id →
  the granted variant's layout (ring 2; empty map = every action serves its base).
- `verifyVariants(app): string[]` — the ring-2 boot gate: every variant reshapes a
  shipped action, and no wearable role combination holds two variants of one
  action. Non-empty = refuse to boot.
- `createDataLayer(runtime, entries?): Promise<DataLayer>` — `{ engine, schema,
  grants }`, stood up from what's present.
- `createShellHost(ctx): ShellHost` — the durable per-principal shell host.
- `ShellSession` — what `ShellHost.session(token, principal)` returns:
  `{ shell, attach, detach, dispatch, publish }`. The living nova `Shell`, for
  in-process hosts (dev checks, embedded tools) that drive it directly;
  remote clients ride `attach`/`dispatch`.
- `auditClosure(definitions, variants?): ClosureAuditor` — nova's action audit as
  the charter's injected closure hook (cross-action wiring breaks only), over each
  role's effective definitions (granted variants substituted).

### The socket protocol

- `createSocket(ctx): SocketAccept` — `ctx = { session, catalog, shells? }`. One
  `accept(url, connection)` per connection.
- `Connection` — the transport seam: `{ send, close, onMessage, onClose }`.
- `ServerMessage` — `hello | catalog | frame | render | session | error`.
- `ClientMessage` — `event | publish`.
- `CLOSE_INVALID_TOKEN = 4401`, `CLOSE_SIGNED_OUT = 4403`.
- A canvas whose layout renders no visible content is served as an empty
  tree (`[]`), so a terminal collapses chrome on `length` alone. An
  `ActionSlot` is a boundary, not content — visibility is decided by what's
  inside it.

## `@niscorp/moss/node`

- `serve(app, runtime & { port? }): Promise<MossServer>` — boots and listens:
  `createServer` runs inside (boot refusal included), then HTTP + the socket
  in one process. `port` defaults to 8787.
- `attachSocket(httpServer, accept, path?)` — embed the socket on an existing
  server (raw `ws`, `noServer`, path-matched — coexists with vite HMR). `path`
  defaults to `/socket`.

## `@niscorp/moss/client`

- `createWire(config?): Wire` — the browser end of the socket. `config = { url?,
  tokenKey? }`. Plain TypeScript, no React.
- `Wire` — `{ subscribe, snapshot, dispatch(canvas, event), publish, dispose }`.
  `snapshot()` is `{ frame, trees }`. Hand it to a renderer.

Reconnect is exponential backoff with jitter, capped at 30s, reset when a
connection opens and on any principal change (a session grant or a close-code
recovery starts the backoff clean). Two close codes are recoveries, not retries: `4403`
(signed out) and `4401` (invalid token) both drop the stored token and
reconnect anonymous — retrying with a stale token would loop forever. Server
`error` frames and unknown message types are `console.warn`ed; `hello` and
`catalog` are deliberately ignored (the terminal is grant-blind).

```typescript
import { createWire } from '@niscorp/moss/client';
const wire = createWire();                 // connects; token from localStorage
wire.subscribe(() => render(wire.snapshot()));
wire.dispatch('main', { type: 'ui:click', ref: 'save' });
```

## `@niscorp/moss/terminal`

The terminal: the wire plus a **render target**. Framework-blind — targets live
in the subpaths.

- `createTerminal({ root, target, wire }): { destroy }` — the conductor: one
  target, one wire. Subscribes the target's `update` to the wire and routes
  events back.
- `mountTerminal(root, config): { swap, destroy }` — the switcher: hot-swaps
  render targets over ONE wire, so the socket, session, and current trees
  survive the swap. `config = { targets, swapKey?, initial?, wire?, url? }` —
  targets by name, cycled in insertion order; `swapKey` (e.g.
  `"ctrl+shift+y"`) binds the hotkey, and `swap` is returned for a host's own
  control. Omit `wire` and the terminal makes (and owns) one; `url` seeds it.
- `TerminalApi` — what a target renders against: nova core's `RenderApi`
  (`frame`, `canvasTree`, `dispatch`, `publish`), aliased not redeclared — the
  DOM adapter, the React adapter, and the conductor share one contract. A
  target never touches the wire directly.
- `Target` — `(root, api) => TerminalMount` where `TerminalMount = { update,
  destroy }`. Renders once on mount; the conductor calls `update` on every
  wire change.

```typescript
import { mountTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { domTarget } from '@niscorp/moss/terminal/dom';

mountTerminal(document.getElementById('root')!, {
  targets: { react: reactTarget({ registry, slotWrapper }), dom: domTarget() },
  swapKey: 'ctrl+shift+y',
});
```

## `@niscorp/moss/terminal/react`

Requires the optional `react`/`react-dom` peers.

- `reactTarget({ registry, slotWrapper? }): Target` — the app's component
  registry bound to the wire via nova's React adapter. Registers wire-backed
  `CanvasSlot` and `ActionSlot` (the terminal has no shell for nova's
  shell-backed ones).
- `TerminalSlotWrapper` — an app component wrapping each action instance at
  the `ActionSlot` boundary; the terminal twin of nova's client-shell
  SlotWrapper. Served trees carry identity only, so the props are
  `{ canvasId, instanceId, definitionId }` — `definitionId`, not `action`.

## `@niscorp/moss/terminal/dom`

- `domTarget({ registry? }): Target` — nova's DOM adapter plus nova's default
  component kit, stylesheet injected once per document. Zero framework, zero
  config; pass a registry to restyle.
