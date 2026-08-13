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
  behaviors?: ScopeBehaviors;                          // row-level scope semantics, per table or per profile
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

#### `phrases` / `phraseKeys` — the words a shell wears

The language twin of `scope`. Moss renders server-side and serializes; between
those two, every word the reader will see is present at once, so that is where a
language is applied — one pass over the frame with
[`@niscorp/nova/i18n`](../nova/src/i18n), source phrase in, translated phrase
out. Nothing downstream (the socket, the delta encoder, the terminal) learns a
language exists.

```typescript
phrases?: (principal: string | null) => Phrasebook | undefined;  // source phrase → translation
phraseKeys?: PhraseKeys;                                         // which keys carry prose
```

- Per **principal**, because a shell is per principal. Resolved once when the
  shell is built, so changing somebody's language is a `reset`/rebuild — exactly
  like changing their catalog.
- Returning `undefined` or `{}` is the **source language** and costs nothing: the
  pass returns the same tree object and the frame serializes to the bytes it
  always did.
- `phraseKeys` is how an app names its own prose-bearing keys — nova's defaults
  plus, typically, a display-field suffix (`{ suffixes: ['_display'] }`) so the
  closed-set words a query manufactures are translatable without listing them.

Moss supplies the *mechanism*; where the words come from is the app's business
(rows, files, an API). See [`/docs/I18N.md`](../../docs/I18N.md) for the whole
picture, including the three channels this pass deliberately does not cover.

#### `FunctionSession`

What the manifest's in-process functions close over:

```typescript
type FunctionSession = {
  shell: Shell;                    // the session's living, durable shell (a getter — a reset replaces it)
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
  shellIdleMs?: number;            // idle shell eviction; default 30 min, `0` disables
  sessionRevalidateMs?: number;    // live-socket re-verify; default 60s, `0` disables
  shellFrameDelta?: boolean;       // send changed canvases as deltas; default off
  socketCompression?: boolean | Record<string, unknown>;  // permessage-deflate; default on
};
```

`session` is the whole of what an app writes to give its tokens a lifetime:
return `null` for a token that has expired or been revoked. moss never learns
what expiry means — it only asks again, on both surfaces.

