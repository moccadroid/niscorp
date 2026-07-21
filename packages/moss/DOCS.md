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

- `createWire(config?): Wire` — the app end of the socket. `config = { url?,
  env? }`. Plain TypeScript, no React, no globals — everything host-shaped
  comes in as a `WireEnv`.
- `WireEnv` — the host seam: `{ tokens: { load, save, clear }, socket(url),
  defaultUrl() }`. The socket API is WHATWG-standard in every host (browser,
  Node ≥22, Bun); an env only constructs it.
- `browserEnv({ tokenKey? }?): WireEnv` — the default host: token in
  localStorage (`nisc.token`), url derived from `window.location`, the
  page's WebSocket.
- `Wire` — `{ subscribe, snapshot, status, dispatch(canvas, event), publish,
  dispose }`. `snapshot()` is `{ frame, trees }`; `status()` is
  `'connecting' | 'open' | 'closed'` and changes notify subscribers like
  snapshot changes do (a renderer must be able to tell a dead socket from an
  empty app). Hand it to a renderer.

Reconnect is exponential backoff with jitter, capped at 30s, reset when a
connection opens and on any principal change (a session grant or a close-code
recovery starts the backoff clean). Two close codes are recoveries, not retries: `4403`
(signed out) and `4401` (invalid token) both drop the stored token and
reconnect anonymous — retrying with a stale token would loop forever. Server
`error` frames and unknown message types are `console.warn`ed; `hello` and
`catalog` are deliberately ignored (the terminal is grant-blind).

```typescript
import { createWire } from '@niscorp/moss/client';
const wire = createWire();                 // browser host; token from localStorage
wire.subscribe(() => render(wire.snapshot()));
wire.dispatch('main', { type: 'ui:click', ref: 'save' });
```

## `@niscorp/moss/client/node`

- `nodeEnv({ url, tokenFile? }): WireEnv` — the wire on a plain Node (or Bun)
  process: token in a file (default `~/.moss/token`), the runtime's WHATWG
  WebSocket, `url` explicit (a process has no location to derive one from).
  Its own entry so node builtins never enter a browser bundle.

```typescript
import { createWire } from '@niscorp/moss/client';
import { nodeEnv } from '@niscorp/moss/client/node';
const wire = createWire({ env: nodeEnv({ url: 'ws://127.0.0.1:8787/socket' }) });
```

## `@niscorp/moss/terminal`

The terminal: the wire plus a **render target**. Framework-blind — targets live
in the subpaths.

- `createTerminal({ target, wire }): { destroy }` — the conductor: one
  target, one wire. Subscribes the target's `update` to the wire and routes
  events back.
- `mountTerminal(config): { swap, destroy }` — the switcher: hot-swaps
  render targets over ONE wire, so the socket, session, and current trees
  survive the swap. `config = { targets, swapKey?, initial?, wire?, url? }` —
  targets by name, cycled in insertion order; `swapKey` (e.g.
  `"ctrl+shift+y"`) binds the hotkey, and `swap` is returned for a host's own
  control. Omit `wire` and the terminal makes (and owns) one; `url` seeds it.
- `TerminalApi` — what a target renders against: nova core's `RenderApi`
  (`frame`, `canvasTree`, `dispatch`, `publish`), aliased not redeclared — the
  DOM adapter, the React adapter, and the conductor share one contract. A
  target never touches the wire directly.
- `Target` — `(api) => TerminalMount` where `TerminalMount = { update,
  destroy }`. The render surface (a DOM root, a stdio pair) is construction
  config on the concrete target, never part of the contract — the conductor
  is surface-blind and runs anywhere the wire does. Renders once on mount;
  the conductor calls `update` on every wire change.

```typescript
import { mountTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { domTarget } from '@niscorp/moss/terminal/dom';

const root = document.getElementById('root')!;
mountTerminal({
  targets: { react: reactTarget({ root, registry, slotWrapper }), dom: domTarget({ root }) },
  swapKey: 'ctrl+shift+y',
});
```

## `@niscorp/moss/terminal/react`

Requires the optional `react`/`react-dom` peers.

