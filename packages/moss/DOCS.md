# Moss — API Reference

Three entry points: `@niscorp/moss` (the server), `@niscorp/moss/node` (the Node
listener), `@niscorp/moss/client` (the wire). API is pre-1.0 and moves.

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
(`verifyCharter` + nova's closure audit), memoizes per-principal policy and
catalogs, mounts the vex surfaces and `/catalog`, and — when the manifest
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

## `@niscorp/moss/node`

- `serve(server, options)` — listen; wires HTTP + the socket in one process.
- `attachSocket(httpServer, accept, path?)` — embed the socket on an existing
  server (raw `ws`, `noServer`, path-matched — coexists with vite HMR). `path`
  defaults to `/socket`.

## `@niscorp/moss/client`

- `createWire(config?): Wire` — the browser end of the socket. `config = { url?,
  tokenKey? }`. Plain TypeScript, no React.
- `Wire` — `{ subscribe, snapshot, dispatch(canvas, event), publish, dispose }`.
  `snapshot()` is `{ frame, trees }`. Hand it to a renderer.

```typescript
import { createWire } from '@niscorp/moss/client';
const wire = createWire();                 // connects; token from localStorage
wire.subscribe(() => render(wire.snapshot()));
wire.dispatch('main', { type: 'ui:click', ref: 'save' });
```
