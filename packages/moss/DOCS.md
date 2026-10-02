# Moss — API Reference

Seven entry points: `@niscorp/moss` (the server), `@niscorp/moss/node` (the Node
listener), `@niscorp/moss/client` (the wire), `@niscorp/moss/terminal` (the
terminal), `@niscorp/moss/terminal/react`, `@niscorp/moss/terminal/vue` and
`@niscorp/moss/terminal/dom` (the render targets). API is pre-1.0 and moves.

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
  shell?: ShellManifest;                              // the server shell, as data — THE APP
  pages?: Record<string, PageManifest>;               // what is drawn at a path and kept by nothing
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

#### `PageManifest` — `app.pages`

```typescript
type PageManifest = ShellManifest & {
  path: string;      // "/about", "/docs/:slug" — literal segments and `:name` parameters
  params?: string;   // the canvas whose seed receives the path's parameters as input
};
```

`shell` is **the app**: one durable shell per signed-in person, the thing that
rearranges itself around them. A **page** is the other thing a path can lead
to — a welcome, the docs, a published talk. It is a shell manifest of its own
(a frame, canvases, what mounts on them), drawn for whoever asks and then let
go. It is the same machinery with the keeping taken out:

- **The same actions and the same charter.** What exists on a page for a given
  person is ring 1, as everywhere: a strip saying who is signed in is an action
  a member is granted, on a canvas whose candidate list a stranger holds none
  of. Nothing in a layout asks who anybody is.
- **The same policy on every read.** A page's endpoints ride the server's own
  surfaces as whoever asked — nobody, or the signed-in principal.
- **No shell is kept.** A page's shell lives for one read (the document) or one
  connection (a terminal on a page that can still do something). A principal's
  app shell is neither built nor touched by a page.
- **`onSession` does not run.** Session code is the app's. `functions` are
  endpoints and serve a page's actions as they serve the app's.

A path matches a page when both have the same number of segments and every
literal one is equal; nothing else (no wildcards, no order). Two pages that
could both answer one path are refused at boot, as is a `params` canvas the page
does not have. Any path no page answers is the app's.

