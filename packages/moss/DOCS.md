# Moss — API Reference

Sixteen entry points: `@niscorp/moss` (the server), `@niscorp/moss/node` (the
Node listener and the built site), `@niscorp/moss/vite` (the dev plugin),
`@niscorp/moss/integrations` (a feature: services that add screens),
`@niscorp/moss/tide` (a feature: a write minted into tide as a fact),
`@niscorp/moss/client` and `@niscorp/moss/client/node` (the wire and its Node
host), `@niscorp/moss/terminal` (the terminal), and the render targets:
`terminal/react`, `terminal/vue`, `terminal/dom` (each with a `/server` entry
that draws to a string), `terminal/tty` and `terminal/ink`. The version is below 1.0 and
the package is live on npm all the same: what is documented here keeps working
from one release to the next, and what should go is deprecated, not removed.
0.5.0 is the one release that did not keep to that, with the maintainer's
approval: moss was rebuilt as modules and its entries were cut to what an app
calls. Its entry in `CHANGELOG.md` says what an app changes.

**What is exported is a file.** Every name an entry point exports is one line
of `packages/moss/api.txt` in the repository (it is not in the published
package), and `pnpm check:api` fails when the file and the entry points
differ. Each of those names is documented below, under its entry point. Where this document names a type, a constant or a file that
is not in `api.txt`, it says so: the name is there so a shape can be read, and
an app reaches the shape through the exported type that carries it
(`NiscRuntime['fabric']`, `Awaited<ReturnType<ShellHost['session']>>`).

The nisc packages (`charter`, `nova`, `prism`, `strata`, `vex`) and
`zod` are required peers. `react`/`react-dom`, `vue`, `ink`, `vite` and
`@niscorp/tide` are optional peers, needed only by the entry that names them
(tide: `@niscorp/moss/tide`). `hono`,
`@hono/node-server` and `ws` are moss's own dependencies.

## `@niscorp/moss`

### The manifest

#### `defineApp(app: NiscApp): NiscApp`