`shellFrameDelta` and `socketCompression` are the two wire-size knobs. They are
environment settings, not manifest ones — an operational decision about a
deployment, never something an application is written against. See
[Wire size](#wire-size).

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

### Reacting to writes

Vex is the choke point every application write passes through, so its write
observer is where a host learns about all of them. Moss subscribes once and
splits the news down two lanes with deliberately different privileges.

#### `app.reactions` — the app's lane, row-less

```ts
reactions: [
  { table: 'notifications', op: 'insert',
    run: ({ fingerprint, table, op, count, scope }, { deliver }) => { … } },
  { table: 'studio_integrations', run: () => resync() },
]
```

Interest is **declared**, not discovered: moss routes each committed statement
to the reactions whose `table` (and optional `op`) match, so app code never
hears about writes it did not ask for and never string-matches a fingerprint
to work out what happened. `deliver(principal, channel, payload?)` publishes
onto a principal's live durable shell over the socket the shells already run.

Two rules hold this lane honest:

- **A reaction is told THAT a write landed, never what it wrote.** No rows.
  A receiver that wants the data re-reads it under its own policy — a row
  handed to imperative code is a row outside every fence the stack builds,
  and `deliver` payloads are pings for the same reason.
- **Zero-row statements fire nothing.** An update the scope narrowed to
  nothing, an insert a conflict clause skipped: nothing changed, so there is
  no news. A reaction is never told about a write that did not happen.

A reaction naming a table nothing writes is not an error anywhere — it simply
never fires. Derive the names from `mutationEffect` over your own entries and
assert them in a check.

#### `app.facts` — the tide lane, rows and all

```ts
facts: {
  tide: () => driver,                                   // the waking intake
  identity: (scope) => `automation@${scope['studioId']}`,
  chain: (scope, hints) => (isRobot(scope) ? hints : undefined),
}
```

Each committed row becomes one `{ kind: 'write', entity, op, row }` fact.
Rows travel here because tide has the fence that makes it safe: `identity`
stamps each fact from the **write's own scope**, and tide offers a fact only
to reflexes running under the same identity — so whose write it was decides
who may be woken by it. Returning `undefined` mints nothing (an operator
surface, a write with no tenant).

`chain` is the causality gate. A tide effect writing back through vex names
its chain position in `x-tide-cause` / `x-tide-depth`; this decides whether
that caller's word is good, so the chain-depth ceiling survives the trip
through the database. Absent = hints are always dropped, which is the safe
default: a forged depth could park an innocent chain.

#### `createTideDriver({ tide, janitorMs?, retention? }) : TideDriver`

Tide reads no clocks and paces nothing; this is the thing that does.

- **Wake** — `ingest` and `fire` advance the engine immediately, to
  quiescence: a chain advances one committed hop per step, so the driver
  loops until a step reports nothing moved. `wake()` returns the promise of
  that drain, so a "run it now" button can await a settled world.
- **Sleep** — after quiescence, `tide.nextDue(now)` names the next instant
  worth waking for and one timer sleeps until exactly then, preempted by any
  ingest. No beat, no polling for work.
- **Janitor** — a slow fallback wake plus the retention sweep. It finds
  nothing when nothing is broken; it exists because a durable multi-worker
  design needs the scan that notices work committed by a process that died
  before its own wake ran. It is how work is *recovered*, never how it moves.

Hand `app.facts.tide` the **driver**, not bare tide, so a minted fact wakes
the engine instead of waiting for somebody's beat.

### Resolution (exposed for tools)

- `resolveRoles(app, principal): readonly string[]` — assignment rows; anonymous/
  unassigned wears `['public']`.
- `resolvePolicy(app, grants, principal): ScopePolicy` — the compiled vex policy
  this principal reads and writes under. **One policy per role, merged** — a
  person may hold several (an instructor who also trains here), and reach belongs
  to the role rather than to the person. The merge is a union: broadest wins.
- `resolvePolicyAtReach(app, grants, principal, reach): ScopePolicy` — the same
  principal's grants recompiled under a named profile, for entries that declare
  a `reach` (vex). Wired into the vex surfaces automatically; narrows rows,
  never widens verbs.
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
  `ctx.idleMs` bounds how long a shell may sit unattached (default
  `DEFAULT_IDLE_MS`, 30 minutes; `0` disables the sweep).
- `ShellHost` — `{ session, adopt, list, reset, stop }`.
  - `list(): ShellReport[]` — every durable shell alive right now:
    `{ principal, connections, since, idleSince, canvases }`. moss owns the map,
    so moss enumerates it; an app keeping its own note beside it can only drift.
  - `reset(principal): boolean` — dispose that principal's shell and stand its
    replacement in the same slot, carrying the attached connections across.
    `false` = they hold no shell, which is an answer, not an error.
  - `stop()` — stop the idle sweep (the timer is unref'd, so a plain process
    needn't call it).
- `ShellSession` — what `ShellHost.session(token, principal)` returns:
  `{ shell, attach, detach, dispatch, publish, reset }`. The living nova `Shell`,
  for in-process hosts (dev checks, embedded tools) that drive it directly;
  remote clients ride `attach`/`dispatch`. `shell` is a **getter** — `reset`
  replaces the shell under a session already held, so a snapshot of the field
  would go on addressing the disposed one.
- `auditClosure(definitions, variants?): ClosureAuditor` — nova's action audit as
  the charter's injected closure hook (cross-action wiring breaks only), over each
  role's effective definitions (granted variants substituted).

### The socket protocol

- `createSocket(ctx): SocketAccept` — `ctx = { session, catalog, shells?,
  revalidateMs? }`. One `accept(url, connection)` per connection; `accept.stop()`
  ends revalidation (the timer is unref'd, so a plain process needn't call it).
- **Identity is asked twice.** At upgrade, and then every `revalidateMs`
  (default `DEFAULT_REVALIDATE_MS`, 60s; `0` disables) for as long as the
  connection lives. A token that stops resolving — or starts resolving to
  somebody else — gets an `invalid_token` error frame and a `4401` close, which
  is the recovery the terminal already performs: drop the token, reconnect
  anonymous, land on the served lock screen.
  - Anonymous connections are never revalidated: nothing they hold can expire.
  - A verifier that **throws** is a fault, not a sign-out — the connection is
    left alone and asked again next pass, so a database blip cannot become an
    outage. Only an explicit `null` (or a changed principal) closes.
  - Without this the socket was the asymmetry: the HTTP surfaces re-ask on
    every request, so an expired credential left the socket open and rendering
    while every endpoint the server shell called came back 401 — a live
    interface whose every load silently fails.
- `Connection` — the transport seam: `{ send, close, onMessage, onClose }`.
- `ServerMessage` — `hello | catalog | frame | render | render-delta | session | error`.
- `ClientMessage` — `event | publish | resync | reset`.
- `render-delta` is only ever sent to a connection that advertised `?delta=1`
  on the upgrade, and only when the server is configured for it. Everything
  else is served whole frames, unchanged. See [Wire size](#wire-size).
- `resync` says *this connection's copy of a canvas is not what you think it
  is* — a delta failed its checksum, or arrived with no base. It is answered
  with whole frames, the state both ends can always agree on. Distinct from
  `reset`: the shell is fine, only this connection's copy drifted, so nothing
  is torn down and no other terminal notices.
- `reset` names no canvas, deliberately: it is the recovery for a session whose
  canvases are the broken thing, so it must not travel through one. It is
  protocol-level, not app-level — no action declares it and no charter grants
  it — and it is answered by the frames it produces, not by an envelope of its
  own.
- `CLOSE_INVALID_TOKEN = 4401`, `CLOSE_SIGNED_OUT = 4403`.
- A canvas whose layout renders no visible content is served as an empty
  tree (`[]`), so a terminal collapses chrome on `length` alone. An
  `ActionSlot` is a boundary, not content — visibility is decided by what's
  inside it.

### Wire size

Two independent reductions, both optional, both invisible to an application.
Neither changes a rendered tree, and an app that sets neither behaves exactly
as it did before they existed. The reasoning and the measurements are in
DESIGN.md § What a frame costs.

#### Compression — `runtime.socketCompression`, default **on**

`permessage-deflate` (RFC 7692), negotiated by the transport below the
`Connection` seam. Nothing in moss or in an app sees it, and every browser
understands it.

```typescript
socketCompression: true                       // the default
socketCompression: false                      // off
socketCompression: { threshold: 4096 }        // passed through to `ws`
```

Roughly 3–4× on render trees. The cost is memory: about **260 KB resident per
connection** at the `ws` defaults, against about 43 KB for the shell being
served. Turn it off — or tune `zlibDeflateOptions.memLevel` / `windowBits`
through the object form — when connection count matters more than bandwidth.
An object is handed to `ws` verbatim; see its `perMessageDeflate` options.

#### Frame deltas — `runtime.shellFrameDelta`, default **off**

A changed canvas, described against the frame that connection already holds:
copy runs from the old frame plus literal inserts, checksummed.

```typescript
// server
const server = await serve(app, { pool, db, shellFrameDelta: true });

// terminal — both ends have to want it
const wire = createWire({ delta: true });
```

**Both ends must opt in.** The terminal advertises `?delta=1` on the upgrade
url; the server sends deltas only if `shellFrameDelta` is on *and* the delta is
at most 60% of the whole frame. A terminal that never advertises — including
every terminal built before this existed — receives whole frames forever, from
the same shell, in the same pass. The two kinds of connection coexist.

What it buys, measured on Lyra:

| change | delta, as a share of the whole frame |
| --- | --- |
| in-place (keystroke, one row's badge) | 1–4% |
| navigation (a genuinely different tree) | ~80% — over the threshold, so sent whole |

Correctness, which matters more than the saving:

- Every `render-delta` carries `hash`, a checksum of the frame it must rebuild.
  A terminal that lands anywhere else — bad ops, missing base, a decode that
  throws — **discards the result**, keeps the tree it was already showing, and
  sends `resync`. It never renders a partially applied frame and never throws
  on the connection.
- Bases are dropped on every reconnect: attaching is served whole frames, so a
  base carried across a reconnect is one the server never assumed.
- A `reset` carries the capability across to the replacement shell.
- `src/delta.ts` is the whole implementation — `encodeDelta`, `applyDelta`,
  `frameHash` — with no dependency, small enough to read in full. A delta layer
  that cannot be audited is a desync you cannot diagnose.

## `@niscorp/moss/node`

- `serve(app, runtime & { port? }): Promise<MossServer>` — boots and listens:
  `createServer` runs inside (boot refusal included), then HTTP + the socket
  in one process. `port` defaults to 8787.
- `attachSocket(httpServer, accept, path?, options?)` — embed the socket on an
  existing server (raw `ws`, `noServer`, path-matched — coexists with vite
  HMR). `path` defaults to `/socket`. `options = { compression? }` is the same
  value as `runtime.socketCompression` and defaults to `true`; `serve()` passes
  the runtime's through for you, so only a host running its own listener (a
  vite plugin, a dev check) ever needs it.

## `@niscorp/moss/client`

- `createWire(config?): Wire` — the app end of the socket. `config = { url?,
  env?, delta? }`. Plain TypeScript, no React, no globals — everything
  host-shaped comes in as a `WireEnv`. `delta` (default `false`) advertises
  that this terminal can rebuild frame deltas; the snapshot it produces is
  identical either way. See [Wire size](#wire-size).
- `WireEnv` — the host seam: `{ tokens: { load, save, clear }, socket(url),
  defaultUrl() }`. The socket API is WHATWG-standard in every host (browser,
  Node ≥22, Bun); an env only constructs it.
- `browserEnv({ tokenKey? }?): WireEnv` — the default host: token in
  localStorage (`nisc.token`), url derived from `window.location`, the
  page's WebSocket.
- `Wire` — `{ subscribe, snapshot, status, dispatch(canvas, event), publish,
  reset, dispose }`. `snapshot()` is `{ frame, trees }`; `status()` is
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

`reset()` is the escape from a wedged shell, and the only one that can work:
the shell is server state keyed by principal, so dropping the token here hands
you a throwaway anonymous shell and signing back in reattaches to the same
wreck. On an open socket it sends `{ type: 'reset' }` and the fresh frame
arrives on that same socket — same session, same token, nothing signed out. On
a dead one it reconnects immediately instead of waiting out the backoff, which
is the same recovery a layer down.

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
- `mountTerminal(config): { swap, reset, destroy }` — the switcher: hot-swaps
  render targets over ONE wire, so the socket, session, and current trees
  survive the swap. `config = { targets, swapKey?, resetKey?, initial?, wire?,
  url? }` — targets by name, cycled in insertion order; `swapKey` (e.g.
  `"ctrl+shift+y"`) binds the hotkey, and `swap` is returned for a host's own
  control. Omit `wire` and the terminal makes (and owns) one; `url` seeds it.
  `resetKey` binds `wire.reset()` — the escape hatch, on a keystroke because it
  has to work when every surface on screen is dead. Both hotkeys are
  browser-only (they listen on `window`); a TTY or Node host binds `swap` and
  `reset` to its own control instead.
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
  resetKey: 'ctrl+shift+u',   // ask the server for a fresh shell
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