Whether a page may be kept by a cache, or written to a file, is not a property
of the page: see [`documentHeaders`](#the-document).

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
  session: SessionVerifier | 'sessions' | 'dev-open';  // REQUIRED — no default
  shellIdleMs?: number;            // idle shell eviction; default 30 min, `0` disables
  sessionRevalidateMs?: number;    // live-socket re-verify; default 60s, `0` disables
  shellFrameDelta?: boolean;       // send changed canvases as deltas; default off
  socketCompression?: boolean | Record<string, unknown>;  // permessage-deflate; default on
};
```

`session` is required, deliberately — authentication is the one door that must
not default open, and it used to. Three answers: `'sessions'` uses moss's own
stored credential (below); `'dev-open'` trusts every well-formed token and says
so at boot — harnesses and demo floors; a function is the app's own identity
provider — return `null` for a token that has expired or been revoked. moss
never learns what expiry means — it only asks again, on both surfaces.

#### `mintSession(pool, principal, ttlMs)` / `sessionOf(pool, token)` / `revokeSession(pool, token)` / `revokeAllFor(pool, principal)`

The stored credential behind `session: 'sessions'` — the integration key's
standard, one table over: 256 bits behind an `st_` prefix, the row keeps only
the hash, `expires_at` is enforced on every read, and revocation is deleting
the row (one token, or every token a principal holds). The app mints at its
own door after its own identity check and hands the token to the terminal;
its table (`SESSIONS_SEQUENCE`) rides `createServer` boot automatically under
`'sessions'`. Expired rows are swept on every mint — no timer to run.

**Tables go through a ledger.** moss creates no table on its own: its tables are
[strata](../strata/README.md) sequences — `MOSS_SEQUENCE` (integrations, their
actions, the generation pointer), `SESSIONS_SEQUENCE`, `TIDE_SEQUENCE` for the
tide store — and `createServer` applies them with the vex cache's sequence in
one ledgered run before introspection: once, recorded in `strata_ledger`, and
refused if the ledger was edited or written by newer code. `migrations` on the
runtime picks the posture: `'apply'` (default) runs what is pending; `'verify'`
refuses to boot if anything is, for a deployment that migrates as a deploy step.
`initIntegrations` and `initSessions` remain for hosts that are not moss's
server, and go through the same ledger.

**Documents are read in this code's grammars.** Stored integration actions
carry a `grammar` stamp (`INTEGRATION_ACTIONS_STORE`). At boot, after the
tables, moss upgrades every stored action that is behind — through nova's and
Prism's grammar sequences plus the app's own (`NiscApp.grammars`: sequences
whose document steps are Prism configs, e.g. a kit renaming a component's
prop) — and a row written by newer code refuses the boot. A bundle may declare
the `grammar` it was built on; intake upgrades its actions from there before
parsing them, stores them stamped current, and refuses a bundle built on newer
grammars than the host (*the host must be updated first*). Reads upgrade too:
a row another process wrote since boot is read current, and one it cannot read
is left out with a logged sentence. Migration 1 of each sequence is the DDL
boots used to run, so a database from before the ledger adopts on its next boot.

`shellFrameDelta` and `socketCompression` are the two wire-size knobs. They are
environment settings, not manifest ones — an operational decision about a
deployment, never something an application is written against. See
[Wire size](#wire-size).

#### `mintDevToken(sub, claims?) : string` / `devSession(token) : string | null`

The dev token pair — base64url JSON, `sub` is the principal, no signature and
no expiry. Reachable only through `session: 'dev-open'`, never by default:
anybody who can spell a principal's id can be them, which is a property a
harness wants and a deployment must opt into out loud.

### The server

#### `createServer(app, runtime): Promise<MossServer>`

Stands up the data layer, **refuses to boot** on an incoherent charter
(`verifyCharter` + nova's closure audit), memoizes per-principal policy,
catalogs, and ring-2 variant bindings, mounts the vex surfaces and `/catalog`, and — when the manifest
declares a shell — the shell host behind the socket. Returns a Hono app extended
with `{ socket, shells? }`.

#### `MossServer`

`Hono<Env> & { socket: SocketAccept; shells?: ShellHost; principalOf; page; … }`.
It's a Hono app — mount it, extend it, or hand it to a listener.

- `principalOf(token): Promise<string | null>` — the deployment's own session
  verifier, the one every surface already asks. For an app's route that receives
  a credential some other way than a Bearer header (a page request carries a
  cookie). `null` is a refusal.
- `pages: readonly { name, path }[]` — every page the manifest declares, with
  the path it is drawn at: what a build walks to know which paths exist besides
  the app's own.
- `page(path): { name, host, inputs } | undefined` — the page a path leads to
  (its name, the `ShellHost` that draws it, the input its path carries), or
  `undefined` for a path that is the app's. The document route and the socket
  ask the same question here.

### The document

A page request is answered with the screen the socket would have streamed a
moment later: the caller's shell is read as it stands, drawn to a string by the
app's kit, and written into the app's own `index.html` beside the snapshot it
was drawn from. The browser's terminal starts from that snapshot and adopts the
elements already there. Nothing about the socket changes; a drawn page is a
first frame delivered early.

#### `shells.snapshot(token, principal, options?): Promise<ShellSnapshot>`

```typescript
type ShellSnapshot = {
  frame: RenderNode[];
  trees: Record<string, RenderNode[]>;   // by canvas id — what `attach` would send
  seed?: string;        // an ephemeral shell's id seed (see below)
  settled: boolean;     // false: the wait ran out and the screen went as it stood
  live: boolean;        // can anything on this screen still happen
  why: string[];        // one line per reason it is live
  drawnWith: string[];  // reads whose answers are already in the trees
};
```

The current screen for whoever this is, without attaching anything. Read-only:
the attached connections' baseline is untouched.

- **A principal's app shell is built if it is not standing, and kept** — the
  socket would have built it a moment later, and the one the page was drawn from
  is the one the socket attaches to (same shell, same instance ids).
- **Nobody's shell, and any page's, is built, read and disposed.** It is built
  under a random `seed`, and mints its instance ids in order under it
  (`act-<seed>-<n>`). A terminal names that seed on the socket (`?seed=`); the
  throwaway shell built for its connection mints the same ids, so its first
  frames match the page. The seed is random per document: ids stay unguessable,
  and a stale origin from another shell still names nothing.
- **It waits for the screen to settle**, for at most `options.waitMs` (default
  300): the manifest's `seeds` pushed, and no instance still `initializing` —
  nova marks an instance `active` only after its mount hook has been awaited.
  Past the wait the screen goes out as it stands (`settled: false`), with
  whatever is still loading drawn as loading.
- `options.inputs` — input for canvas seeds, by canvas id, merged over the
  manifest's `inputs`. A page's path parameters arrive here.

#### `live`, and `shellNeedOf(definition, entries): ShellNeed`

`live` is asked of the instances actually mounted for this principal. A screen
is live when something on it can still happen:

| Reason | Read off |
|---|---|
| a person can act on it | a `ui:` trigger, or a two-way `model` binding |
| it waits on a channel | a `message:` trigger |
| a read keeps answering | an endpoint whose entry is `refresh: 'reactive'` |
| it calls code | a `fn:` endpoint that anything calls — code is not read |
| it cannot be read | a layout kept in the store; a fingerprint the manifest does not carry |

A read made while the action opened is **finished**: its answer is in the tree
(and listed in `drawnWith`). The app's own shell is always live for a signed-in
principal — it is the thing that is kept. nova supplies the facts
(`livenessOf`, `@niscorp/nova/reflect`); moss composes the verdict, because it
holds the entries behind each fingerprint.

When `live` is false the trees are the whole of the screen, and the terminal
opens no socket.

#### `renderDocument(config): Promise<DrawnDocument>`

```typescript
const page = await renderDocument({
  server,                                   // the MossServer
  template,                                 // the app's index.html, as it would go out undrawn
  request: { path, cookie },                // what the request named and carried
  draw: (snapshot) => renderSnapshot({ snapshot, registry, slotWrapper }),
  htmlAttributes: (snapshot) => ({ 'data-accent': … }),   // optional
});
// → { html, headers, drawn, principal, page?, live?, why?, drawnWith?, settled? }
```

- **Which shell**: the page `server.page(path)` names, else the app's.
- **For whom**: the principal behind the cookie named by the wire's token key
  (`tokenKey`, default `nisc.token`), or nobody. A cookie that no longer
  resolves is nobody, and the response takes it back (`Set-Cookie`, `Max-Age=0`).
  A verifier that *throws* is a fault, not a sign-out: the page goes out
  undrawn and the cookie stays.
- **`draw`** is a terminal that draws to a string — the app's kit bound to
  `renderSnapshot` from `terminal/react/server`, `terminal/vue/server` or
  `terminal/dom/server`. It may be async.
- **`htmlAttributes`** is for what a kit would otherwise set on `<html>` from an
  effect, which never runs on a server: a palette, a colour scheme. Read it off
  the same node the effect reads it from. Values are escaped.
- **`template`** must hold the empty root (`root`, default
  `<div id="root"></div>`). The screen goes inside it, the snapshot element
  straight after.
- **Nothing here can fail a page.** A kit component that throws, a shell that
  will not build: the answer is the template as it is (`drawn: false`), and the
  terminal paints it the way it did before any of this existed.

The route is the app's own — in production `mountSite` from `@niscorp/moss/node`
(what `nisc start` mounts), in dev a vite middleware that runs
`index.html` through `transformIndexHtml` first so the drawn page still carries
vite's client.

#### `documentHeaders(principal)` — who may keep a page

| Drawn for | `Cache-Control` | `Vary` |
|---|---|---|
| nobody | `no-cache` | `Cookie` |
| somebody | `private, no-store` | `Cookie` |

This is the whole rule, and it is in one place: who may keep a page follows from
who asked. A page drawn for nobody is the same for everybody; a page drawn for
somebody is theirs. No page declares which it is.

#### `exportDocuments(config): Promise<ExportedDocument[]>`

The same draw, for nobody, once per path in `config.paths` — what a static host
serves. There is no credential to pass and no way to pass one: a file is the
page as nobody in particular sees it, which is the only page that may be kept.
Each result carries `{ path, html, page?, drawn, live, why, drawnWith, settled }`.
A page that is `live` is still written, and says why — its file is a true first
screen and its terminal will look for a socket. Whether that is acceptable (a
server stands beside the files) or a mistake (there is none) is the build's to
decide, from the report. Writing the files, and listing a parameterised page's
paths (`server.executeAs` runs a seeded read as a charter role), are the
caller's.

#### `embedSnapshot(snapshot, principal, path?)`, `tokenFromCookie(header, tokenKey?)`

The two halves `renderDocument` is made of, for a host that assembles its own
page. `embedSnapshot` writes the snapshot as a
`<script type="application/json" id="nisc-snapshot">` element with every `<`
(and U+2028/2029) escaped: a tree carries what people typed, and nothing in it
can close the element or open another.

#### `createPageRouter(pages): PageRouter`

`{ match(path): { name, params } | undefined }` — the matching rule above, for a
tool that needs it without a server.

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
  `{ shell, attach, detach, resync, dispatch, publish, back, reset }`. The living nova `Shell`,
  for in-process hosts (dev checks, embedded tools) that drive it directly;
  remote clients ride `attach`/`dispatch`. `shell` is a **getter** — `reset`
  replaces the shell under a session already held, so a snapshot of the field
  would go on addressing the disposed one.
- `auditClosure(definitions, variants?): ClosureAuditor` — nova's action audit as
  the charter's injected closure hook (cross-action wiring breaks only), over each
  role's effective definitions (granted variants substituted).

### The socket protocol

- `createSocket(ctx): SocketAccept` — `ctx = { session, catalog, shells?, page?,
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
- `ClientMessage` — `event | publish | resync | reset | back`.
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
- `back` names no canvas either, and for a related reason: back is one gesture
  over the whole shell, and the terminal that sends it has no idea which canvas
  moved last — it is served trees, not stacks. The shell decides what back
  means (nova's navigation journal, SHELL_DOCS § `back()`), and it is answered
  by whatever canvases moved. Protocol-level, so a browser's back button, a
  TUI's Escape and an app's own control are one message on one wire, and an app
  authors nothing to receive it.
- `CLOSE_INVALID_TOKEN = 4401`, `CLOSE_SIGNED_OUT = 4403`,
  `CLOSE_PROTOCOL_MISMATCH = 4426`.
- **Protocol version.** `PROTOCOL` is the wire protocol this server speaks and
  `PROTOCOL_MIN` the oldest it still serves. A terminal names its protocol on
  the upgrade (`?protocol=N`, beside the token); one that names none speaks `1`,
  which is every terminal built before the question existed. Outside the range
  the connection is refused before anything is served: an `error` frame
  (`client_too_old` or `server_too_old`) and a `4426` close. `hello` carries
  `protocol`, so a terminal can refuse a server older than it can speak to.
  Bump `PROTOCOL` when a message changes shape; raise `PROTOCOL_MIN` only when
  the server stops speaking an old one.
- **`?path=`** — the path the terminal is on. A path that leads to a page is
  served that page's shell, built for this connection alone and seeded with the
  path's parameters; any other path (and no path) is the app's shell. A
  signed-in terminal on a page does not build its principal's app shell.
- **`?seed=`** — the id seed of the page the terminal was drawn from (see
  [`shells.snapshot`](#the-document)). An ephemeral shell built under it mints
  the same instance ids as the page's. Ignored for a kept shell, and ignored
  unless it is 8–40 hex characters.
- Both are optional and unknown to older servers, which ignore them: `PROTOCOL`
  is unchanged.
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

- `mountSite(server, { dist, draw, htmlAttributes?, tokenKey?, waitMs?, owned? })`
  — the built terminal, served by the same process as the app. Every GET that
  nothing registered earlier answers is a file from `dist`, or a page:
  `index.html` with the caller's screen drawn into it (`renderDocument`) — the
  app's own for `/`, one of the manifest's pages for a path that leads to one.
  `index.html` itself never goes out as a file. Register the app's own routes
  first; this is the catch-all. `owned` (default: moss's own prefixes) names
  what is never a page — an unknown path under one is a 404, not a screen.

## `@niscorp/moss/client`

- `createWire(config?): Wire` — the app end of the socket. `config = { url?,
  env?, delta?, initial?, path? }`. Plain TypeScript, no React, no globals — everything
  host-shaped comes in as a `WireEnv`. `delta` (default `false`) advertises
  that this terminal can rebuild frame deltas; the snapshot it produces is
  identical either way. See [Wire size](#wire-size).
- `WireEnv` — the host seam: `{ tokens: { load, save, clear }, socket(url),
  defaultUrl() }`. The socket API is WHATWG-standard in every host (browser,
  Node ≥22, Bun); an env only constructs it.
- `browserEnv({ tokenKey?, cookie? }?): WireEnv` — the default host: token in
  localStorage (`nisc.token`), url derived from `window.location`, the
  page's WebSocket. `cookie: true` keeps a **copy** of the token in a cookie of
  the same name (`Path=/; SameSite=Lax`, `Secure` on https), written and
  cleared with the stored one and levelled with it on every load — so a token
  put in localStorage by something else (a sign-in handoff page) reaches the
  cookie on the first load after it. A page request carries cookies and nothing
  else; this is what lets a server draw the page for whoever is asking. The
  cookie is only ever read to draw a page — every other surface still wants the
  token itself — so it adds no way in.
- `readDocumentSnapshot(doc?): DocumentSnapshot | undefined` — the snapshot a
  server-drawn page carries (`{ frame, trees, principal, seed?, path?, live? }`),
  or `undefined` for a page that carries none. Never throws.
- `initial` — pass what `readDocumentSnapshot()` returned. The wire starts from
  it instead of from nothing, so the first render matches the page's HTML and
  the first frames off the socket confirm it. It is used only when it was drawn
  for who this terminal is — signed in and holding a token, or neither;
  anything else is somebody else's screen and the wire starts empty. Its `seed`
  is named on the first connect only. Its `path` is named on every connect
  (`config.path` overrides it; a page that was not drawn on the server passes
  `location.pathname` there).
- **A page with nothing left to happen opens no socket.** When `initial.live`
  is `false`, the wire does not connect and `status()` is `'static'`. `reset()`,
  or a token arriving, connects after all.
- `Wire` — `{ subscribe, snapshot, status, dispatch(canvas, event), publish,
  reset, back, dispose }`. `snapshot()` is `{ frame, trees }`; `status()` is
  `'connecting' | 'open' | 'closed' | 'incompatible' | 'static'` and changes notify subscribers like
  snapshot changes do (a renderer must be able to tell a dead socket from an
  empty app). Hand it to a renderer.

Reconnect is exponential backoff with jitter, capped at 30s, reset when a
connection opens and on any principal change (a session grant or a close-code
recovery starts the backoff clean). Two close codes are recoveries, not retries: `4403`
(signed out) and `4401` (invalid token) both drop the stored token and
reconnect anonymous — retrying with a stale token would loop forever. A
`4426` (protocol mismatch, either direction) is neither: the wire stops and
reports status `incompatible`, because every retry would speak the same
protocol again — a browser terminal needs a reload for the current build. Server
`error` frames and unknown message types are `console.warn`ed; `hello` and
`catalog` are deliberately ignored (the terminal is grant-blind).

`reset()` is the escape from a wedged shell, and the only one that can work:
the shell is server state keyed by principal, so dropping the token here hands
you a throwaway anonymous shell and signing back in reattaches to the same
wreck. On an open socket it sends `{ type: 'reset' }` and the fresh frame
arrives on that same socket — same session, same token, nothing signed out. On
a dead one it reconnects immediately instead of waiting out the backoff, which
is the same recovery a layer down.

**Nothing is sent on a socket that is not open, and nothing is queued.**
`dispatch` and `publish` are dropped unless `status()` is `'open'` — the posture
`back` and `popTo` always had. A server-drawn page is on screen before its
socket is, so there is a moment in which something can be pressed with nothing
to send it over; an intention replayed against a screen that may have moved is
worse than one lost, and a browser socket that is still connecting throws on
`send`.

`back()` sends `{ type: 'back' }` and nothing else — no location is held here,
so what comes back is whatever canvases moved, over the same stream every other
change arrives on. It is dropped on a closed socket rather than queued: a back
pressed during an outage is about a screen the person is no longer being served,
and replaying it on reconnect would move them somewhere they asked to go one
outage ago.

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
- `mountTerminal(config): { swap, reset, back, destroy }` — the switcher:
  hot-swaps render targets over ONE wire, so the socket, session, and current
  trees survive the swap. `config = { targets, swapKey?, resetKey?, trapBack?,
  initial?, wire?, url? }` — targets by name, cycled in insertion order;
  `swapKey` (e.g. `"ctrl+shift+y"`) binds the hotkey, and `swap` is returned for
  a host's own control. Omit `wire` and the terminal makes (and owns) one; `url`
  seeds it. `resetKey` binds `wire.reset()` — the escape hatch, on a keystroke
  because it has to work when every surface on screen is dead. Both hotkeys are
  browser-only (they listen on `window`); a TTY or Node host binds `swap` and
  `reset` to its own control instead.
- **The back gesture.** `trapBack` (default **on**) catches the browser's back
  button and sends it up the wire instead of letting it unload the page. It
  keeps one spare history entry ahead of the page and spends it on every press,
  putting another straight back — so the URL never changes and the application
  is never left. Nothing at all where there is no history to catch (a TTY, a
  TUI, a plain process), so the conductor asks for it unconditionally. `back` is
  returned for a host's own control, and `trapBack: false` leaves the page's
  back button to the host.

  It does not touch the address bar, and that is the honest position while
  location lives on the server: a shell is keyed by principal, not by tab, so a
  URL would be a per-tab claim on state two tabs share. Deep links, when they
  come, are a projection of the shell's own location — and the gesture is
  already here.
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
  errorMarker?, canvasProvider?, instanceProvider? })` + `TerminalApiContext` — the wire-backed
  slots themselves, shared by every react-shaped target (`terminal/ink`
  imports them); a custom react-shaped target starts here.
- `TerminalSlotWrapper` — an app component wrapping each action instance at
  the `ActionSlot` boundary; the terminal twin of nova's client-shell
  SlotWrapper. Served trees carry identity only, so the props are
  `{ canvasId, instanceId, definitionId }` — `definitionId`, not `action`.
- **Adoption.** A `root` that already holds elements, on a wire that has a
  frame, was drawn on the server from the snapshot the wire started from: the
  target adopts those elements (`hydrateRoot`) instead of replacing them. An
  empty root, or a wire with no frame (the page was drawn for somebody else),
  is rendered as before.

### `@niscorp/moss/terminal/react/server`

- `renderSnapshot({ snapshot, registry, slotWrapper? }): string` — the React
  target, drawing to a string: the same registry, the same wire slots and the
  same tree as the browser's target, so what a server writes is what the browser
  adopts. Its own entry, so a browser bundle never carries `react-dom/server`.

**What a kit owes a server-drawn page.** The first pass in the browser must
draw exactly what the server drew, so nothing that differs between the two may
decide a component's first render:

- The window (its width, a media query, `localStorage`) — read it through
  `useSyncExternalStore` with a server snapshot, or in an effect, never in a
  `useState` initialiser guarded by `typeof window`. That guard is the bug: it
  makes the two sides disagree about the same render.
- A portal — only after the first pass (the server has no `document.body`).
- What a component puts on `<html>` from an effect is not in the page until the
  script runs; give it to `renderDocument`'s `htmlAttributes`.

An app holds this with a check: draw the page, open it in a DOM with the real
wire and target, and assert React said nothing (atrium's and lyra's `ssr-check`).

## `@niscorp/moss/terminal/vue`

Requires the optional `vue` peer.

- `vueTarget({ root, registry, slotWrapper? }): Target` — the app's Vue
  component registry bound to the wire via nova's Vue adapter, mounted on
  `root` with `createApp`. Registers wire-backed `CanvasSlot` and
  `ActionSlot` — the same origin rule as the react target (an event from
  inside an instance boundary carries that instance as `origin` unless it
  already has one). `update` never remounts: the target's reads of the wire
  depend on a revision the conductor bumps, so only the frame and the canvas
  slots re-render and Vue patches in place — focus and input drafts survive.
- `TerminalApiKey` — the injection key of the live `TerminalApi` (a kit
  component reading `frame()` / `canvasTree()` in its render re-renders on
  wire updates).
- `TerminalSlotWrapper` — a Vue component wrapping each action instance at
  the `ActionSlot` boundary, handed `{ canvasId, instanceId, definitionId }`
  as props and the content as its default slot.
- **Adoption**, as the react target: a root that holds server-drawn elements,
  on a wire with a frame, is mounted with `createSSRApp` and adopted.
- `registerWireSlots(registry, slotWrapper?)`, `terminalFrame(api, registry)` —
  the wire slots and the frame component, shared with the server entry.

### `@niscorp/moss/terminal/vue/server`

- `renderSnapshot({ snapshot, registry, slotWrapper? }): Promise<string>` — the
  Vue target, drawing to a string through Vue's own server renderer (which is
  asynchronous, so this is).

## `@niscorp/moss/terminal/dom`

- `domTarget({ root, registry? }): Target` — nova's DOM adapter plus nova's
  default component kit rendered into `root`, stylesheet injected once per
  document. Zero framework; pass a registry to restyle. It needs no adoption:
  nova's DOM adapter rebuilds its root on every render, so its first render
  replaces server-drawn elements with the same elements in one synchronous step.

### `@niscorp/moss/terminal/dom/server`

- `renderSnapshot({ snapshot, registry?, window }): string` — the DOM target,
  drawing to a string. A DOM kit builds real elements, so the host hands in a
  DOM to build them in (`window`: jsdom, happy-dom, linkedom — moss depends on
  none). A kit's components name `document` as a global, so for the length of
  one draw — synchronous, start to end — the window's names are lent to the
  global scope and taken back whatever happens.

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

- `inkTarget({ registry?, slotWrapper?, stdin?, stdout?, status?, onQuit?, patchConsole? }):
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
  different renderer. `patchConsole` (default on) routes the process's
  console above the frame; a host rendering several targets in one process
  (an SSH server, one per connection) turns it off, so its own logs never
  reach whoever is connected. ESM-only, like ink.

```typescript
import { inkTarget } from '@niscorp/moss/terminal/ink';
createTerminal({ target: inkTarget({ status: wire.status }), wire });
```