Returns its argument: the one name an app file needs besides its artifacts.
The manifest is read by a schema, and then frozen, where it is handed over:
in [`createServer`](#createserverapp-runtime-promisemossserver). Until then an
app may go on assembling it.

#### `NiscApp`

```typescript
type NiscApp = {
  charter: Charter;                                   // resolved per principal
  assignments?: Record<string, readonly string[]>;    // principal → roles (authored; or `identity`)
  wearable?: readonly (readonly string[])[];          // the role combinations one principal may wear
  actions: Record<string, ActionDefinition>;          // the app's actions
  layouts?: Record<string, LayoutVariant>;            // ring 2: variant id → { action, layout }
  behaviors?: ScopeBehaviors;                          // row-level scope semantics, per table or per profile
  entries?: readonly (SeedEntry | SeedMutation)[];     // the prewarmed API surface
  resources?: Record<string, readonly string[] | { entities: readonly string[] }>;
  shell?: ShellManifest;                              // the server shell, as data — THE APP
  pages?: Record<string, PageManifest>;               // what is drawn at a path and kept by nothing
  grammars?: readonly Sequence[];                     // the app's own strata grammar sequences
  // the code seams
  scope?: (principal: string | null, identity?: IdentityRecord) => Record<string, unknown>;
  identity?: { as?: string; resolve: (principal, read) => Promise<IdentityRecord> };
  phrases?: (session) => Phrasebook | undefined | Promise<Phrasebook | undefined>;
  phraseKeys?: PhraseKeys;
  functions?: (session: FunctionSession) => Record<string, FunctionHandler>;
  onSession?: (session: FunctionSession) => void;
  runs?: RunSink;
  reactions?: readonly { table; op?; run }[];         // see "Reacting to writes"
  // what is added to moss that is not its core (see "Features")
  features?: readonly Feature[];
};
```

Every field is an artifact (authored data) except the code seams — `scope`,
`identity`, `phrases`, `functions`, `onSession`, `runs`, a reaction's `run`
— and `features`. Absent `shell`, the app serves data only
(no server shells). Absent `functions`, `fn:` endpoints fail loudly.

- `assignments` is optional: an app that declares `identity` answers roles per
  principal and never builds the map. `wearable` declares the role
  combinations the boot gates check; absent, they are derived from
  `assignments`, one per distinct combination.
- `scope(principal, identity?)` — what a principal is beyond its id (a tenant,
  an org). Moss always injects `{ userId }`; this contributes the rest, merged
  server-side and asked per request, so a value derived from the clock is
  never held for a session. Synchronous.
- `identity.resolve(principal, read)` — who a principal is, resolved once per
  session and cached by moss (bounded by `runtime.identityMax` /
  `identityIdleMs`, re-resolved every `sessionRevalidateMs`). Returns an
  `IdentityRecord`: `{ roles, scope, installed?, tag? }`. `read(fingerprint,
  scope)` executes a seeded entry through moss's engine, replay-only, under
  the policy of the charter role `identity.as` names (it throws when `as` is
  unset). Moss never reads inside the record's `scope`. Absent, `assignments`
  and `scope` answer, and every registered integration is live for everybody.
- `onSession(session)` — called once per living app shell, for session code
  that is not an endpoint (an observer, a roster). It runs before the shell
  finishes building, so it must not touch `session.shell` synchronously. Its
  return value is ignored. It does not run for a page.
- `runs: (record: RunRecord, session: FunctionSession) => void` — where model
  runs go. Fed by `session.recordRun`; no default sink, unset means
  unrecorded. A `RunRecord` carries `at`, `principal`, `shellId`, `agentId`,
  `agentPath`, `label`, `provider`, `model`, the token counts, `reported`,
  `steps`, `elapsedMs`, `outcome`, and optionally `turns: RunTurn[]` (the whole
  exchange; a tool call and its result are two turns) and `response`.
- `grammars` — strata sequences for documents only this app defines the shape
  of (its kit's component props). See "Documents are read in this code's
  grammars" below.

A `LayoutVariant` is `{ action: string; layout: LayoutNode }` — ring 2: the
charter's `layouts` section selects who is granted which variant id, and moss
substitutes the granted variant's layout onto the definition at shell build. The
base is the floor; variants enrich upward as grants.

#### `ShellManifest`

```typescript
type ShellManifest = {
  canvases: ShellCanvas[];        // a canvas's `initial` may be a CANDIDATE list
  layout?: LayoutNode;            // the frame — CanvasSlot markers, served verbatim
  layoutStore?: Record<string, LayoutNode>;   // what a `{ ref: id }` in the frame resolves to at boot
  fragments?: Record<string, ActionFragment>;
  inputs?: (session: { principal, actions, roles, identity, wire }) =>
    Record<string, Record<string, unknown>> | Promise<…>;
  seeds?: (session: { principal, actions, roles, wire }) =>
    Record<string, CanvasSeed[]> | Promise<…>;
  components?: Record<string, { meta?: { description?; propsSchema? } }>;
};
```

Two per-principal boot hooks, both of which may be async and are handed the
session's governed `wire`. `inputs` derives boot **data** (nav flags, user
chips), merged over each canvas's static seed. `seeds` derives boot
**instances**: by canvas id, the actions to push, in order, ring-1-filtered
like every other mount — a seed the principal is not granted does not mount.
A `CanvasSeed` is an action id or `{ action, input?, with? }`, and a
`ShellCanvas` is nova's canvas config with `initial` widened to one seed or a
list of candidates. Neither type is exported by name: `ShellManifest['canvases']`
carries both.

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
  a member is granted, on a canvas whose candidate list a stranger is granted
  none of. Nothing in a layout asks who anybody is.
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
does not have, and a path that names one parameter twice (`/docs/:id/versions/:id`:
the parameters are handed over by name). Any path no page answers is the app's.

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
phrases?: (session: { principal: string | null; identity: Record<string, unknown>; wire: FetchFn }) =>
  Phrasebook | undefined | Promise<Phrasebook | undefined>;      // source phrase → translation
phraseKeys?: PhraseKeys;                                         // which keys carry prose
```

- Per **principal**, because a shell is per principal. Resolved once when the
  shell is built, so changing somebody's language is a `reset`/rebuild — exactly
  like changing their catalog. May be async; it is handed the session's wire
  and the scope half of the resolved identity, so a book can be read from rows.
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
  identity: Record<string, unknown>;  // the scope half of the resolved identity
  actions: readonly string[];      // the session's granted action ids, installs filtered
  wire: FetchFn;                   // the server's own surfaces, as this session
  grant: (token: string) => void;  // session GRANT (login): send it down, reconnect
  revoke: () => Promise<void>;     // session REVOKE (sign-out): close 4403, evict
  answerIntent: (                  // a query written for an intent, as this principal
    writers: { generateDsl: GenerateDsl; mapToShape: MapToShape },
    asked: { intent: string; shape: unknown; context?: Record<string, unknown> },
  ) => Promise<QueryResponse>;
  recordRun: (run: Omit<RunRecord, 'at' | 'principal' | 'shellId'>) => void;
};
```

`revoke` settles when the credential is gone: under `session: 'sessions'` it
deletes every session the principal has (`revokeAllFor`). `recordRun` is a
no-op when the manifest declares no `runs` sink.

**A session says who is calling and holds no key.** It carries no `runtime`
(the database pool, the operator key, the signing seed) and no `policy` (the
object the routes enforce for everybody holding those roles). What app code
needs of either has a call:

- **A read or a write as the caller**: `session.wire`, the routes, enforced.
- **A query written for an intent**: `session.answerIntent(writers, asked)`.
  The routes replay stored queries and write none. An app that lets a model
  write one hands over vex's two writers (`generateDsl`, `mapToShape`), the
  intent and the shape. The query is written, compiled and run under the
  policy and the scope values the routes serve this principal under, resolved
  when it is asked: the writer is shown only the tables they may read, and a
  query that reaches past their policy is refused. It is kept in the cache the
  routes replay from, so `answer.meta.cache.fingerprint` replays over
  `session.wire` afterwards, for whoever the policy lets. Moss keeps one
  engine for each `writers` object: hand over the same object each time. It
  rejects with what vex throws (`code: 'unsatisfiable'`, `'scope_denied'`).
- **What the caller's roles may read and write**, for code that chooses what
  to offer: `server.policyForRoles(session.roles)`. A copy compiled for the
  asking, the asker's own.
- **The app's own database**, for machinery no caller's policy describes
  (minting a session for somebody else, a sync, a refresh): the runtime the app
  created and handed to `createServer`, closed over where the app builds its
  manifest. Moss does not hand it back.

### The environment

#### `NiscRuntime`

```typescript
type NiscRuntime = {
  pool: PgPool;                    // SQL
  db: MutationClient;              // writes
  cache?: CacheBackend;            // defaults to vex's postgres cache on `pool`
  vexConfig?: QueryEngineConfig['config'];  // the query engine's settings (limits, read timeout); default vex's own
  session: SessionVerifier | 'sessions' | 'dev-open';  // REQUIRED — no default
  origins?: readonly string[];     // origins that are the app's own page, beside the host a request names (a proxy that rewrites `Host`)
  migrations?: 'apply' | 'verify'; // the boot's ledgered run; default 'apply'
  tables?: readonly Sequence[];    // the app's own table sequences, in that same run
  shellIdleMs?: number;            // idle shell eviction; default 30 min, `0` disables
  anonymousShellMax?: number;      // shells for nobody signed in alive at once; default 1,000, `Infinity` is no limit
  endpointTimeoutMs?: number;      // a server shell's endpoint call; default nova's, 30s
  sessionRevalidateMs?: number;    // live-socket re-verify; default 60s, `0` disables
  identityMax?: number;            // resident identity records; default 10,000; 0 or less refuses the boot
  identityIdleMs?: number;         // drop an unread identity record; default 30 min, `0` disables
  shellFrameDelta?: boolean;       // send changed canvases as deltas; default off
  socketCompression?: boolean | Record<string, unknown>;  // permessage-deflate; default on
  socketMaxMessageBytes?: number;  // the largest message a connection may send; default 256 KiB
  operatorKey?: string;            // enables `/operator/*`; absent, every route there is 404
  operatorGate?: (c: Context, next: Next) => Response | void | Promise<Response | void>;
  fabric?: Fabric;                 // cross-process invalidations and nudges; default off
  telemetry?: Telemetry;           // one span sink; default off
  signingSeed?: string;            // dev only: a stable assertion signing keypair; 32 bytes as base64, and fewer refuses the boot
};
```

`SessionVerifier` is `(token: string) => string | null | Promise<string | null>`:
the function form of `session`. The type is not exported by name.

`socketCompression` and `socketMaxMessageBytes` are settings of the Node
transport. The server reads them, once, and the socket it hands out
(`server.socket`) carries them to whichever transport is handed it. So they
hold wherever that socket is attached: under `serve`, `nisc start`, the dev
plugin (`nisc dev`), and a host of the app's own that calls
`attachSocket(httpServer, server.socket)`. No host says them again.

`session` is required, deliberately — authentication is the one door that must
not default open, and it used to. Three answers: `'sessions'` uses moss's own
stored credential (below); `'dev-open'` trusts every well-formed token and says
so at boot — harnesses and demo floors; a function is the app's own identity
provider — return `null` for a token that has expired or been revoked. moss
never learns what expiry means — it only asks again, on both surfaces. A
function is named at boot too, in one line (`[moss] session: a function the app
supplied (…) decides who a token is.`): moss cannot tell an identity provider
from a stub that trusts whatever it is shown, so the choice is in the log.

`anonymousShellMax` — how many shells for nobody signed in may be alive at
once. Somebody signed in has one shell however many terminals they open; nobody
signed in has one for each connection, and opening a connection takes no
account and no token. A connection over the limit is sent
`{ type: 'error', code: 'at_capacity' }` and closed with `4503`; no shell is
built for it, and its terminal tries again later, as after any other close.
Somebody signed in is served whatever the count is, and a shell one of the
manifest's pages builds for somebody signed in takes no place.

The default is from a measurement (2026-10-10, Node 24): lyceum's real boot,
2,000 connections for nobody opened through `server.socket` and held, the heap
read after a forced collection before and after, with a transport that drops
what it is sent.

| | for each shell for nobody |
| --- | --- |
| heap used, lyceum (its lock screen: 6.7 KB as JSON) | 52.5 KB |
| resident size, lyceum | about 110 KB |
| heap used, an app of one canvas and one action | 26.7 KB |
| the Node transport, compression on (below) | about 260 KB resident more |

At 1,000 that is about 53 MB of heap, and about 370 MB resident with the
transport's compression: the largest round number that still fits a process
given 512 MB. A deployment with a public screen and more visitors at once than
that raises it from those numbers and its own memory, and turns compression off
or down first.

#### `mintSession(pool, principal, ttlMs)` / `sessionOf(pool, token)` / `revokeAllFor(pool, principal)` / `initSessions(pool)`

The stored credential behind `session: 'sessions'` — the integration key's
standard, one table over: 256 bits behind an `st_` prefix, the row keeps only
the hash, `expires_at` is enforced on every read, and revocation is deleting
the row.

- `mintSession` answers the token, once. The app mints at its own door after
  its own identity check and hands the token to the terminal (or sets it as
  the browser's cookie, [`sessionCookies`](#sessioncookiespage-token-options)).
  Expired rows are swept on every mint — no timer to run.
- `sessionOf` answers the principal a token resolves to, or `null`. Under
  `session: 'sessions'` the server asks it for you (`server.principalOf`); it
  is exported for an app whose own verifier function is built on it.
- `revokeAllFor` deletes every token a principal holds: signed out everywhere.
  `session.revoke()` in a function calls it for the session's own principal.
  No exported call deletes one token and leaves the principal's others.
- `initSessions` creates the table, through the ledger below. `createServer`
  does that itself under `session: 'sessions'` and only then, so it is for a
  host that is not moss's server, and for an app whose `session` is a function
  built on `sessionOf`.

**Tables go through a ledger.** moss creates no table on its own: its tables are
[strata](../strata/README.md) sequences — `MOSS_SEQUENCE` (`nisc.moss`:
integrations, their actions, the generation pointer) and the sessions table's
(`nisc.moss.sessions`; the sequence itself is not exported, `initSessions` runs
it) — and `createServer` applies them with the vex cache's sequence in
one ledgered run before introspection: once, recorded in `strata_ledger`, and
refused if the ledger was edited or written by newer code. `migrations` on the
runtime picks the posture: `'apply'` (default) runs what is pending; `'verify'`
refuses to boot if anything is, for a deployment that migrates as a deploy step.

The run's order is: `MOSS_SEQUENCE`, the sessions table's under
`session: 'sessions'`, the vex cache's, the tables the app's features keep
(`Feature.tables`, in the order the app named the features), then
`runtime.tables`.

`tables` on the runtime hands over the app's own table sequences. They join
that run last — one transaction, one lock, one posture, so `'verify'`
covers them. Absent, the app migrates its own tables itself, as before. Another
owner's tables the app keeps go in the same list (tide's: `TIDE_SEQUENCE`,
from `@niscorp/tide/postgres`), and a
runtime that hands tables over does not also migrate them itself.

#### `migrateTables(runtime, app, { dryRun? }): Promise<TablesReport>`

The step that changes tables, for a deployment that migrates before it starts
(`nisc migrate` calls it). It applies everything pending in the one run,
whatever `runtime.migrations` says — the tables the app's features keep
included, read off `app.features` as the server reads them — and before the
run may commit it asks
whether `app`'s entries fit what it leaves: every read is resolved against the
schema as the transaction sees it, every write is put to the gate vex puts it
to before it runs (`mutationMisfits`: its table, the columns it writes, its
WHERE, its lookups, its conflict target, what it reads from an earlier
statement). An entry that does not fit refuses the run — strata's
`DOES_NOT_FIT`, each
reason as `fingerprint: why` — and nothing was applied. It asks on every run,
so a release that changes an entry and no table is checked too.

One kind of entry is said and not refused: one that already did not fit before
the run and that the database already holds seeded exactly as it is. That is an
old fault, not this run's. A new or changed entry gets no such pass.

`TablesReport` is strata's `{ applied, plan }` plus `removed` (tables and
columns the run takes away), `retyped` (columns whose type it changes, as
`table.column (was → now)`) and `alreadyBroken`. `dryRun` does all of it and
rolls it back.

It sees entries and nothing else: not SQL written by hand, not a column a scope
rule stamps, not what a value means.

**Documents are read in this code's grammars.** Stored integration actions
carry a `grammar` stamp. At boot, after the
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

#### `mintDevToken(sub, claims?) : string`

Mints a dev token — base64url JSON, `sub` is the principal, no signature and
no expiry. The verifier that trusts one is not exported: it is reachable only
through `session: 'dev-open'`, never by default. Anybody who can spell a
principal's id can be them, which is a property a harness wants and a
deployment must opt into out loud.

### The server

#### `createServer(app, runtime): Promise<MossServer>`

Stands up the data layer, **refuses to boot** on an incoherent charter
(`verifyCharter`'s errors), memoizes per-principal policy,
catalogs, and ring-2 variant bindings, mounts the vex surfaces and `/catalog`, and — when the manifest
declares a shell — the shell host behind the socket. Also refused at boot: an
entry whose `reach` names no profile the behaviors declare, and two pages that
could answer one path. A broken closure is not among them: the closure audit's
findings land in the report's `perRole[].issues`, which boot does not read. A
role granted an action that pushes one it is not granted boots, and the press
does nothing. Returns a Hono app extended with the `MossServer` members below.

`createServer` wires, and answers no question of its own (`src/server/`). In
order: the manifest is read and frozen; who a token is is resolved
(`runtime.session`; unset, the boot is refused here, before a table exists);
the tables are migrated and the data module stands; the running manifest is
created, which is the boot check; identity; the server's own routes (the
authentication, `/catalog`, vex); the shell hosts, the app's and each page's;
what crosses processes; the features, each started with the seams; the
operator prefix; the app's reactions hear a write; the generation pointer is
watched; the socket.
A step that refuses is the boot's refusal.

**The manifest is read first.** Before a table is created or a row is read,
`createServer` parses the manifest with a schema, and a manifest that does not
parse refuses the boot:

```
The manifest does not parse — refusing to serve:
  actions.home: Unrecognized key: "tittle"
  shell.inputs: expected a function
```

Each line is a place and what was expected there. An action, a fragment and a
layout (a layout variant's, a canvas's, the frame's, the layout store's) are
read by nova's schemas; an entry's `dsl` and `mutation` by vex's and its
`mapping` by Prism's; `grammars` by strata's. Every other data field is held to
the shape `NiscApp` gives it, and a field `NiscApp` does not have is refused.
A code seam is held to being a function. A component's contract
(`shell.components`) is the kit's own record and may carry more than moss
names. The charter and `behaviors` are held to being objects; the charter is
verified by the check below and `behaviors` by vex when a policy is compiled.

**Then it is frozen**, every level of it, in place. Once `createServer` has
returned, an edit to the manifest throws a `TypeError` where it is written:
`app.actions.x = …`, `delete app.actions.x`, `app.actions = …`,
`app.charter.role = …`, `app.entries.push(…)`, a write to a definition, a
layout node, a canvas, a variant. A function, and an instance of a class (a
zod schema handed over as a component's `propsSchema`), is not frozen and not
looked inside. An object the app shares between its manifest and its own code
is frozen for both.

What an app consists of changes in one way while a server runs: a set of
actions is handed over with `server.replaceActions(source, actions)`, which
verifies before it switches. A charter, a layout variant, an entry, a behavior
and the shell do not change under a running server; they change in the manifest
the next server is created with.

What the server answers over HTTP:

| Path | What |
|---|---|
| `GET /catalog` | `{ principal, actions, hash }` — the application, resolved for the caller |
| `/api/vex` | the vex surface over the full schema: locked (replay-only), scoped per principal |
| `/api/<resource>/vex` | the same, over one of `app.resources`' entity subgraphs |
| `/operator/*` | nothing of the server's own; a feature's operator routes and the app's, behind `x-operator-key` and `runtime.operatorGate` |

A feature the app names in `features` adds its own routes to these (see
[`@niscorp/moss/integrations`](#niscorpmossintegrations) for the ones that
feature serves).

The socket is not a Hono route: `server.socket` is fed by the runtime's
transport (`/socket` under `serve` and `attachSocket`). Every request is
identified once, from `Authorization: Bearer <token>`: a session token goes
through the `session` verifier (`401` when it does not resolve); a token
whose prefix a feature registered is that feature's to read (the integrations
read `ik_`, an integration key); no header is the anonymous principal. There
is no `/fns` surface.

A token that is nobody's is a failed sign-in: `401`, `invalid_token`. A
failure to *find out* who is calling is not: the verifier throwing, the
identity seam throwing, an identity record that does not parse, a feature's
credential that cannot be read. That is answered `500`
`{ error: 'identity_failed', message }` and the error is in the server's log;
none of its text is sent. A client that drops its session on a `401` does not
drop it over a fault of the server's. An app whose `identity.resolve` does not
know a principal answers a record for nobody (`{ roles: ['public'], scope: {} }`)
and does not throw.

#### `MossServer`

`Hono<Env> & { socket; shells?: ShellHost; principalOf; page; pages;
refresh; replaceActions; verifyActions; actions; catalogOf; catalogForRoles;
policyForRoles; charterReport; invalidateIdentity; invalidateTenant; identity;
executeAs; nudge; generation; close; identities? }`.
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
- `refresh(): void` — something the server derived its answers from changed
  where it cannot see (a role, an install): run the check boot runs over what
  is in force (the charter, every entry's reach, the layout variants), drop
  every per-principal memo and identity record, and have every living shell
  adopt: it is brought level with what its principal holds now, in place
  (`ShellHost.adopt`, below). It also moves the generation pointer,
  so every other process on the same database does the same within one poll.
  It ships nothing: the manifest that was handed over cannot be edited, and
  `replaceActions` is how actions arrive.
- `replaceActions(source, actions): void` — hand over a set of actions that
  arrived while the app runs (an app that loads actions from its own tables).
  `source` names the set: handing the same name over again puts the new set in
  place of the old, so an action it no longer names leaves. The actions in
  force are what the app shipped, then each set. What the app would then
  consist of is verified first: refused, it throws (`Refresh refused — …`,
  with what the check found) and nothing changed; accepted, it does what
  `refresh` does, and the set is frozen as the manifest was, so a set is
  changed by handing over another of the same name. Every definition of the
  set is read by nova's schema first: one nova does not read refuses the set
  (`Refresh refused — actions nova does not read:`, naming the action and what
  is wrong with it). `'integrations'` is the integrations feature's set, read
  from its tables.
- `verifyActions(source, actions): ManifestReport` — the dry run of
  `replaceActions`: the same verification over the same candidate (the app's
  actions, then each set, with `actions` in place of the set called `source`),
  answered as a report. Nothing changes. `errors` is `{ check, detail }[]`,
  `check` one of `'actions'` (a definition nova's schema does not read),
  `'charter'`, `'reach'`, `'variants'`; empty means `replaceActions` would
  accept the set. `said` is what a boot only says (a
  chain of steps that never ends), and `charter` is the charter engine's whole
  report for the candidate.
- `actions(): Readonly<Record<string, ActionDefinition>>` — the actions in
  force now, by id: what the app shipped, then each set handed over. To read;
  a set changes through `replaceActions`.
- `catalogOf(principal): Promise<{ ids, hash }>` — what a principal holds of the
  actions in force: `{ ids, hash }`, the granted action ids sorted, with a
  content-hash version token (equal hash, equal application). The principal is
  resolved the way a request resolves it (the `identity` seam, or
  `assignments`), so an integration's actions are there only where it is
  installed. `null` is nobody signed in.
- `catalogForRoles(roles, installed?): { ids, hash }` — the same for a caller that
  already knows the roles. `installed` is the integration ids live for them;
  left out, every integration is live.
- `policyForRoles(roles): ScopePolicy` — what a set of roles may read and
  write: the vex policy a request by somebody holding exactly these roles is
  served under, compiled from the charter and `behaviors` over every table the
  database has. **One policy per role, merged** — a person may wear several (an
  instructor who also trains here), and reach belongs to the role rather than
  to the person; the merge is a union, broadest wins. For a check or a tool
  that reads the rules (`policy.entities['bookings']`): nothing is queried, and
  the answer is compiled for the asking, so it is the caller's own.
- `charterReport(): VerifyReport` — the report `verifyCharter` gave this server:
  boot's, then that of each change that passed. `{ errors, warnings,
  perRole }`, over the universes boot resolved against. Boot and `refresh` read
  `errors` alone and print nothing of the rest, so this is where a host reads
  it, to draw, log or hold a deploy on: `warnings` (an action no role grants, an
  `allow` that matches nothing) and each role's closure `issues`. `errors` is
  always empty here. A push whose target is a binding (`@event.payload`,
  `$.target`) is listed among the `issues` as "not in the catalog", though it is
  resolved when the step runs; a `{{…}}` target is not listed.
- `generation(): number` — the generation this process last observed (`-1`
  before the first read).
- `invalidateIdentity(principal): boolean` — forget one principal's identity
  record and reset their shell (a role change). `false` = no record was held.
- `invalidateTenant(tag): number` — forget every identity record wearing the
  tag the app put on it (`IdentityRecord.tag`); answers how many. Forgets, does
  not reset shells.
- `identity(principal): Promise<IdentityRecord>` — who one principal is,
  resolved the way a request resolves it: `{ roles, scope, installed? }`,
  through the same cache the request path uses. `null` is nobody signed in.
  With no `identity` seam the roles are the ones `assignments` names, and
  `scope` is empty.
- `identities?: { list(); meter() }` — the resident identity
  roster (`{ principal, since, lastSeen }`) and what the cache costs
  (`{ size, max, resolved, evicted, expired }`). Present only when the app
  declares `identity`.
- `executeAs(role, fingerprint, context, scope?): Promise<unknown>` — execute a
  seeded entry as a declared charter role, for surfaces with no principal by
  nature. In-process only, replay-only, policy compiled from that role, scope
  values supplied by server code. Its type is exported as `ExecuteAs`, for
  code that is handed the function and no server.
- `nudge(principal, channel): void` — publish, payload-less, onto one
  principal's living shell, in whichever process holds it (local `deliver`,
  then the fabric).
- `close(): void` — stop every timer the server started (the generation poll,
  the identity sweep, socket revalidation, the shell idle sweeps). For a host
  that retires a server in-process; every timer is unref'd, so a process that
  boots once needs none of it.

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

#### `live` — can anything on this screen still happen

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
holds the entries behind each fingerprint (`src/shells/liveness.ts`; the
function is not exported, its answer is `live`, `why` and `drawnWith` on the
snapshot).

When `live` is false the trees are the whole of the screen, and the terminal
opens no socket.

#### `renderDocument(config): Promise<DrawnDocument>`

```typescript
const page = await renderDocument({
  server,                                   // the MossServer, or anything with its `principalOf`, `page` and `shells`
  template,                                 // the app's index.html, as it would go out undrawn
  request: { path, cookie },                // what the request named and carried
  draw: (snapshot) => renderSnapshot({ snapshot, registry, slotWrapper }),
  htmlAttributes: (snapshot) => ({ 'data-accent': … }),   // optional
  site: 'https://example.com',                            // optional
});
// → { html, headers, drawn, principal, page?, head?, live?, why?, drawnWith?, settled? }
```

What it is handed is `DocumentConfig`, and what it answers is `DrawnDocument`.

- **Which shell**: the page `server.page(path)` names, else the app's.
- **For whom**: the principal behind the browser's session cookie for the
  wire's token key (`tokenKey`, default `nisc.token`), or nobody. The cookie's
  name ends with the port a page is on, so `request.host` (the `Host` header)
  is how a page on a port finds it; `mountSite` and the vite plugin pass it.
  Behind a proxy that rewrites `Host` to its upstream, the port `site` names
  is tried too.
  A cookie that no longer resolves is nobody. Nothing is written here — the
  upgrade is where the cookie is set and taken back. A verifier that *throws*
  is a fault, not a sign-out: the page goes out undrawn.
- **`draw`** is a terminal that draws to a string — the app's kit bound to
  `renderSnapshot` from `terminal/react/server`, `terminal/vue/server` or
  `terminal/dom/server`. It may be async.
- **`htmlAttributes`** is for what a kit would otherwise set on `<html>` from an
  effect, which never runs on a server: a palette, a colour scheme. Read it off
  the same node the effect reads it from. Values are escaped.
- **The page's `<head>` is its screen's own.** It is a node in a layout —
  nova's `nova:head`, whose children (`nova:title`, `nova:meta`, `nova:link`,
  `nova:script`) are the elements a head holds, their props the elements'
  attributes. It is in the snapshot's trees like everything else on the screen,
  so the elements are read off them and written into the template's `<head>`:
  one takes the place of the tag that said the same thing, anything else is
  added, and the rest of the head is left as the template has it. `head` in the
  result is what was read (`{ elements, actions, refused }`); absent, the
  screen has no head and the page went out with the template's. What a head may
  not hold — something that runs, or styles — is left out and logged. In the
  browser the terminal keeps the page's head on the same node as the screen
  moves, and the template's own tags come back when it stops saying them.
- **`site`** is the address the site is served at. With it, every path's
  document says its own canonical address (`<link rel="canonical">`, `og:url`).
  Without it the template's is left as it is.
- **`template`** must hold the empty root (`root`, default
  `<div id="root"></div>`). The screen goes inside it, the snapshot element
  straight after. `root` is an empty element written as it stands in the
  template, its opening tag and at once its closing tag: any element
  (`<main id="app"></main>`), not only a `div`. A template that does not hold
  the root, or a root that is not an empty element (an opening tag alone, one
  that holds something, one closed in its own tag), has no place for a screen:
  the page goes out undrawn (`drawn: false`), and the second case is logged.
- **`server`** is asked three things, and its type says so
  (`DocumentConfig['server']`): `principalOf(token)`, `page(path)` and
  `shells`, and of each shell host only `snapshot`. A `MossServer` is one.
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
`config` is `DocumentConfig` without its `request`, and `paths`. Each result
(`ExportedDocument`) carries `{ path, html, page?, head?, drawn, live, why, drawnWith, settled }`.
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

#### `sessionCookies(page, token, options?)`

The `Set-Cookie` values that keep `token` in the browser of the page at this
origin — or, for `null`, take it back. For a sign-in the app answers over HTTP
(a link redeemed, a provider's callback): set them on the response, and the
page that follows is signed in having never held the token.

```typescript
server.get('/login', async (c) => {
  const token = await mintSession(pool, principal, TTL_MS);
  for (const cookie of sessionCookies(c.req.raw, token, { lastsMs: TTL_MS })) c.header('set-cookie', cookie, { append: true });
  return c.redirect('/');
});
```

`page` is the request (its `Origin`, else where it was addressed and the
`X-Forwarded-Proto` it arrived with) or the page's origin as a string.
`options.key` is the seat (the terminal's `tokenKey`; default `nisc.token`);
`options.lastsMs` is how long the browser keeps it — left out, until the
browser closes. A sign-in made over the socket (`session.grant`) needs none of
this: the answer to the terminal's next upgrade writes the same cookie.

#### `createPageRouter(pages)`

Answers `{ match(path): { name, params } | undefined }` — the matching rule
above, for a tool that needs it without a server. `pages` is a record of what
the rule reads of a page: `{ path, params?, canvases: { id }[] }`, by name. A
record of `PageManifest` is one. It refuses what a boot refuses: two pages
that could answer one path, a `params` canvas the page does not have, a
parameter named twice. A server makes one router from its manifest's pages,
and `server.page(path)` asks it.

### Reacting to writes

Vex is the choke point every application write passes through, so its write
observer is where a host learns about all of them. Moss hears it once and
offers each write down two lanes with deliberately different privileges: the
app's reactions, which are part of the manifest and are handed no row, and a
feature that asks to hear writes (`FeatureSeams.onWrite`), which is handed
them. The one feature that does is the tide lane, `createTideFacts`. Features
are told first, in the order the app named them, then the reactions, and each
on its own: a listener that throws (an app's `identity`, say) is logged, and
the others still hear of that write. The write was committed before any is
told.

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

#### `createTideFacts` — the tide lane, rows and all

```ts
import { createTideFacts } from '@niscorp/moss/tide';

features: [
  createTideFacts({
    tide: () => driver,                                   // the waking intake
    identity: (scope) => `automation@${scope['studioId']}`,
    chain: (scope, hints) => (isRobot(scope) ? hints : undefined),
  }),
]
```

A feature, from an entry point of its own (`@niscorp/moss/tide`), and not a
field of the manifest: an app that runs no tide names none, and moss's core
imports nothing of tide. `@niscorp/tide` is an optional peer, installed by an
app that names this feature. A manifest that still carries `facts`, where
these three functions used to be, is refused at boot.

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
default: a forged depth could park an innocent chain. A position is a cause
that is not empty and a depth written as `String(depth)` writes a whole number
that is not negative: digits and nothing else. Anything else (an empty depth,
`0x2`, `1e1`, `+2`, a number too large to be exact) is no position, and `chain`
is not asked.

Hand `tide` the **driver** (`createTideDriver`, from `@niscorp/tide`), not
bare tide, so a minted fact wakes the engine instead of waiting for somebody's
beat. It is a getter because the driver stands up after the server does: while
it answers `undefined`, nothing is minted.

#### The driver and the store are tide's

`createTideDriver` and the type `TideDriver` are exported by `@niscorp/tide`.
`createTideStore(pool, options?)`, `TIDE_SEQUENCE`, `TIDE_TABLES` and
`TIDE_DDL` are exported by `@niscorp/tide/postgres`. They were moss's, and do
what they did: see tide's [DOCS.md](../tide/DOCS.md), "The driver" and "The
Postgres store". `createTideStore(runtime.pool)` takes the pool the runtime
holds, and its tables are ordinary tables to moss: introspected, grantable,
and scoped by a behavior like any other.

### Features

A feature is something an app adds to moss that owns none of what the core
answers (who is calling, what exists for them, what they may read and write,
what they are looking at, how it reaches them). It ships from an entry point of
its own, and the core never imports it.

- `Feature` — `{ name: string; tables?: readonly Sequence[]; start(seams:
  FeatureSeams): void | Promise<void> }`. The app puts features in
  `NiscApp.features`. `createServer` starts each one, in order, once its core
  stands and before anything is served; one that throws refuses the boot.
  `tables` is the strata sequences of the tables the feature keeps: they are
  migrated in the one ledgered run, before the feature starts, and
  `migrateTables` runs them too.
- `FeatureSeams` — everything of the core a feature may touch, each member one
  function or one narrow value. Twenty-one members, and each is one a feature
  uses: one that stops being used is taken out. A route a feature mounts reads
  who is calling as `c.get('principal')`.

  | Member | What it is for |
  |---|---|
  | `routes(hono)` | mount routes at the server's root, behind the authentication every route gets |
  | `operatorRoutes(hono)` | mount routes under `/operator`, behind the operator key and the app's gate |
  | `credential(prefix, principalOf)` | read a bearer token that starts with the feature's own prefix, and say who it is |
  | `who(principal)` | who a principal is: their roles, and the integrations live for them |
  | `scopeOf(principal)` | the scope values a principal carries, which the engine pins rows by |
  | `holds(roles, installed)` | the action ids a set of roles holds of the actions in force |
  | `actions()` | the actions in force: what the app shipped, then each set handed over |
  | `replaceActions(source, actions)` | put a set of actions in place of the one of that name; throws when the app could not be served so |
  | `refusalOf(actions)` | the sentence the app would be refused with if exactly these were in force, or `undefined` |
  | `loadActionsFrom(source, load)` | how a set kept in rows is read again when another process changed something |
  | `narrowCatalogs(filter)` | one more rule for which granted actions are there for an install list |
  | `charter` | the charter the app shipped: role names, and what each selects |
  | `components` | the kit's component contracts by name: a description, and the props' schema |
  | `ownEntries({ entries, tables })` | hand over the feature's own reads and writes, and get back how one is replayed |
  | `grammars` | read a stored document in this code's grammars, and stamp one that is written |
  | `fingerprints()` | every fingerprint the app serves |
  | `fingerprintsFor(principal)` | the fingerprints that principal's own policy lets them replay |
  | `onWrite(listener)` | hear every write the routes serve, once it is committed: what vex reports of it, and the place in a chain the request named; answers the way to stop hearing |
  | `telemetry` | where a span goes; absent, none is built |
  | `signingSeed` | the seed the deployment signs with (`runtime.signingSeed`) |
  | `wrapWire(wrap)` | lay a function around the wire a session's screens call through |

A feature is handed no pool. What it reads and writes on its own tables it
authors as vex entries, as an app does, and hands over with the tables they
touch: `ownEntries({ entries, tables })` answers `replay(fingerprint, context)`,
which replays one in process (a read answers its rows, a write the row it
wrote; a refusal throws). Those entries are seeded into a cache of their own,
held by an engine no route is handed, so `/api/vex` answers `cache_miss` for
one of them whatever the charter grants whoever asks, and no surface lists it.
They run under a policy that admits the tables the feature named and no other,
and asks for no principal. A write of theirs tells the app's engine which
tables changed, so a reactive read over one of them answers again.
`fingerprintsFor(principal)` is the fingerprints that principal's own policy
lets them replay, as vex's discovery lists them.

### Many processes

- `runtime.fabric` — `{ publish(message), subscribe(apply) }`, the
  host's transport (Postgres `LISTEN/NOTIFY` is the expected one; the type is
  `NiscRuntime['fabric']`, and is not exported by a name of its own). A
  message is one of the three signals below with `origin`, the process that
  sent it, which moss stamps and checks. It carries
  three signals to the other processes: `invalidate-identity`,
  `invalidate-tenant` and `nudge` — what `server.invalidateIdentity`,
  `invalidateTenant` and `nudge` publish after applying locally. Best-effort:
  each targets state that heals on its own clock. Unset, every path behaves as
  in one process. The wiring is `src/server/fabric.ts` and
  `src/server/signals.ts`; it is the server's own and is not exported.
  **What the transport hands to `apply` is read by a schema** before anything
  of it is used: the object moss published, with exactly its fields. `apply`
  takes whatever the transport read off its wire (`unknown`), so a transport
  hands over what `JSON.parse` answered and casts nothing. What does not parse
  (text that was not parsed, a field of the wrong type, a field no message
  has, a `kind` this process does not know) is dropped, and the first one is
  logged with what was wrong with it and nothing it carried
  (`[moss:fabric] the transport handed over what is not a message…`); the ones
  after it are dropped without a line.
- The generation pointer — the persistent counter `server.refresh()` and
  `server.replaceActions()` move (`moss_generation`, one row, part of
  `MOSS_SEQUENCE`). Each process polls it (on `sessionRevalidateMs`; 60s when
  that is unset), and when it has moved reads again what it keeps from rows
  and drops what it derived. The row is read and moved through vex, by two
  entries of moss's own that no route serves (`src/data/pointer.ts`);
  `src/manifest/generation.ts` holds the clock and no SQL. A move is a compare
  and a set: the next number is written where the counter is still what was
  read, and read again where it is not. A move a process could not follow is
  logged as that and tried again at the next poll; `server.generation()` is
  the last one it followed.
- The identity cache — what holds the records `app.identity` resolves. It is
  the server's own (`src/identity/cache.ts`) and is not exported. Its limits
  are `runtime.identityMax` (default 10,000) and `runtime.identityIdleMs`
  (default 30 minutes); a record is forgotten with `server.invalidateIdentity`,
  `invalidateTenant` and `refresh`, and what is held is read through
  `server.identities`.

### Telemetry

`runtime.telemetry` is a `Telemetry`, `{ emit(span) }` — one sink, off by
default. A `TelemetrySpan` is `{ name, startUnixNano, endUnixNano, status: 'ok'
| 'error' | 'refused', attributes, traceId?, spanId?, parentSpanId? }`. Moss
emits one per vex execution, fn call, integration call, shell build, and socket
upgrade and close. A `socket.upgrade` is `ok` (admitted), `refused` (the token
offered is nobody's) or `error` (the session could not be opened: the verifier
threw, what somebody holds could not be asked, their shell could not be built).
`emit` is never awaited, and a sink that throws costs the caller nothing: the
throw is caught where the span is emitted, and logged.

### Resolution (exposed for tools)

Three functions for a tool that holds a manifest and no server:
`resolveRoles`, `resolvePolicy` and `resolveVariants`. Each reads `assignments`
and nothing else, so for an app that resolves people through `identity` they
answer as `public` for everybody the assignments do not name. A running server
is asked instead: `(await server.identity(principal)).roles`,
`server.policyForRoles(roles)`, `server.catalogOf(principal)`.

- `resolveRoles(app, principal): readonly string[]` — assignment rows; anonymous/
  unassigned wears `['public']`. The name is fixed, and the charter has to
  define it (`public: []` grants nothing). Where it does not, the server still
  boots and nothing is said; then every request with no session, and every
  signed-in principal with no assignment, fails with `Unknown role "public"` —
  a 500, a socket closed `4500`, a page served undrawn.
- `resolvePolicy(app, grants, principal): ScopePolicy` — the compiled vex policy
  this principal reads and writes under. **One policy per role, merged** — a
  person may wear several (an instructor who also trains here), and reach belongs
  to the role rather than to the person. The merge is a union: broadest wins.
- An entry that declares a `reach` (vex) is served under the same roles'
  grants recompiled at that named profile. The vex surfaces and `executeAs` do
  it themselves; it narrows rows, never widens verbs.
- `resolveVariants(app, principal): ReadonlyMap<string, LayoutNode>` — action id →
  the granted variant's layout (ring 2; empty map = every action serves its base).
- What somebody holds is asked of the server, which answers from the actions
  in force: `server.catalogOf(principal)`, `server.catalogForRoles(roles,
  installed?)`. There is no function for it without a server.
- `verifyApp(app, grants): ManifestReport` — the check boot runs, for an app
  that is not booted (a check, a build step): the charter with each role's
  closure audited, every entry's reach, the layout variants. It reads `charter`,
  `actions`, `layouts`, `wearable`, `assignments`, `entries` and `behaviors`
  of what it is handed, so a check may hand it those alone. `grants` is every
  `<table>.<verb>` the database can carry (vex's `scopeGrants(tables)`). The
  report is `{ errors, said, charter }`, as `server.verifyActions` answers it;
  a boot refuses on `errors`. A running server answers for what is in force
  with `server.charterReport()`. It verifies and does nothing else: what it is
  handed is not read by the manifest's schema and is not frozen.

### The shell host

- `ShellHost` — `{ session, snapshot, adopt, deliver, list, reset, stop }`:
  the durable per-principal shell host, as `server.shells` and
  `server.page(path).host`. The server creates it (`src/shells/`; the factory
  is not exported). It is handed no manifest and no
  runtime, but a typed object of what it needs: one function that answers what
  a principal's shell is made of (who they are, the action definitions they
  hold with their roles' layout variant in place, the canvases, the frame, the
  layout store's seed, the fragments, the component names), the app's code a
  shell calls (`inputs`, `seeds`, `phrases`, `functions`, `onSession`,
  `runs`), the wire for a token, and its limits. A shell may sit unattached for
  `runtime.shellIdleMs` (default 30 minutes; `0` disables the sweep).
  - `session(token, principal, options?)` — `options = { seed?, inputs? }`;
    `snapshot` is described under [The document](#the-document), and what it
    answers is exported as `ShellSnapshot`.
    Two first arrivals for one principal in the same moment are handed one
    shell: one is built.
  - `adopt()` — every living durable shell is brought level with what its
    principal holds now, in place (what `server.refresh()` and
    `server.replaceActions()` cause). Definitions that arrived or changed are
    registered and mounted instances keep their state; one that left, or is no
    longer granted, is removed and its instances unmounted. A shell that
    cannot adopt is logged and keeps what it held; the rest go on.
  - `deliver(principal, channel, payload?): boolean` — publish into one
    principal's living durable shell. `false` = they have no living shell;
    nothing is built.
  - `list()` — every durable shell alive right now, each as
    `{ principal, connections, since, idleSince, canvases }`. moss owns the map,
    so moss enumerates it; an app keeping its own note beside it can only drift.
  - `reset(principal): boolean` — dispose that principal's shell and stand its
    replacement in the same slot, carrying the attached connections across.
    `false` = they hold no shell, which is an answer, not an error. The
    replacement is built from what the shell was opened with (for a page's,
    the inputs of its path and its id seed), and a shell's resets run one
    after another.
  - `stop()` — stop the idle sweep (the timer is unref'd, so a plain process
    needn't call it).
- What `ShellHost.session(token, principal)` returns (a type that is not
  exported by name: `Awaited<ReturnType<ShellHost['session']>>`):
  `{ shell, attach, detach, resync, dispatch, publish, back, popTo, reset }`. The living nova `Shell`,
  for in-process hosts (dev checks, embedded tools) that drive it directly;
  remote clients ride `attach`/`dispatch`. `shell` is a **getter** — `reset`
  replaces the shell under a session already held, so a snapshot of the field
  would go on addressing the disposed one.
  `dispatch(canvas, event)` holds what a terminal sent to the shell: the
  canvas must be one the shell has, an `origin` the event names must be an
  instance on that canvas (with none, the canvas's active instance is
  stamped), and the event must parse as one of nova's (`NovaEventSchema`:
  `ui:click`, `ui:submit`, `ui:input`, `ui:focus`, `ui:blur`, `ui:model`,
  `ui:key`, `ui:drop`, with their fields and no others). One that fails any
  of the three is dropped.

### The socket protocol

- `server.socket` is called once for each connection, by the runtime's
  transport: `server.socket(url, connection)`. `server.socket.stop()` ends
  revalidation (the timer is unref'd, so a plain process needn't call it).
  `createServer` builds it (`src/socket/`), handed who a token is, what
  somebody holds, and where a session comes from for the app and for each
  page. Neither its factory nor its type is exported by name: the type is
  `MossServer['socket']`.
- **Identity is asked twice.** At upgrade, and then every
  `runtime.sessionRevalidateMs` (default 60 seconds; `0` disables) for as long
  as the connection lives. A token that stops resolving — or starts resolving to
  somebody else — gets an `invalid_token` error frame and a `4401` close, which
  is the recovery the terminal already performs: drop the token, reconnect
  anonymous, land on the served lock screen.
  - Anonymous connections are never revalidated: nothing they hold can expire.
  - A verifier that **throws** is a fault, not a sign-out — the connection is
    left alone and asked again next pass, so a database blip cannot become an
    outage. Only an explicit `null` (or a changed principal) closes. That it
    threw is logged, once for a pass: how many connections could not be asked
    about, and the first error.
  - One pass at a time: a pass asks about every connection in turn, and one
    that is due while another is still asking is skipped. A slow verifier is
    not asked more the slower it gets.
  - Without this the socket was the asymmetry: the HTTP surfaces re-ask on
    every request, so an expired credential left the socket open and rendering
    while every endpoint the server shell called came back 401 — a live
    interface whose every load silently fails.
- `Connection` — the transport seam: `{ send, close, onMessage, onClose }`.
  `onClose` is called once, as soon as who is asking is decided and before
  `hello`: a connection that closes while its session is being opened (its
  catalog asked, its shell built) is not attached to a shell, so a kept shell
  idles and one built for that connection alone is disposed.
- `ServerMessage` — what the server sends: `hello | catalog | frame | render |
  render-delta | session | error`.
- What a terminal sends is `event | publish | resync | reset | back | popTo`,
  each with exactly the fields the protocol names (`src/protocol/messages.ts`;
  the type of these is not exported, a terminal written by hand sends the
  object).
- **A message a terminal sends is at most 256 KB**, counted as it is once
  inflated. One over that closes the connection with `1009` — the transport's
  own close, not one of moss's — and what it carried did not arrive: the
  terminal reconnects as after any other close, and a signed-in person's shell
  is as it was. The limit is the Node transport's, set by
  `runtime.socketMaxMessageBytes` wherever the server's socket is attached,
  and it is a bound on memory, not on speed: the
  server keeps what a message carried — the value in the shell, and again in
  the last frame it sent — and sends it back down in every later frame of that
  canvas. An event is a press, a typed value, a row handed back. A file never
  goes over the socket (AGENTS.md rule 9a): the picker sends it to a route the
  app mounts, or to a system the app already has, and the event carries what
  came back.
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
- `popTo` names a canvas and an instance already on its stack
  (`{ type: 'popTo', canvas, instance }`): unmount everything above it, in one
  step — a breadcrumb's jump, which several `back`s would race.
- **The close codes.** Two are exported, because they are the two a terminal
  recovers from by dropping its token: `CLOSE_INVALID_TOKEN = 4401` and
  `CLOSE_SIGNED_OUT = 4403`. Three more are numbers a terminal written by hand
  names itself (their constants are in `src/protocol/connection.ts` and are
  not exported):
  - `4500`: the server could not open a session for this connection (commonly
    a definition failing validation). A `session_failed` error frame, then the
    close. The frame names the failing definitions when that is the cause; of
    any other cause it says nothing, and the error is in the server's log. The
    refusal is that terminal's alone, and reconnecting later is reasonable.
  - `4503`: the server is serving as many terminals with nobody signed in as
    `runtime.anonymousShellMax` allows, and built no shell for this one. An
    `at_capacity` error frame, then the close. Not a recovery: the terminal
    keeps what it holds and reconnects with its usual backoff.
  - `4426`: the two ends speak protocols the other cannot (below).
- `error` codes: `invalid_token`, `session_failed`, `at_capacity`,
  `client_too_old`, `server_too_old`, `no_shell` (the app serves no shell),
  `invalid_message`
  (what was sent is not JSON, not one of the messages above, or one of them
  with a field it does not have: nothing of it is acted on), `message_failed`
  (the server threw acting on a message it could read; why is in its log, and
  the connection stays open), `seal_not_kept` (a sealed sign-in came back with
  no seal to open it).
- **Who a terminal is** is decided on the upgrade request, from a header of
  it — never from its address, which is what every proxy on the way writes
  into its log. A terminal offers the subprotocol `nisc`, and beside it its
  token when it holds one: `offerToken(token | null)` returns the list to
  construct the socket with (`new WebSocket(url, offerToken(token))`), and the
  server answers `nisc`. A token in the address (`?token=`) is not read. A
  transport hands the offer over as `connection.upgrade.offered`
  (`Sec-WebSocket-Protocol`, split); one that leaves it out serves every
  terminal as nobody. `attachSocket` does it.
- **A browser on the app's own page** is who its session cookie says
  ([`sessionCookies`](#sessioncookiespage-token-options)). The cookie is read
  only when the upgrade's `Origin` is the host it was addressed to, or one
  `runtime.origins` lists. (Behind a proxy that rewrites `Host` and with
  nothing listed, no page is the app's own: terminals hold their own tokens,
  as before, and moss says so once in the log.) A token such a page offers is who it is and is
  moved into the cookie by the answer to the upgrade; one that no longer
  resolves is nobody (served, not refused) and is taken back. `?key=` names
  which of the browser's sessions the terminal is — a seat; the cookie is named
  by it. `?leave=1` is a terminal that was signed out: it is nobody whatever
  its browser holds, and the cookie is taken back. A transport passes what the
  request carried as `connection.upgrade` — `{ offered, origin, host, cookie }`
  — and, when it has not answered the request yet, `answer(cookies)`: moss
  calls it once who is asking is decided, with the `Set-Cookie` values to
  answer with. A transport without `answer` reads cookies and writes none.
- **A sign-in is handed to such a page sealed.** A terminal whose browser can
  keep a session says so (`?sealed=1`; `browserEnv` does), and the answer to
  its first upgrade gives the browser a *seal*: a key in a second cookie no
  script can read — or, over https, set (`__Http-nisc.seal`; `nisc.seal` over
  plain http) — sent only with the socket's path. `session.grant(token)`
  then reaches that terminal as `{ type: 'session', sealed }` — the token,
  encrypted with the seal and good for a minute — which it offers back on its
  next upgrade (`offerToken(null, sealed)`); the browser's seal opens it there
  and the session cookie is written. Offered with another seal, altered, or
  late, it opens nothing and the terminal is nobody. A browser that sent no
  seal to open it with does not keep cookies: the terminal is told
  (`seal_not_kept`), stops asking, and is handed the next sign-in as a token.
  Any other terminal — a process, a page on another origin — is handed
  `{ type: 'session', token }`, as before.
- **Protocol version.** `PROTOCOL` is the wire protocol this server speaks and
  `PROTOCOL_MIN` the oldest it still serves. A terminal names its protocol on
  the upgrade (`?protocol=N`); one that names none speaks `1`, which is every
  terminal built before the question existed. Outside the range the connection
  is refused before anything is served: an `error` frame (`client_too_old` or
  `server_too_old`) and a `4426` close. `hello` carries `protocol`, so a
  terminal can refuse a server older than it can speak to. Bump `PROTOCOL` when
  a message changes shape; raise `PROTOCOL_MIN` only when the server stops
  speaking an old one. Both are `2` today: at `1` the token rode the address,
  and a server that went on reading it there would keep that open. `PROTOCOL`
  and `offerToken` are exported from the package root, for a terminal written
  by hand; `PROTOCOL_MIN` and `CLOSE_PROTOCOL_MISMATCH` are defined in
  `src/protocol/connection.ts` and are not.
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

The setting is the Node transport's, and the server's socket carries it there
from the runtime: it holds under `serve`, `nisc start`, the dev plugin, and a
host that attaches `server.socket` itself.

#### Frame deltas — `runtime.shellFrameDelta`, default **off**

A changed canvas, described against the frame that connection already holds:
copy runs from the old frame plus literal inserts, checksummed.

```typescript
// server
const server = await serve(app, { pool, db, session: 'sessions', shellFrameDelta: true });

// terminal — both ends have to want it
const wire = createWire({ delta: true });
```

**Both ends must opt in.** The terminal advertises `?delta=1` on the upgrade
url; the server sends deltas only if `shellFrameDelta` is on *and* the delta is
at most 60% of the whole frame. A terminal that never advertises — including
every terminal built before this existed — receives whole frames forever, from
the same shell, in the same pass. The two kinds of connection coexist.

**A canvas whose frame is over 64 KB is always sent whole.** Comparing two
frames costs the server in proportion to their size, not to what changed, and
it does that work on the thread every session shares — about 7 ms at 64 KB, a
second at 2.7 MB. So when the frame a terminal holds, or the one replacing it,
is longer than 64 KB, the server does not compare them. It is not a setting.

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
- `src/protocol/delta.ts` is the whole implementation — `encodeDelta`, `applyDelta`,
  `frameHash`, none of them exported — with no dependency, small enough to
  read in full. A delta layer that cannot be audited is a desync you cannot
  diagnose.

## `@niscorp/moss/node`

- `serve(app, runtime & { port? }): Promise<MossServer>` — boots and listens:
  `createServer` runs inside (boot refusal included), then HTTP + the socket
  in one process. `port` defaults to 8787. **`close()`
  on the server it returns stops what `serve` started**: moss's own timers,
  then every connection (closed `1001`), then the listener. `serve` hands back
  neither the listener nor the transport, so that is the one way to stop them.
- `attachSocket(httpServer, accept, path?, options?): { close }` — embed the
  socket on an existing server (raw `ws`, `noServer`, path-matched — coexists
  with vite HMR). `path` defaults to `/socket`. **A host that attaches a
  server's socket passes no options**: `server.socket` says how it is to be
  attached (`runtime.socketCompression`, `runtime.socketMaxMessageBytes`), and
  the transport reads that off it. `serve`, `nisc start` and the dev plugin
  all attach it that way. `options = { compression?, maxMessageBytes? }` is
  for a host that means otherwise, and for an accept of its own that says
  nothing; a setting named there wins, and one that is not named stays what
  the socket says. What neither says is the default: `compression` `true`,
  and `maxMessageBytes` 256 KB (`256 * 1024`), the largest message a
  connection may send, in bytes; a message over it closes that connection
  with `1009`. It is handed to `ws` as `maxPayload`, whose own default was
  100 MiB. What it answers is how
  the transport is retired: `close()` ends every connection it opened (`1001`)
  and takes no more, for a host that stops its listener while the process goes
  on.
- A frame the transport refuses — malformed, not UTF-8, over the limit — ends
  that connection (`1002`, `1007`, `1009`) and logs one line; no other
  connection is touched.

- `mountSite(server, { dist, draw, htmlAttributes?, site?, tokenKey?, waitMs?, owned? })`
  — the built terminal, served by the same process as the app (the second
  argument is `SiteConfig`). Every GET that
  nothing registered earlier answers is a file from `dist`, or a page:
  `index.html` with the caller's screen drawn into it (`renderDocument`) — the
  app's own for `/`, one of the manifest's pages for a path that leads to one.
  `index.html` itself never goes out as a file. Register the app's own routes
  first; this is the catch-all. `owned` (default: moss's own prefixes) names
  what is never a page — an unknown path under one is a 404, not a screen. So is
  a **missing file**: a name with an extension that is neither a file in `dist`
  nor a page of the manifest is answered 404 (a browser holding a page from
  before a deploy asks for its script by the old name, and needs "gone" back,
  not a document). A page's own path may have a dot in it (`/docs/v1.2`).
  What a browser may keep of these files, and compressing what goes out, is not
  said here: `nisc start` puts both around the whole server (`@niscorp/cli`,
  "`nisc start`"). A host running its own listener over `mountSite` says them
  itself.
- `MOSS_PATHS` — the prefixes the app server answers itself:
  `/^\/(api|catalog|socket|operator|integrations)(\/|$)/`. The default `owned`
  here and in the dev plugin.

## `@niscorp/moss/vite`

Requires the optional `vite` peer.

- `mossDev(options: MossDevOptions): Plugin` — the app server inside vite's
  dev process (serve only): no proxy and no second process. The socket is
  heard once on vite's own http server, and each upgrade is answered by the
  transport of the app that is booted then: one for each app, set as its
  runtime says (`socketCompression`, `socketMaxMessageBytes`). An upgrade that
  arrives during a boot waits for it; one that meets an app that did not boot
  is refused with `503`. `/` and any path a page answers go out as
  `index.html` through `transformIndexHtml` with the screen drawn in
  (`renderDocument`); `MOSS_PATHS` go to the app server; the rest is vite's.
  An edit under a watched path re-boots the whole app and reloads the page;
  the outgoing server answers until the new one is up, and a failed re-boot
  keeps it. The connections of an app that is let go are closed (`1001`), so
  a terminal that is not a page connects again, to the app that is booted.
  - `options.app(load): Promise<DevApp>` — stand the app up. `load` is vite's
    `ssrLoadModule`. `DevApp = { server, close?, draw?, htmlAttributes?,
    site?, tokenKey?, signIn? }`; absent `draw`, pages go out undrawn.
  - `signIn(who)` enables `/dev/as/<who>`: it puts the returned token in the
    browser's session cookie and goes to `/`. `null` is nobody of that name.
    **It answers requests from this machine only**: the address at the other
    end of the request's socket is loopback (`127.0.0.0/8`, `::1`, or either
    written as an IPv4-mapped IPv6 address). Any other request is answered
    `403` with a sentence that says why, and the app is not asked. What a
    header says of where a request came from (`X-Forwarded-For`) is not read;
    behind a proxy on the same machine every request is the proxy's, and is
    this machine's. **And it is not answered to a page of another site**: a
    request a browser marks `Sec-Fetch-Site: cross-site` is answered `403`
    too, whatever `signInFromNetwork` says. A page open in the developer's
    browser asks from this machine, and sent there by one, the browser came
    back signed in as whoever that page named. An address that is typed,
    pasted, bookmarked or linked from the app's own page is answered; one
    clicked on another site's page is pasted into the address bar instead.
  - `signInFromNetwork?: boolean` (default `false`) answers the sign-in to
    every device that can reach the dev server, for trying a signed-in screen
    on a phone. It hands out a session for whoever the address names: with it
    on and vite listening on a network (`--host`), anybody on that network
    signs in as anybody.
  - `watch?: RegExp` (default: `src/app`, `src/server`, `src/db`, `src/ui` and
    the nisc config), `index?` (default `index.html`), `owned?` (default
    `MOSS_PATHS`), `label?` (default `moss`).

## `@niscorp/moss/integrations`

An integration is a separate service registered with the deployment, whose
actions join the manifest once an operator approves them. It is a feature: an
app that wants integrations creates it and names it in `features`.

```typescript
import { createIntegrations } from '@niscorp/moss/integrations';

const integrations = createIntegrations({
  integrationActor: (integration, actsFor) => `ig_${integration}@${actsFor}`,
  attachable: { 'people.detail': { person_id: 'personId' } },
  menuSlots: ['hub.people'],
});
const app = defineApp({ charter, actions, features: [integrations] });
const server = await createServer(app, runtime);

await integrations.listAttachments('people.detail');
```

#### `createIntegrations(config?: IntegrationsConfig): Integrations`

`IntegrationsConfig`, every field optional:

- `integrationActor(integration, actsFor): string | null | Promise<string | null>`
  — the principal a call made with an integration's key acts as; `actsFor` is
  the request's `x-nisc-acts-for`. `null`, or absent, refuses (`403`).
- `attachable: Record<hostAction, Record<offeredKey, hostDataPath>>` and
  `menuSlots: string[]` — where an integration's actions may appear. A bundle
  that names anything else is refused at intake.
- `assistantTools`, `publishChecks`, `editorRegions` — the names a bundle's
  `assistants` and `documents` declarations may use.
- `placementNames: Record<id, words>` — the host's words for its hubs and
  screens, for the placement sentence stored with an integration.
- `storePress(integrationId, name, bytes, contentType): Promise<string>`
  (`StorePress`) — where a bundle's listing images land; it answers the URL
  they are served from. Absent, a bundle that declares press is refused.
- `outboundTimeoutMs: number` — how long a call out to an integration's
  service may take, its answer and its body together. Default `30000`, nova's
  default wait for an endpoint's reply. It bounds every call: a screen's
  through the proxy, a framed page and its callback, a vendor's webhook,
  `callIntegration`, the bundle fetched at registration, the operator's probe,
  and each press image. A call that is given up on reads as a service that is
  unreachable: `502` from the proxy, the frame door, the webhook and a
  registration whose bundle did not arrive; `callIntegration` rejects; the
  probe answers `status: 0`; a press image that did not arrive refuses its
  bundle (`422`). The shorter of this and an action's own `timeoutMs`
  ends a call, so an integration whose endpoint is slow by nature needs this
  raised as well; an answer that streams for longer than this is cut.
- `pressMaxBytes: number` — how large one press image may be. Default
  `5 * 1024 * 1024`, a number nobody measured. It is held to while the image
  is read: a larger one is given up on where it crosses the line, and the
  bundle is refused naming the path.

An integration's id is lower-case letters, digits and hyphens, starting with a
letter: it is a segment of every path the integration is served under and a
part of every action it ships. A registration under any other id is a `400`,
and a bundle that calls itself anything else is refused at intake.

`Integrations` is a `Feature` that also carries the calls an app makes. They
work once a server has started the feature, and reject with a sentence before
that:

- `callIntegration(id, path, { principal, method?, body?, scope? }):
  Promise<Response>` (`CallIntegration`) — call an installed integration when
  nobody is driving; throws unless it is approved and installed for the
  principal's tenant.
- `listAttachments(hostAction): Promise<{ actionId, preview }[]>` — the approved
  integrations' actions that ride a host action.
- `listPlacements(): Promise<Record<actionId, hub>>` — the ones placed under a
  menu hub.
- `integrationByKey(key): Promise<string | undefined>` — the approved
  integration a presented key belongs to.
- `integrationOfAction(actionId): string | undefined` — which integration an
  `ext.<audience>.<integration>.<name>` action belongs to. Also exported by
  itself; it reads nothing and needs no server.

Which integrations are live for a principal is `installed` on the record the
app's `identity.resolve` answers; absent, every approved integration is live
for everybody.

What the feature serves once it is started:

| Path | What |
|---|---|
| `/api/integrations/*` | `GET contract` (`?id=`, `?format=md`), `GET verify-key`, `POST frame` (mint a frame grant) |
| `/integrations/:id/*` | the proxy to an approved integration, as the signed-in caller; plus `frame/:token` (and `frame/:token/:call`) and `hook/*`, which take no session |
| `/operator/integrations` | list, register (`POST`), `:id/approve`, `:id/probe`, `DELETE :id` — keyed by `x-operator-key`, so only when `runtime.operatorKey` is set |

A bearer token with the `ik_` prefix is an integration key: it is resolved to
the integration it was issued to and, through `integrationActor`, to a
principal (`401` unknown key, `403` no actor). No two integrations hold the
hash of one key (a unique index on `integrations.key_hash`).

**What the routes do, in order.**

- *Register* (`POST /operator/integrations`, `{ id, url }`) fetches the
  bundle, runs intake, copies the press, and for an integration that is
  already approved asks whether the app could be served with the new actions.
  Then the bundle lands in one transaction: the integration's row, its actions
  in place of the ones it shipped before, and the hash of its key on the import
  a key is issued with. It lands whole, or the import before it is still
  there, whole.
- *Approve* (`POST /operator/integrations/:id/approve`) reads what the
  integration shipped, asks whether the app could be served with it, and only
  then writes the approval. Refused, it answers `422` with the reason and
  nothing is written.
- *The contract* (`GET /api/integrations/contract`) lists, under
  `fingerprints`, the reads and writes the caller's own policy lets them
  replay: an integration asking with its key reads what its actor's rung
  reaches, and nobody signed in reads what `public` reaches.
- *A frame grant* (`POST /api/integrations/frame`) is an opaque random string,
  kept by its hash in a table with what it opens and when it expires (thirty
  minutes). Any process of the deployment redeems it, and it survives a
  restart. It goes when its time is over, and when its integration is removed.

**Its tables.** `integrations` and `integration_actions` are part of
`MOSS_SEQUENCE` (`@niscorp/moss`). `integration_frame_grants` is the feature's
own sequence, `nisc.moss.integrations`, which it names on itself
(`Feature.tables`), so the server runs it with the rest and `migrateTables`
does too. All three are tables like any other in the charter's `data`
universe: a role granted a data wildcard denies them (`integrations.*`,
`integration_actions.*`, `integration_frame_grants.*`).

The feature reads and writes them through vex, with entries of its own that no
route serves (see [Features](#features)); it holds no SQL. Landing a bundle and
minting a frame grant are batches, so `runtime.db` has to have `transaction`,
as it does for any batch an app writes.

#### `createAssertionSigner(seed?)`

`{ verifyKey, mint(claims, ttlMs?) }` — the ed25519 assertion the feature signs
every call to an integration with, for a check or a service in the same
workspace that wants to mint or hold one. An integration verifies it against
`GET /api/integrations/verify-key`.

`seed` is 32 bytes as base64, and makes the same keypair wherever it is given:
it is what `runtime.signingSeed` hands the feature. With no seed (absent, or
the empty string) a keypair is generated and kept nowhere. **A seed that is
given and decodes to fewer than 32 bytes throws**, when the signer is made,
which for a server is while it boots: `moss: the signing seed decodes to 13
bytes, and a signing key is 32. …` The sentence says the length and never the
seed. It used to be dropped without a word and a random key made in its place.
A seed longer than 32 bytes is its first 32.

## `@niscorp/moss/tide`

A committed write, minted into [tide](../tide/README.md) as a fact. A feature:
an app that runs tide creates it and names it in `features`. It is what moss
keeps of hosting tide; the store and the driver are tide's own.

```typescript
import { createTideFacts } from '@niscorp/moss/tide';

const app = defineApp({ charter, actions, features: [createTideFacts({ tide: () => driver, identity, chain })] });
```

- `createTideFacts(config: TideFactsConfig): Feature` — started by the server
  with the seams, of which it uses one: `onWrite`. It keeps no table.
- `TideFactsConfig` — `{ tide: () => FactIntake | undefined; identity: (scope)
  => string | undefined; chain?: (scope, hints) => hints | undefined }`. What
  each is asked, and when, is under [Reacting to writes](#reacting-to-writes).
- `FactIntake` — `Pick<Tide, 'ingest'>`: the one verb the feature calls. A
  `Tide` and a `TideDriver` are each one.

`@niscorp/tide` is an optional peer of moss, and this entry is the only one
that names it, as a type: an app that imports this entry has tide installed.

## `@niscorp/moss/client`

- `createWire(config?): Wire` — the app end of the socket. `config` is a
  `WireConfig`: `{ url?, env?, delta?, initial?, path? }`. Plain TypeScript, no React, no globals — everything
  host-shaped comes in as a `WireEnv`. `delta` (default `false`) advertises
  that this terminal can rebuild frame deltas; the snapshot it produces is
  identical either way. See [Wire size](#wire-size).
- `WireEnv` — the host seam: `{ tokens: { load, save, clear, held?, key? },
  socket({ url, offered }), defaultUrl() }`. The socket API is WHATWG-standard
  in every host (browser, Node ≥22, Bun); an env only constructs it —
  `new WebSocket(url, offered)`. What is offered is who the terminal is, so an
  env that drops it connects as nobody. `held()` is for a host whose browser
  may keep the session itself: asked after an upgrade is answered, `true`
  makes the wire let go of the token it offered, `false` makes it store it. A
  host with `held` also asks to be handed sign-ins sealed. A host without it
  stores a token as soon as it is handed one. `key` names the terminal's seat
  in the socket's address.
- `browserEnv({ tokenKey?, cookie? }?): WireEnv` — the default host: url
  derived from `window.location`, the page's WebSocket, and the session
  wherever the page can have it kept. Served by the app it talks to, the page
  does not keep it: the browser does, in a cookie the page cannot read, and
  `held` reads the flag beside it. Anywhere else — another origin, a browser
  that refuses cookies — the token is in localStorage under `tokenKey`
  (default `nisc.token`). `tokenKey` is also the seat, and the cookie's name.
  `cookie` is accepted and does nothing: it kept a script-readable copy of the
  token for the server to draw the page from, and the page is now drawn from
  the browser's own cookie.
- `readDocumentSnapshot(doc?): DocumentSnapshot | undefined` — the snapshot a
  server-drawn page carries (`{ frame, trees, principal, seed?, path?, live? }`),
  or `undefined` for a page that carries none. Never throws. `principal` is a
  boolean — whether the page was drawn for somebody — never who.
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
  reset, back, popTo(canvas, instance), dispose }`. `snapshot()` is a
  `WireSnapshot`, `{ frame, trees }`, where `trees` is a map from a canvas's id
  to its tree. `status()` is a `WireStatus`,
  `'connecting' | 'open' | 'closed' | 'incompatible' | 'static'`, and changes notify subscribers like
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
is the same recovery a layer down. It is also the way out of `incompatible`,
once the server has been updated: the connection it makes is found compatible
or not on its own account, and is retried like any other when it drops.

**The wire holds one socket at a time.** Before it makes one it lets go of the
one it had: its handlers come off and it is closed. That one may have closed
already, may have carried another principal, or may be a connect still in
flight when `reset()` was called; whichever, nothing it says afterwards is
heard, and its closing schedules nothing.

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
const wire = createWire();                 // browser host; the session is the browser's to keep
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
  trees survive the swap. `config` is a `MountTerminalConfig`: `{ targets,
  swapKey?, resetKey?, trapBack?, initial?, wire?, url? }` — targets by name, cycled in insertion order;
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
  (`frame`, `canvasTree`, `dispatch`, `publish`), not redeclared — the DOM
  adapter, the React adapter, and the conductor share one contract — and
  beside it `status(): WireStatus`, the connection's status. A target never
  touches the wire directly.
- `Target` — `(api) => TerminalMount` where `TerminalMount = { update,
  destroy }`. The render surface (a DOM root, a stdio pair) is construction
  config on the concrete target, never part of the contract — the conductor
  is surface-blind and runs anywhere the wire does. Renders once on mount;
  the conductor calls `update` on every wire change: a frame, a tree, the
  status.

**The connection's status reaches every target, the same way.** When a
connection drops, the trees the terminal holds stay on screen: a reconnect
re-sends the current ones, and blanking in between would show a working app as
an empty one. So a screen left up by a dead socket looks exactly like a live
one, and every target is told which it is: `api.status()` is `'connecting' |
'open' | 'closed' | 'incompatible' | 'static'`, pulled like the frame and the
trees, and a change of it is an `update`. What a target does with it:

| Target | What it does |
|---|---|
| `terminal/react`, `terminal/vue`, `terminal/dom` | Says it on its root element, `data-wire-status="closed"`, from mount to destroy. Draws nothing. |
| `terminal/tty` | Prints a line for each real change: `… connecting`, `✓ connected`, `× connection lost — retrying`. |
| `terminal/ink` | Shows a line above the screen for as long as it is not open. |
| a target of the app's own | Reads `api.status()` where it paints. |

What a lost connection LOOKS like in a browser is the app's: its kit's
stylesheet (`[data-wire-status='closed'] { … }`), or a component of its kit
that reads the status from what the target provides (`TerminalApiContext`,
`TerminalApiKey`, below) and is drawn again when it changes. Nothing in an
action or a layout knows there is a connection.

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
- `TerminalApiContext` — the `TerminalApi` the target renders against, for a
  kit component that needs the wire itself:
  `useContext(TerminalApiContext)?.status()` is the connection's status, and
  the component is drawn again on every update.
- `TerminalSlotWrapper` — an app component wrapping each action instance at
  the `ActionSlot` boundary; the terminal twin of nova's client-shell
  SlotWrapper. Served trees carry identity only, so its props
  (`TerminalSlotWrapperProps`) are `{ canvasId, instanceId, definitionId }`
  and the content as `children` — `definitionId`, not `action`.
- **Adoption.** A `root` that already holds elements, on a wire that has a
  frame, was drawn on the server from the snapshot the wire started from: the
  target adopts those elements (`hydrateRoot`) instead of replacing them. An
  empty root, or a wire with no frame (the page was drawn for somebody else),
  is rendered as before.

### `@niscorp/moss/terminal/react/server`

- `renderSnapshot({ snapshot, registry, slotWrapper? }): string` — the React
  target, drawing to a string (its argument is this entry's
  `RenderSnapshotConfig`): the same registry, the same wire slots and the
  same frame as the browser's target, so what a server writes is what the browser
  adopts. Its own entry, so a browser bundle never carries `react-dom/server`.
  `snapshot` is `{ frame, trees, live? }` — what `shells.snapshot` answers is
  one. It is drawn with the status the page's terminal starts in: `'static'`
  when `live` is `false` (no socket is opened for that page), `'connecting'`
  otherwise. So a kit component that draws the status draws the same thing on
  both sides. The same holds for the Vue entry below.

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
  component registry bound to the wire via nova's Vue adapter (its argument is
  `VueTargetConfig`), mounted on
  `root` with `createApp`. Registers wire-backed `CanvasSlot` and
  `ActionSlot` — the same origin rule as the react target (an event from
  inside an instance boundary carries that instance as `origin` unless it
  already has one). `update` never remounts: the target's reads of the wire
  depend on a revision the conductor bumps, so only the frame and the canvas
  slots re-render and Vue patches in place — focus and input drafts survive.
- `TerminalApiKey` — the injection key of the live `TerminalApi` (a kit
  component reading `frame()` / `canvasTree()` / `status()` in its render
  re-renders on wire updates).
- `TerminalSlotWrapper` — a Vue component wrapping each action instance at
  the `ActionSlot` boundary, handed `{ canvasId, instanceId, definitionId }`
  as props (`TerminalSlotWrapperProps`) and the content as its default slot.
- **Adoption**, as the react target: a root that holds server-drawn elements,
  on a wire with a frame, is mounted with `createSSRApp` and adopted.

### `@niscorp/moss/terminal/vue/server`

- `renderSnapshot({ snapshot, registry, slotWrapper? }): Promise<string>` — the
  Vue target, drawing to a string through Vue's own server renderer (which is
  asynchronous, so this is). Its argument is this entry's
  `RenderSnapshotConfig`.

## `@niscorp/moss/terminal/dom`

- `domTarget({ root, registry? }): Target` — nova's DOM adapter rendered into
  `root`. Omit `registry` for nova's default component kit, with its
  stylesheet injected once per document and its class on the root; pass your
  own and nothing is injected — the look is the app's. Zero framework. It needs no adoption:
  the first render of nova's DOM adapter replaces server-drawn elements with
  the same elements in one synchronous step. Every render after it patches: an
  element whose part of the tree did not change is the same node, so a wire
  update costs what changed and nothing on the page loses its focus, scroll or
  animation to it (nova's ADAPTER.md, "The DOM adapter keeps what did not
  change").

### `@niscorp/moss/terminal/dom/server`

- `renderSnapshot({ snapshot, registry?, window }): string` — the DOM target,
  drawing to a string (its argument is this entry's `RenderSnapshotConfig`). A DOM kit builds real elements, so the host hands in a
  DOM to build them in (`window`: jsdom, happy-dom, linkedom — moss depends on
  none). A kit's components name `document` as a global, so for the length of
  one draw — synchronous, start to end — the window's names are lent to the
  global scope and taken back whatever happens.

## `@niscorp/moss/terminal/tty`

- `ttyTarget({ input, output, registry?, fallback?, onQuit?, debounceMs?,
  prompt? }): Target` — the line-terminal target: a REPL over the wire (its
  argument is `TtyTargetConfig`). It
  reports the connection's status (`… connecting`, `✓ connected`,
  `× connection lost — retrying`) — once per real transition, never the
  backoff flap.
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

- `inkTarget({ registry?, slotWrapper?, stdin?, stdout?, onQuit?, patchConsole? }):
  Target` — the full-screen terminal target (its argument is
  `InkTargetConfig`, every field optional): nova's Ink kit
  (`@niscorp/nova/adapters/ink`) on the React adapter's walker, mounted with
  ink's renderer. Interaction is the TTY REPL's numbered addressing plus
  live focus: every interactive shows a `[n]` marker (the numbering is the
  TTY walker run over the same served trees — `[7]` is the same thing in
  the REPL and the TUI), and typed digits act on it — buttons and rows
  click, toggles flip, an input takes focus and typing types (a focused
  input claims digits as text; multi-digit numbers accumulate for a beat,
  unambiguous ones act at once, and digits that arrive together are the
  number they spell). Tab/Shift+Tab and ↑/↓ still walk the focus ring; Enter
  activates; Ctrl+C leaves. Inputs are draft-preserving and
  `debounce`-honoring (ADAPTER.md §6). A line above the screen says the
  connection's status while the socket is not open. The wire-backed slots
  are shared with `terminal/react` — same seam, different renderer.
  `onQuit` is the terminal ending, and the host's to act on (it owns the wire
  and the process): the person left, or a component of the kit threw and ink
  ended the app, which is logged and ends that one terminal. It is not called
  for a `destroy`, which is the host's own doing. `patchConsole` (default on) routes the process's
  console above the frame; a host rendering several targets in one process
  (an SSH server, one per connection) turns it off, so its own logs never
  reach whoever is connected. ESM-only, like ink.

```typescript
import { inkTarget } from '@niscorp/moss/terminal/ink';
createTerminal({ target: inkTarget(), wire });
```