- `reactTarget({ root, registry, slotWrapper? }): Target` — the app's
  component registry bound to the wire via nova's React adapter, rendered
  into `root`. Registers wire-backed `CanvasSlot` and `ActionSlot` (the
  terminal has no shell for nova's shell-backed ones).
- `registerWireSlots(registry, { slotWrapper?, fallback?, textWrapper?,
  errorMarker?, canvasProvider? })` + `TerminalApiContext` — the wire-backed
  slots themselves, shared by every react-shaped target (`terminal/ink`
  imports them); a custom react-shaped target starts here.
- `TerminalSlotWrapper` — an app component wrapping each action instance at
  the `ActionSlot` boundary; the terminal twin of nova's client-shell
  SlotWrapper. Served trees carry identity only, so the props are
  `{ canvasId, instanceId, definitionId }` — `definitionId`, not `action`.

## `@niscorp/moss/terminal/dom`

- `domTarget({ root, registry? }): Target` — nova's DOM adapter plus nova's
  default component kit rendered into `root`, stylesheet injected once per
  document. Zero framework; pass a registry to restyle.

## `@niscorp/moss/terminal/tty`

- `ttyTarget({ input, output, registry?, fallback?, onQuit?, status?,
  debounceMs?, prompt? }): Target` — the line-terminal target: a REPL over
  the wire. Pass `status: wire.status` and the REPL reports connection
  transitions (`… connecting`, `✓ connected`, `× connection lost — retrying`)
  — once per real transition, never the backoff flap.
  nova's TTY adapter renders each served frame to text with numbered `[n]`
  markers; commands map onto them with the same event vocabulary every other
  target dispatches. Runs on any Readable/Writable pair — a real TTY, a
  test's PassThrough, a pipe. `onQuit` fires on `quit`/EOF (the host owns
  the wire and the process); `debounceMs` (default 80) coalesces a burst of
  wire updates into one repaint.

Typing IS the input scheme — numbers act, words fill: a bare number taps
`[n]` (click a button or row, flip a toggle, focus an input — the next line
typed is the focused input's value, verbatim; an empty line cancels), and
bare words go straight into the only input on screen. Explicit forms
(`click/set/toggle/key <n> …`) plus `refs`, `show`, `publish <ch> [json]`,
`help`, `quit`. All of it is target policy — the wire sees ordinary events.

```typescript
import { createWire } from '@niscorp/moss/client';
import { nodeEnv } from '@niscorp/moss/client/node';
import { createTerminal } from '@niscorp/moss/terminal';
import { ttyTarget } from '@niscorp/moss/terminal/tty';

const wire = createWire({ env: nodeEnv({ url: 'ws://127.0.0.1:8787/socket' }) });
createTerminal({ target: ttyTarget({ input: process.stdin, output: process.stdout }), wire });
```

## `@niscorp/moss/terminal/ink`

- `inkTarget({ registry?, slotWrapper?, stdin?, stdout?, status?, onQuit? }):
  Target` — the full-screen terminal target: nova's Ink kit
  (`@niscorp/nova/adapters/ink`) on the React adapter's walker, mounted with
  ink's renderer. Interaction is the TTY REPL's numbered addressing plus
  live focus: every interactive shows a `[n]` marker (the numbering is the
  TTY walker run over the same served trees — `[7]` is the same thing in
  the REPL and the TUI), and typed digits act on it — buttons and rows
  click, toggles flip, an input takes focus and typing types (a focused
  input claims digits as text; multi-digit numbers accumulate for a beat,
  unambiguous ones act at once). Tab/Shift+Tab and ↑/↓ still walk the focus
  ring; Enter activates; Ctrl+C leaves (`onQuit` fires). Inputs are
  draft-preserving and `debounce`-honoring (ADAPTER.md §6). `status:
  wire.status` renders a dim connection line while the socket is not open.
  The wire-backed slots are shared with `terminal/react` — same seam,
  different renderer. ESM-only, like ink.

```typescript
import { inkTarget } from '@niscorp/moss/terminal/ink';
createTerminal({ target: inkTarget({ status: wire.status }), wire });
```
