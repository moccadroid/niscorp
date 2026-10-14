# Moss — API Reference

Eighteen entry points: `@niscorp/moss` (the server), `@niscorp/moss/node` (the
Node listener and the built site), `@niscorp/moss/vite` (the dev plugin),
`@niscorp/moss/integrations` (a feature: services that add screens),
`@niscorp/moss/tide` (a feature: a write minted into tide as a fact),
`@niscorp/moss/protocol` (the names of code that speaks the wire itself),
`@niscorp/moss/unverified` (the whole shell of a session),
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
package): the entry point and the name (`. MossServer`). `pnpm check:api`
fails when the file and the entry points differ. What the file does not record
is a member or a signature: a member whose type changes moves no line.
Each exported name is documented below, under its entry point. Where this
document names a type, a constant or a file that no entry exports, it says
so: the name is there so a shape can be read, and an app reaches the shape
through the exported type that carries it (`NiscRuntime['fabric']`,
`Awaited<ReturnType<ShellHost['session']>>`).

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
  entries?: readonly (SeedEntry | SeedMutation)[];     // the API surface: the reads and writes the app serves
  resources?: Record<string, readonly string[] | { entities: readonly string[] }>;
  shell?: ShellManifest;                              // the server shell, as data — THE APP
  pages?: Record<string, PageManifest>;               // what is drawn at a path and kept by nothing
  grammars?: readonly Sequence[];                     // the app's own strata grammar sequences
  // the code seams
  scope?: (principal: string | null, identity?: IdentityRecord) => Record<string, unknown>;
  identity?: { as?: string; resolve: (principal, read) => Promise<IdentityRecord> };
  phrases?: (session) => Phrasebook | undefined | Promise<Phrasebook | undefined>;
  phraseKeys?: PhraseKeys;
  functions?: (session: FunctionSession) => readonly FunctionDefinition[] | Record<string, FunctionHandler>;
  onSession?: (session: FunctionSession) => void;
  runs?: RunSink;
  reactions?: readonly { table; op?; run }[];         // see "Reacting to writes"
  // what is added to moss that is not its core (see "Features"); `Feature` is not exported
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
  an org). Moss always injects `{ userId }` (the principal; `'anonymous'` for
  nobody signed in); this contributes the rest, merged
  server-side and asked per request, so a value derived from the clock is
  never held for a session. Synchronous. `identity` is the record
  `identity.resolve` answered: absent for nobody signed in, and in an app with
  no `identity` seam. What `scope` answers is merged over that record's
  `scope`, the values that are held for the session.
- `identity.resolve(principal, read)` — who a principal is, resolved once per
  session and cached by moss (bounded by `runtime.identityMax` /
  `identityIdleMs`, re-resolved every `sessionRevalidateMs`). Returns an
  `IdentityRecord`: `{ roles, scope, installed?, tag? }`. `read(fingerprint,
  scope)` executes an entry the app serves through moss's engine, replay-only, under
  the policy of the charter role `identity.as` names (it throws when `as` is
  unset). Moss never reads inside the record's `scope`. Absent, `assignments`
  and `scope` answer, and every registered integration is live for everybody.
- `functions(session)` — the functions behind `fn:` endpoints. Called once
  for each shell that is built: the app's, a page's, and the one a reset
  builds. Like `onSession`, it runs before the shell finishes building, so it
  must not touch `session.shell` synchronously. It returns a list of
  `FunctionDefinition`, `{ id: string; description: string; execute:
  FunctionHandler }`: `id` is what the charter's `functions` and an `fn:`
  endpoint name, `execute` is what an `fn:` endpoint calls, `(data, signal) =>
  Promise<unknown>`, and `description` says what it does and what to send, for
  the model that writes a call to it (`session.functions()` lists it). Two
  under one id are refused when a shell is built: `moss: functions(session)
  returned "auth.leave" twice.` A map of handlers by id still works and is
  deprecated. The first shell a process builds says once what to change, read
  off what that first session's `functions(session)` returned: `[moss]
  functions(session) returned a map of handlers, which is deprecated: return a
  list of { id, description, execute }.`, or `[moss] functions with no
  description: auth.leave. Give each a description.` An empty description
  counts as none, and a function given by a map has none. **A shell holds only the functions
  its principal's roles grant**, in the charter's `functions` part (names or
  globs, with `extends` and `deny`, as `actions`): a role with none may call
  none, and an `fn:` endpoint to one it does not grant fails when it is called.
  What a living shell holds follows the roles an adopt answers, as its actions
  do.
  - **The boot is refused** where somebody holds an action that calls a
    function their roles do not grant. It reads the `fn:` endpoints of the
    actions held by each role on its own, each combination `wearable` or
    `assignments` lists, and `public`, and of the fragments the shells ship,
    and lists every call that is missing: `"member" hold "chrome.topbar",
    which calls "auth.leave": their functions do not grant it`. A name with a
    template in it (`fn: '{{$.saveFn}}'`) is worked out when it is called, and
    the shell's map decides then.
  - **`functions: ['*']`** grants every function, as an app had before this
    part existed. The boot says so for each role that has it: `role "member"
    allows every function ('*'): the generated actions of the people who hold
    it, or a role that extends it, may call any it does not deny`. Grant each
    role the functions it calls.
  - **A grant that names no function** is said at the first shell a process
    builds, when the names of the app's functions are known, with the
    charter's own checks: `[moss] charter: role "member" allows "notes.ad"
    (functions) which matches nothing`, a deny that matches nothing, and a
    function no role grants. They are read against the names that shell's
    `functions(session)` returned: an app whose functions differ by who the
    session is for may see a grant reported that another session's names
    would match.
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
  - `at` is when the run was recorded, in epoch milliseconds. `agentPath` is
    the agent's lineage when one agent runs inside another, and `label` is the
    app's own name for the way in that produced the run.
  - `reported` is `false` when any step's tokens were counted and not
    reported by the provider. `outcome` is `'ok'` or `'failed'`.
  - A `RunTurn` is `{ role, content, calls?, name? }`. `calls` is what the
    model asked for on that turn, each `{ name, args }` with `args` the JSON
    text as the provider sent it; `name` is the tool a `'tool'` turn is the
    answer from.
  - `session` is the session that recorded the run, so a sink can write the
    record through `session.wire`, as the caller.
- `grammars` — strata sequences for documents only this app defines the shape
  of (its kit's component props). See "Documents are read in this code's
  grammars" below.

A `LayoutVariant` is `{ action: string; layout: LayoutNode }` — ring 2: the
charter's `layouts` section selects who is granted which variant id, and moss
puts the granted variant's layout where that action's layout is kept in the
shell ("Where an action's layout is kept", under `createServer`). The base is
the floor; variants enrich upward as grants. A role, or a combination
of roles somebody may wear, that holds two variants of one action refuses the
boot, and so does a variant of an action the app does not have.

#### `ShellManifest`

```typescript
type ShellManifest = {
  canvases: ShellCanvas[];        // a canvas's `initial` may be a CANDIDATE list
  layout?: LayoutNode;            // the frame — CanvasSlot markers, served verbatim
  layoutStore?: Record<string, LayoutNode>;   // what a `{ ref: id }` in the frame resolves to at boot; no name is `frame` or begins with `action/` or `canvas/`
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
like every other mount — a seed for an action the shell is not built with
does not mount. A shell is built with what its principal is granted and what
they generated.
A `CanvasSeed` is an action id or `{ action, input?, with? }`, and a
`ShellCanvas` is nova's canvas config with `initial` widened to one seed or a
list of candidates. Neither type is exported by name: `ShellManifest['canvases']`
carries both. Of a list of candidates, the first action the principal holds
mounts; a canvas none of whose candidates they hold starts empty.

`components` is the kit as the server knows it: each component's name, with
its `meta` (a `description`, and `propsSchema`, the zod schema of its props).
A name listed there is registered in the shell whether or not a layout of the
app uses it. The `components` of the app's own `shell` are also the kit a
bundle's layouts are held to at intake, and the one the integrations'
contract lists ([`@niscorp/moss/integrations`](#niscorpmossintegrations)): a
bundle's layout that uses a component not listed there is refused, and where
a component's `propsSchema` is a zod object, so is a prop it has no place for.

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
A page with no `params` hands its path's parameters to no canvas.

Whether a page may be kept by a cache, or written to a file, is not a property
of the page: see [who may keep a page](#who-may-keep-a-page).

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
  shell: Shell;                    // the session's living, durable shell (a getter — a reset replaces it); eight members throw
  artifacts: SessionArtifacts;     // what this principal saved, and saving: `session.artifacts`, below
  draft: SessionDraft;             // what is being generated in this one shell, before it is saved: `session.draft`, below
  principal: string | null;
  roles: readonly string[];
  identity: Record<string, unknown>;  // the scope half of the resolved identity
  actions: readonly string[];      // the ids of the actions the shell was built with: what the roles are granted, installs filtered, and what the principal generated
  wire: FetchFn;                   // the server's own surfaces, as this session
  grant: (token: string) => void;  // session GRANT (login): send it down, reconnect
  revoke: () => Promise<void>;     // session REVOKE (sign-out): close 4403, evict
  answerIntent: (                  // a query written for an intent, as this principal
    writers: { generateDsl: GenerateDsl; mapToShape: MapToShape },
    asked: { intent: string; shape: unknown; context?: Record<string, unknown> },
  ) => Promise<QueryResponse>;
  recordRun: (run: Omit<RunRecord, 'at' | 'principal' | 'shellId'>) => void;
  functions: () => readonly { id: string; description?: string }[]; // the app's functions this session may call, what its roles' `functions` grant
};
```

`revoke` settles when the credential is gone: under `session: 'sessions'` it
deletes every session the principal has (`revokeAllFor`). It need not be
awaited: a failure is logged. `recordRun` is a
no-op when the manifest declares no `runs` sink.

**`shell` refuses the eight members that change what a shell is made of**:
`registerAction`, `removeAction`, `addCanvas`,
`removeCanvas`, `setCanvasLayout`, `setLayout`, `setPhrases` and `dispose`
throw, and so do `set` and `delete` on its `layoutStore`, which is to read. A
definition read off it (`shell.getRuntime(id).definition`) is the action as it
was written, with the layout it is drawn with now in place: where moss keeps a
layout does not show. An action, a fragment, a canvas, a layout and the phrases reach a shell
through moss, which verifies them and decides who holds them; added on the
shell directly they are not verified, are in nobody's catalog and are gone
when the shell is rebuilt. Everything else (reads, navigation, `dispatch`,
`publish`, the observers) works as on nova's `Shell`, which is still the
type. Code that goes around moss anyway takes the whole shell from
`@niscorp/moss/unverified`, so the file that does it says so in its imports.
The shell of what `server.shells.session(…)` answers is the same shell.

```typescript
import type { FunctionSession } from '@niscorp/moss';
import { unverifiedShell } from '@niscorp/moss/unverified';
import type { ActionDefinition } from '@niscorp/nova';

const register = (session: FunctionSession, definition: ActionDefinition): void => unverifiedShell(session).registerAction(definition);
```

**A session says who is calling and holds no key.** It carries no `runtime`
(the database pool, the operator key) and no `policy` (the
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

The run sink, with what a record carries:

```typescript
import type { RunSink, RunTurn } from '@niscorp/moss';

const runs: RunSink = (record) => {
  const turns: readonly RunTurn[] = record.turns ?? [];
  console.log(record.agentId, record.totalTokens, turns.length);
};
```

#### `session.artifacts` — what the session's principal saved

What somebody or a model generated while the app runs is kept by moss, as a
version, in two tables of its own. Four kinds are kept: a layout (for an
action, or for the app's own shell), an action, a fragment, and a read vex
wrote. A session saves for its own principal. A layout for everybody is
published from the server and never from a session (`server.defaults`, under
`MossServer` below). Not built yet: a layout of a page's shell, and an action,
a fragment or a read for everybody.

```typescript
type SessionArtifacts = {
  save: (artifacts: readonly { kind: ArtifactKind; id?: string; body: unknown }[]) => Promise<{ save: string; artifacts: readonly { kind: ArtifactKind; id: string }[] }>;
  list: (kind?: ArtifactKind) => Promise<readonly ArtifactVersion[]>;
  history: (kind: ArtifactKind, id: string) => Promise<readonly ArtifactVersion[]>;
  restore: (kind: ArtifactKind, id: string, save: string) => Promise<{ save: string }>;
  reset: (kind: ArtifactKind, id: string) => Promise<{ save: string }>;
};

type ArtifactKind = 'layout' | 'action' | 'fragment' | 'read';

type ArtifactVersion = {
  kind: ArtifactKind;
  id: string;
  save: string;               // the save this version belongs to
  createdAt: string;          // ISO
  copiedFrom: string | null;  // the save it is a copy of, where it is one
  body: unknown;              // null: this version says none is in force
};
```

The three types are reached as `FunctionSession['artifacts']`; none is
exported by a name of its own.

**A layout's body** is `{ ref, layout, use? }`. `ref` is the name the layout
of the action it is for is kept under in the shell's layout store,
`action/<the action's id>`, or, for a layout of the app's own shell (further
down), `frame` or `canvas/<a canvas's id>`. `layout` is a nova layout.

```typescript
functions: (session) => [
  {
    id: 'layout.keep',
    description: 'Keeps a layout for the deals list as the person’s own. Send { layout }.',
    execute: async ({ layout }) => session.artifacts.save([{ kind: 'layout', body: { ref: 'action/deals.list', layout, use: true } }]),
  },
],
```

**A generated action's body** is a nova action definition without an `id`,
and **a generated fragment's** a nova fragment without one. Moss gives the id:
`generated.` and a uuid, which `save` answers. A body that names another id is
refused, and a save that names the `id` of one of the principal's own is a new
version of it.

```typescript
functions: (session) => [
  {
    id: 'screen.keep',
    description: 'Keeps an action the person generated. Send { action }.',
    execute: async ({ action }) => session.artifacts.save([{ kind: 'action', body: action }]),
  },
],
```

- **It is its owner's and nobody else's.** It is among the actions (or the
  fragments) their shells are built with, its layout is in their layout store
  under `action/<its id>`, and a layout of their own may be saved for it as
  for a shipped action. No charter grant is asked about it, and it is in no
  catalog: `/catalog`, the socket's hello and `server.catalogOf` answer what
  the charter grants. What somebody generated is listed by
  `session.artifacts.list('action')`.
- **It reaches its owner's open shells a moment after the save answers**, as a
  saved layout does, and not before: a function that saves an action and
  opens it in the same call finds it not there yet. One that is to be seen at
  once is put into the draft (`session.draft`, below), which answers when the
  shell has it.
- **What it defines replays reads, and calls the functions its owner's roles
  grant.** An `fn:` endpoint names a function its owner's roles grant in the
  charter's `functions` (`session.functions()` lists them with their
  descriptions, for the model that writes it); one they do not grant is refused. Every other endpoint is a
  `POST` to the app's vex route (`/api/vex`, or `/api/<resource>/vex`) whose
  `request` names one fingerprint, written out. That fingerprint is a read the app ships or
  was handed (`replaceEntries`) that its owner's policy may replay, or a read
  vex wrote that its owner saved (below). Refused, with a sentence: a function
  its owner's roles do not grant, a write, a read its owner may not replay, any other fingerprint (a
  query a model wrote that nobody saved, `fp_…`, among them), a fingerprint
  that is computed, an address with a template in it, and every other
  address.
- **Moss checks the artifact, and what it is combined with is nova's.** Once
  it is in a shell it is an action, or a fragment, like any other. A message
  it emits reaches every action open in its owner's shell. The steps of a
  fragment run inside the action it is wrapped around, with that action's
  endpoints, and where both define an endpoint of one name the action's is
  the one called. What an assistant is told it may generate is the app's to
  decide: it writes the prompt, and its own function calls `save`.
- **A generated action opens the actions its owner holds**, their own
  generated ones among them, and no other: nova's audit is run on it with
  those as its catalog, and what it finds refuses the save, as it does for a
  saved layout. So do a component no shell of the app has, and a layout that
  names a ref moss keeps a layout under (`action/…`, `canvas/…`, `frame`). A fragment is held to its schema, its id, its
  layout and its endpoints, and not to that audit, which reads a whole action:
  a step of a fragment that opens an action its owner does not hold is refused
  by nova when it runs, because that action is not in their shell.
- **It is checked when it is saved and again when a shell is built.** One
  that no longer passes (its owner lost the grant its read needs, say) is left
  out of every shell built from then on, with a line (`[moss] the action "…"
  of … is left out: …`).
- **A reset takes it out of its owner's shells**, and the layouts they saved
  for it are not drawn while it is out: a layout whose action its holder has
  no longer is not loaded. `list('layout')` still lists them. Going back to a
  version of the action brings both back.
- **No action an app ships or hands over, and no fragment of a shell, has an
  id beginning with `generated.`**: a boot, `replaceActions` and the
  manifest's parse refuse one. Nor is an action under the id of a fragment a
  shell ships, since a nova shell keeps both in one registry: a boot and
  `replaceActions` refuse that too.
- A fragment that left, by a reset or because it no longer passes, is taken
  out of a shell that is already open, as an action is. What was opened with
  it stays as it was composed.

**Every call is for the session's principal, and no call can be for anybody
else.** No argument names whose rows are meant. Moss runs its own entries over
the two tables as the caller, with the scope values the routes serve that
caller under, and under one row rule: a caller reads and writes only the rows
whose `principal` is their `userId`, and a row they insert or update carries
it, whatever the statement says. Vex keeps that rule on every read and every
write; moss's code passes no principal. **Who may save at all is the charter's**: a function that calls
`session.artifacts.save` is the app's, an action calls it, and the charter
says who holds that action. A session nobody is signed in to saves nothing
and lists nothing: everybody who is not signed in shares one `userId`.

- The layout is the principal's and nobody else's. Moss gives it its id, a
  uuid, and answers it; a save that names that `id` is a new version of the
  same layout, and an id that is not one of theirs is refused.
- Several of somebody's own may be for one ref: the one whose body says
  `use: true` is the one their shells draw, and marking one takes the mark off
  their others for that ref in the same save. One that is not marked is kept
  and not drawn.
- Their open screens follow at once, with what was typed into them kept; in a
  deployment of several processes the others are told over the fabric
  (`adopt`, under "Many processes").

**Whose a row is, is the caller's `userId`**: the scope value moss supplies
for every caller, which an app's `scope` can set. An app that gives a person one account for each tenant
keeps their layouts apart by tenant. An app where one account spans tenants
has that person's layouts follow them into each. In neither does anybody read
or write a row of another account.

**A read vex wrote** for a request (`session.answerIntent`) is saved under
the fingerprint vex gave it, with no body:
`session.artifacts.save([{ kind: 'read', id: 'fp_…' }])`. Moss takes the entry
from vex's own table and keeps it as written: the query, the Prism config of
its mapping, its shape and its intent.

- **It is answered to the person who saved it and to nobody else.** When one
  of their requests replays that fingerprint, moss answers it, compiled, from
  their rows. Anybody else who sends the fingerprint gets what vex's own table
  still holds under it, as for any query vex wrote and nobody saved, and a
  caller nobody is signed in for is never answered a saved read.
- **It is a query vex wrote, and is held as one.** Vex's limits apply to it
  (`maxLimit`), as they do not to an entry the app ships. A request that names
  its fingerprint with an intent and a shape is written anew by vex into its
  own table; the saved read is what its owner is answered until they save the
  new one.
- **It survives a schema change that does not touch what it reads.** Vex drops
  the copy in its own table at the first replay after any schema change; the
  saved one is not dropped. One whose query no longer runs is refused by vex
  when it is replayed, and is left out of what is in force with a line
  (`[moss] the read "fp_…" of … is left out: …`), with any generated action of
  its owner that replays it.
- **Its owner's policy applies when it is replayed.** A generated action over a
  read whose tables its owner can no longer read stays in force, and its
  replay is refused, where one over such an entry the app ships is left out.
- **A generated action may replay a read its owner saved**, as it may an entry
  the app ships that its owner may replay. A draft takes a read too, and an
  action put into the same draft may replay it.
- **What is refused**, in a sentence: a read with no id, or with a body; one
  under the fingerprint of an entry the app ships or was handed; one vex did
  not write for a request; a write; one whose mapping vex kept no config for
  (it was written before vex kept one: ask for it again); and one whose query
  does not run against the schema.

**What a shell draws under an action's ref**, the first of these that there
is: the principal's own layout marked in use; the layout variant their roles
hold (`app.layouts`); the layout published for everybody that is marked in use
(`server.defaults`); the layout the build ships.

**What is refused**, at a save and at a restore, in a sentence, with nothing
written: a body that is not `{ ref, layout, use? }`; a `ref` nothing is kept
under for the principal (an action they do not hold, or one that is not in
force; an action with no layout of its own, or one that names a layout of the
store by its id; any name that is none of `action/<id>`, `frame` and
`canvas/<id>`); a component no shell of
the app has (and a prop its declared schema refuses, as for an integration's
layouts); a layout that names a ref moss keeps a layout under (`action/…`,
`canvas/…`, `frame`); and what nova's audit
(`auditAction`) finds of the action with the layout in place and does not find
of the action as it is built (a binding to a key the action has no data for,
a control the action listens on that the layout leaves out, a control no
trigger handles). The same is asked of every saved layout when a shell is
built, there against the components of that shell alone: one that does not
pass is left out, what is under it is drawn, and a line says why (`[moss] the layout "…" of … is left out: …`). One whose ref
its holder's store keeps nothing under any more (the action left, or they
hold it no longer) is not loaded and nothing is said.

**The layouts of the app's own shell** are saved with the same calls: its own
under `ref: 'frame'`, and a canvas's under `ref: 'canvas/<the canvas's id>'`.
`session.artifacts.save([{ kind: 'layout', body: { ref: 'frame', layout, use:
true } }])`.

- **They are the app's own shell's.** Under either name that shell draws the
  first of these that there is: the principal's own marked in use, the one
  published for everybody that is marked in use, the one the manifest
  declares. A page draws the layouts its own manifest declares, whatever was
  saved: an app that lets people save a frame has, in a page, a screen no
  saved frame changes. A draft of a page's shell takes none.
- **A shell manifest with no `layout` has none to take the place of**, nor
  has a canvas with no `actionLayout`, or with one that is the name of a
  stored layout. A save for one is refused as for any ref nothing is kept
  under.
- **What is refused**: a body that is not `{ ref, layout, use? }`, a component
  the app's own shell has none for (and a prop its declared schema refuses),
  and a layout that names a ref moss keeps a layout under. Nova's audit reads
  an action, and is not asked of these. One that names a ref nothing is kept
  under is saved, and nova draws its error box in that place, as it does in
  an action's layout.
- **A frame may leave a canvas of the shell out.** That canvas stays the
  shell's and is drawn nowhere: what is mounted on it runs unseen, and what an
  action opens on it does not show. Moss does not refuse it. An app that wants
  every canvas placed checks the layout in its own function before it saves.

**A canvas that only a layout's slot draws goes when the slot goes.** Nova
gives a shell a canvas when something is first pushed onto it, whether or not
its manifest declares it, and it is drawn where a layout has a canvas slot for
it (`{ component: 'CanvasSlot', props: { canvasId: 'notes' } }`). Moss reads
which canvases the layouts a shell is built from hold a slot for and its
manifest does not declare. Every layout counts (the frame, a canvas's, an
action's that the principal holds, a fragment's, one the app keeps in its
layout store), the build's and a saved or generated one alike. Once a layout
leaves force and no other holds a slot for such a canvas, an open shell loses
the canvas, with what is mounted on it. A slot whose `canvasId` is worked out
when it is drawn (`'$.c.id'`, a template) counts for none. Moss gives a shell
no canvas, and the canvases a manifest declares are never taken out. What is
pushed onto a canvas after its slot went is mounted and drawn nowhere, as on
any canvas no layout has a slot for.

**Moss changes and deletes no row.** `list` answers the latest version of each
of the principal's artifacts that has a body. `history` answers the versions
of one, the newest first (the newest 500). `restore` is a new save that holds
a copy of a version and says which (`copiedFrom`); it is checked as a save
is. `reset` is a new save whose version has no body: none of the principal's
is in force under that id, and what is under it is drawn again. A reset is a
version too, and can be gone back from. Two saves by one person at the same
moment can each leave a layout marked in use for one ref. The later one is
drawn. The next save that marks one for that ref, or takes the one in use out
(a reset, or a save of it without the mark), takes the mark off the rest.

The rows are in `artifact_saves` (one for each save) and `artifacts` (one for
each version a save holds), which migration `nisc.moss/5` makes. They are
read and written through three vex entries of moss's own that no route serves
(`src/artifactory/saves.ts`). What is in force for an artifact is its latest
version by `created_at`; every id moss gives is a uuid. A body is kept with
the grammar stamp it was written at and is brought to the grammars the server
runs when it is read. What somebody saved is asked of the rows once for each
shell that is built for them and once for each adopt; nothing of it is kept in
memory, so a save made in another process is theirs here at the next build
whether or not a fabric is set. The entries are loaded when the server boots,
and a boot that cannot load them fails. A row always has a principal: the two
`principal` columns refuse a null, so an app whose `scope` answers no `userId`
for somebody saves nothing for them.

**No caller's `userId` is `*`.** What is published for everybody is kept as
the rows of that one principal, under the same row rule, so a caller whose
`userId` were `*` would read and write what is published as their own. Moss
refuses one wherever it composes a caller's scope for vex: no shell is built
for them (`moss: a caller’s \`userId\` is "*", …`), `/api/vex` answers them
500, and an intent a function asks for them is refused. An app's sign-in, or
its `scope`, answers another id. A scope that carries `artifactSavedBy` is
refused in the same places: who made a save is written from that value, and
it is moss's to say. (`server.executeAs` is the app's own code, and hands vex
the scope it is given.)

**The row rule is moss's, wherever a policy is compiled.** The two tables are
in the data a charter selects from, as every table is: no role reaches them
unless its charter grants them. A role that is granted them, by name or by a
wildcard (`*.read`), reads and writes its own rows there and nobody else's,
because the same rule is part of the policy `server.policyForRoles` answers.
An app does not say otherwise: `behaviors` that name either table refuse the
boot. (A policy an app compiles itself, from its charter and its own
`behaviors` and without the server, does not carry the rule.) Moss's own
entries only add rows. An app whose charter grants a role update or delete
on the two tables, and that ships an entry of its own to do it, lets that
role change or remove its own rows, and never another's. A save itself (a row
of `artifact_saves`) is moss's alone to make: who made it (`created_by`) is
written from a scope value no caller's scope carries (`artifactSavedBy`), so
an app's entry that inserts or updates one for a caller is refused (500,
`missing_scope`).

**A save is not told to `app.reactions`.** Moss's own entries tell the app's
engine which tables changed, so a read of the app's that follows them
refreshes, and tell no subscriber of the routes. The function that saved
knows that it did.

#### `session.draft` — what is being generated in this shell

What a person or a model is still working on is in the draft of the one shell
it is worked on in. It is shown there at once and saved nowhere: no other
shell has it, the person's own others included, and it is gone when the shell
is (a reset, an idle shell that was dropped, a restart).

```typescript
type SessionDraft = {
  put: (artifacts: readonly { kind: ArtifactKind; id?: string; body: unknown }[]) => Promise<{ step: number; artifacts: readonly { kind: ArtifactKind; id: string }[] }>;
  list: () => readonly { kind: ArtifactKind; id: string; body: unknown }[];
  remove: (kind: ArtifactKind, id: string) => Promise<{ step: number }>;
  show: (step: number) => Promise<void>;
  discard: () => Promise<void>;
  save: () => Promise<{ save: string; artifacts: readonly { kind: ArtifactKind; id: string }[] }>;
};
```

```typescript
functions: (session) => [
  {
    id: 'screen.try',
    description: 'Shows an action the person is trying out, without keeping it. Send { action }.',
    execute: async ({ action }) => {
      const put = await session.draft.put([{ kind: 'action', body: action }]);
      session.shell.push('main', put.artifacts[0].id);
    },
  },
  { id: 'screen.keep', description: 'Keeps what the person is trying out.', execute: async () => session.draft.save() },
],
```

- **`put` takes what `session.artifacts.save` takes and refuses what it
  refuses**, with the same sentences. Each artifact is checked beside what is
  in force for the principal with the draft laid over, so a layout may be for
  an action that is itself in the draft. A draft is one shell's, so what is
  put into it is held to the components of that shell, where a save is held to
  those of any shell of the app. A new action or fragment gets its
  `generated.` id here, and keeps it when the draft is saved. An `id` names
  one in the draft, or one the principal saved: a new take of it, which stands
  in for the saved one in this shell until the draft is saved or the take is
  taken out. A put that marks a layout `use: true` takes the mark off the
  draft's others for that ref, as a save does.
- **A put is in the shell when it answers.** The function that put an action
  opens it on its next line. An open screen follows a drafted layout with what
  was typed into it kept, as it follows a saved one. A put the shell could not
  take rejects, and the draft is as it was.
- **What the shell draws**: what is in the draft, then what `session.artifacts`
  would draw. A drafted layout marked `use: true` is drawn in place of a saved
  one that is marked for the same ref.
- **`list`** answers what the draft holds, and **`remove`** takes one out of
  it; what is under it is drawn again. **`discard`** empties it.
- **Each put or removal is a numbered step**, from 1. **`show(step)`** has the
  shell show the draft as it was after that step, and `show(0)` none of it. A
  put or a removal while an earlier step is shown goes on from that step: the
  steps after it are dropped. The steps are the draft's and are saved nowhere.
- **`save`** is one save of what the draft holds, as the principal's own and
  under the ids it had, checked once more. The draft is then empty and the
  shell keeps what it shows. An empty draft is refused.
- **Calls on one draft are taken in turn**: each starts from the draft as the
  one before it left it.
- A session nobody is signed in to has no draft, as it saves nothing. Every
  call on the draft of a shell that was replaced since is refused (`moss: this
  session’s shell is gone, and its draft with it.`), `list` and `save` among
  them: what was in it is saved by nobody.

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
  endpointTimeoutMs?: number;      // a server shell's endpoint call, and the build of a shell; default nova's, 30s
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

`vexConfig` is handed to the app's query engine. A list of tables given there
(`entities`) cuts down what that engine knows: the entries the app serves, and
the `data` universe its charter is resolved over. It says nothing about moss's
own reads and writes. The generation counter and a feature's own entries (the
integrations' registry) read the tables that are theirs off the database
whatever the list names, and know no other table.

`session` is required, deliberately — authentication is the one door that must
not default open, and it used to. Three answers: `'sessions'` uses moss's own
stored credential (below); `'dev-open'` trusts every well-formed token and says
so at boot — harnesses and demo floors; a function is the app's own identity
provider — return `null` for a token that has expired or been revoked. moss
never learns what expiry means — it only asks again, on both surfaces. A
function is named at boot too, in one line (`[moss] session: a function the app
supplied (…) decides who a token is.`): moss cannot tell an identity provider
from a stub that trusts whatever it is shown, so the choice is in the log.

`endpointTimeoutMs` is how long an endpoint call of a server shell waits for
its reply before it fails to the action's `onError`. An endpoint that names a
`timeoutMs` of its own waits that long instead. The build of a shell is
bounded by this number alone.

`sessionRevalidateMs` is one clock for three things: a live socket's token is
asked about again, an identity record older than it is resolved again when it
is next read, and the generation pointer is polled
([Many processes](#many-processes)). `0` turns off all three, and so does
`Infinity` or any interval above 2^31 − 1 ms (24.8 days), the longest a timer
of Node's holds: a process then follows no `refresh`, `replaceActions` or
approval of an integration that another process made.

`operatorKey` is what a request under `/operator` presents as
`x-operator-key`. A request with a wrong key is answered `404`, as every
request is when the key is unset. `operatorGate` is a gate of the app's own
over the whole prefix: its own authentication, a rate limit, an audit. It
runs before the key check. Returning a `Response` refuses the request.
`await next()` lets it on to the key check and the routes, and `c.res` is
then what they answered, so an audit records the outcome and not only the
attempt. A gate adds a lock and removes none: the key check runs on every
request it lets through. A gate that returns nothing has not refused: the
request goes on to the key check, whether or not the gate called `next()`.

`anonymousShellMax` — how many shells for nobody signed in may be alive at
once. Somebody signed in has one shell however many terminals they open; nobody
signed in has one for each connection, and opening a connection takes no
account and no token. A connection over the limit is sent
`{ type: 'error', code: 'at_capacity' }` and closed with `4503`; no shell is
built for it, and its terminal tries again later, as after any other close.
Somebody signed in is served whatever the count is, and a shell one of the
manifest's pages builds for somebody signed in takes no place.

**What the limit is, exactly.** One count, for everybody with nobody signed
in, in one process. It bounds what that process holds in memory for them, and
it does nothing else:

- It is not a limit for each visitor. Whoever holds the places holds them:
  one client that opens `anonymousShellMax` connections and keeps them open
  has every place, and every other visitor with nobody signed in is sent
  `at_capacity` until one of those closes. People who are signed in go on
  being served.
- It is counted by the process that takes the connection. A deployment of N
  processes holds up to N times the limit.
- Moss builds no limit for each address, because the address is not moss's
  to know: behind a proxy every connection comes from the proxy, and which
  header says where the visitor is, is the proxy's to say.

**A deployment that faces the internet** limits how many connections one
address may hold where the address is known: at its proxy or load balancer,
on the socket's path (`/socket`). With that in place, `anonymousShellMax` is
what it is sized for here, memory. What an app can do on its own: a first
screen for nobody that is a page which is not live opens no socket and takes
no place (`nisc build` says which pages are live, and why).

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

#### `mintSession(pool, principal, ttlMs)` / `revokeAllFor(pool, principal)`

The stored credential behind `session: 'sessions'` — the integration key's
standard, one table over: 256 bits behind an `st_` prefix, the row keeps only
the hash, `expires_at` is enforced on every read, and revocation is deleting
the row.

- `mintSession` answers the token, once. The app mints at its own door after
  its own identity check and hands the token to the terminal (or sets it as
  the browser's cookie, [`sessionCookies`](#sessioncookiespage-token-options)).
  Expired rows are swept on every mint — no timer to run.
- `revokeAllFor` deletes every token a principal holds: signed out everywhere.
  `session.revoke()` in a function calls it for the session's own principal;
  this is for signing out somebody else (an owner removes a member).
  No exported call deletes one token and leaves the principal's others.
- Who a token is, is asked of the server: `server.principalOf(token)`. The
  table is made by `createServer`, and by `migrateTables`, under
  `session: 'sessions'` and only then. Nothing else is exported of the stored
  credential.
- **They are for a deployment whose `session` is `'sessions'`, and for no
  other.** The stored sessions are what that verifier reads, and nothing else
  reads them.
- **An app whose `session` is a verifier of its own keeps its own
  credential.** It mints its tokens, stores what it needs to recognise one,
  and answers `null` for one that expired or was revoked: none of that is
  moss's, and there is no stored session of moss's for it to consult
  (`server.principalOf(token)` asks the app's own verifier, so calling it
  from inside that verifier is the verifier asking itself). `session.revoke()`
  in a function closes that principal's terminals and disposes their shell,
  and forgets nothing: the app deletes its own credential where it signs
  somebody out. An app that wants moss's stored sessions and a rule of its
  own on top (a member who was removed, an account on hold) sets
  `session: 'sessions'` and puts the rule where it belongs: `revokeAllFor`
  when the member is removed, or `identity.resolve` answering
  `{ roles: ['public'], scope: {} }` for somebody who may hold nothing.

```typescript
// the app's own door: who they are is the app's to establish, then a session
const token = await mintSession(runtime.pool, 'usr_ada', 30 * 24 * 60 * 60 * 1000);
// ...and an owner removing a member signs them out everywhere
await revokeAllFor(runtime.pool, 'usr_ada');
```

**Tables go through a ledger.** moss creates no table on its own: its tables are
[strata](../strata/README.md) sequences — `MOSS_SEQUENCE` (`nisc.moss`:
integrations, their actions, the generation pointer, the two tables of what
was saved) and the sessions table's
(`nisc.moss.sessions`; the sequence itself is not exported) — and
`createServer` applies them with the vex cache's sequence in
one ledgered run before introspection: once, recorded in `strata_ledger`, and
refused if the ledger was edited or written by newer code. `migrations` on the
runtime picks the posture: `'apply'` (default) runs what is pending; `'verify'`
refuses to boot if anything is, for a deployment that migrates as a deploy step.

The run's order is: `MOSS_SEQUENCE`, the sessions table's under
`session: 'sessions'`, the vex cache's, the tables the app's features keep (in
the order the app named the features), then `runtime.tables`.

`tables` on the runtime hands over the app's own table sequences. They join
that run last — one transaction, one lock, one posture, so `'verify'`
covers them. Absent, the app migrates its own tables itself, as before. Another
owner's tables the app keeps go in the same list (tide's: `TIDE_SEQUENCE`,
from `@niscorp/tide/postgres`), and a
runtime that hands tables over does not also migrate them itself.

#### `migrateTables(runtime, app, { dryRun? })`

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
the run and that the cache table already holds a copy of, exactly as it is. That
is an old fault, not this run's. A new or changed entry gets no such pass. A
copy is there where a release before 0.6.0 wrote it, or where the app writes
one itself for an engine of its own (`seedCache`). Moss writes none since
0.6.0: it keeps an app's entries in memory, so in a database only moss writes
to, an entry first shipped since then has no copy and gets no pass either.

What it answers is strata's `{ applied, plan }` plus `removed` (tables and
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

```typescript
import { migrateTables } from '@niscorp/moss';

// what a run would apply, and nothing applied
const report = await migrateTables(runtime, app, { dryRun: true });
console.log(report.applied.length, report.removed, report.retyped);
```

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
created, which is the boot check, and the data module is told to ask it for an
entry (it compiles the ones it holds, and one vex cannot run refuses the boot);
identity; the server's own routes (the
authentication, `/catalog`, vex); the shell hosts, the app's and each page's;
what crosses processes; the features, each started with seams made for it; the
operator prefix; the app's reactions hear a write; the generation pointer is
watched; the socket.
A step that refuses is the boot's refusal.

**Where the app's entries are held.** In the running manifest
(`src/artifactory/`), in memory, and nowhere else. It holds the entries the
app shipped and each set handed over with `server.replaceEntries`, compiled as
vex replays them, and it is what the engine asks first: a request's
fingerprint, and the list of fingerprints a feature or the operator is told
of, resolve there. So what a fingerprint resolves to is what this process's
app ships, read from the build at every boot.

What the running manifest does not hold is asked of the cache table
(`vex_cache`, or the cache `runtime.cache` hands over). That table keeps what
vex wrote itself while the app runs: a query `session.answerIntent` wrote.
**Nothing is copied into it at boot, and a row in it that no request wrote is
not replayed.** Vex gives a query it writes the hash of the request it was
written for, and that is what moss asks of a row before it answers from it. A
release before 0.6.0 copied every entry of the app there at each boot, and a
database that ran one still holds those rows, which carry no such hash. Moss
answers from none of them and deletes none: an entry the app no longer ships
is refused (`cache_miss`). Two things an app may have leaned on are gone with
the copy:

- **An engine of the app's own over the same table** finds no entry of the app
  there. It is given the entries it replays by the app
  (`seedCache(cache, entries)`, as the server used to do for it).
- **A row the app writes into the table itself**, to serve an entry that is
  not in its manifest, is not replayed. `server.replaceEntries` is the way an
  entry reaches a running server.

**Where an action's layout is kept.** In the shell's layout store, under
`action/<id>`. An app goes on writing an action's layout in its definition;
where a shell is built, moss moves it into the store, and the definition the
shell is handed names it by `{ ref: 'action/<id>' }`. A layout variant the
person's roles hold is what the store holds under that name instead. An action
with no layout, or one whose `layout` is already the name of a stored layout,
is handed over as it is. Three things follow:

- **A layout that changes reaches a screen that is already open**, with the
  data on it kept. Until 0.6.0 an open instance kept the layout it was opened
  with, and only one opened afterwards showed the new one. What an open
  instance still keeps is the rest of its definition: its data's shape, its
  endpoints and its triggers.
- **Code that reads an action's definition off its session's shell**
  (`session.shell.getRuntime(id).definition`) finds it as it was written, with
  the layout in place: the one the store holds now, so a variant or a change
  shows. `server.actions()` answers the definitions as they were written too.
  Only the whole shell (`unverifiedShell(session)`), which is nova's own,
  shows `{ ref }`; there the layout is `shell.layoutStore.get('action/<id>')`.
- **`action/` belongs to moss in a layout store.** A manifest whose
  `layoutStore`, the app's shell's or a page's, declares a name beginning with
  it refuses the boot (`shell.layoutStore.action/home: a name beginning with
  "action/" is where the layout of that action is kept`). So does an action's
  layout, or a layout variant, that names one by `{ ref }` or as its layout's
  name, at boot and when a set is handed over (`"panel" names the layout
  "action/panel": …`): a layout cannot be drawn inside itself, and an action
  cannot draw another's.
- **The layout of an action that leaves a shell leaves its store.**

**The shell's own layout and a canvas's are kept there too**, under `frame`
and `canvas/<the canvas's id>`. An app goes on writing `layout` in its shell
manifest and `actionLayout` in a canvas; where a shell is built, moss moves
each into the store and the shell draws it by that name. A shell manifest with
no `layout` has no `frame` in its store and is drawn with nova's own, and a
canvas whose `actionLayout` is already the name of a stored layout, or that
has none, is handed over as it is. So is a `layout` that is the name of a
stored layout: the shell draws by that name, and nothing is kept under
`frame`. Both names belong to moss in a layout
store, as `action/` does: a manifest whose `layoutStore`, the app's shell's or
a page's, declares one refuses the boot (`shell.layoutStore.frame: "frame" is
where the layout of the shell is kept`, `shell.layoutStore.canvas/main: a name
beginning with "canvas/" is where the layout of that canvas is kept`). So does
an action's layout, or a layout variant, that names one by `{ ref }` or as its
layout's name (`"panel" names the layout "frame": …`). Only a node that is
`{ ref }` and nothing else names a layout: a `ref` a component carries, on its
node or in its props, names none. Both can be saved for the app's own shell
(`session.artifacts`).

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

What an app consists of changes in two ways while a server runs: a set of
actions is handed over with `server.replaceActions(source, actions)`, and a set
of entries with `server.replaceEntries(source, entries)`. Each verifies before
it switches. A charter, a layout variant, a behavior and the shell do not
change under a running server; they change in the manifest the next server is
created with.

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
refresh; replaceActions; replaceEntries; actions; defaults; catalogOf;
policyForRoles; charterReport; invalidateIdentity; invalidateTag; identity;
executeAs; nudge; close; identities? }`.
It's a Hono app — mount it, extend it, or hand it to a listener.

- `principalOf(token): Promise<string | null>` — the deployment's own session
  verifier, the one every surface already asks. For an app's own code that is
  handed a token some other way than a Bearer header (a link it is redeeming,
  a terminal that is not a page). `null` is a refusal. It is what
  `renderDocument` asks for the session a page request carries.
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
  ("A change is the server's", under `shells` below). Every living shell is
  the one kept for each signed-in person, the one built for each connection
  of nobody signed in, and the one a page built for each connection. It also
  moves the generation
  pointer, and every other process on the same database follows it within
  one poll: it reads again the sets of actions it has a loader for, runs the
  same check, drops what it derived and has its living shells adopt (see
  [Many processes](#many-processes)).
  It ships nothing: the manifest that was handed over cannot be edited, and
  `replaceActions` is how actions arrive.
- `replaceActions(source, actions): void` — hand over a set of actions that
  arrived while the app runs (an app that loads actions from its own tables).
  `source` names the set: handing the same name over again puts the new set in
  place of the old, so an action it no longer names leaves. The actions in
  force are what the app shipped, then each set. What the app would then
  consist of is verified first: refused, it throws (`Refresh refused — …`,
  with what the check found) and nothing changed; accepted, it does what
  `refresh` does in this process, and the set is frozen as the manifest was,
  so a set is changed by handing over another of the same name.
  **The set is handed to this process, and no other process is handed it.**
  Another process follows the pointer the call moved, as after a `refresh`,
  and goes on serving the set of that name it was last handed itself, or
  none. An app that runs several processes hands the set to each of them
  ([Many processes](#many-processes), "The pointer carries no set"). Every definition of the
  set is read by nova's schema first: one nova does not read refuses the set
  (`Refresh refused — actions nova does not read:`, naming the action and what
  is wrong with it). **A set has one writer.** Each feature the app names
  keeps a set of its own under its own name (`'integrations'` is the
  integrations feature's, read from its tables) and is the only one that
  replaces it: handing a set over under a feature's name throws (`moss: the
  set "integrations" is the feature "integrations"'s, and only its owner
  replaces it. …`).
- `replaceEntries(source, entries): Promise<void>` — hand over a set of
  entries that arrived while the app runs (an app that loads its reads and
  writes from its own tables), as `replaceActions` hands over actions and
  under the same names: `source` names the set, handing the same name over
  again puts the new set in place of the old, so an entry it no longer names
  is refused from then on, and a name a feature keeps is not the app's. The
  entries in force are what the app shipped, then each set: an entry of a set
  is replayed in place of one the app shipped under the same fingerprint, for
  as long as the set holds it. Every entry is read by the schema the
  manifest's entries are read by, compiled, and checked before the set is
  taken: a write by vex's authoring lint, and the reach an entry declares by
  the check boot runs. Refused, the promise rejects with what was found
  (`Refresh refused — entries that do not parse:`, with the place and what
  was expected there) and nothing changed. Sets handed over at the same
  moment are taken in the order they were handed over. Accepted, the next request replays
  it, the set is frozen, living shells adopt and the pointer moves, as for a
  set of actions. Like one, **the set is handed to this process, and no other
  process is handed it** ([Many processes](#many-processes)). An app that
  hands over actions and the entries they replay hands the entries first.
- `actions(): Readonly<Record<string, ActionDefinition>>` — the actions in
  force now, by id: what the app shipped, then each set handed over. To read;
  a set changes through `replaceActions`.
- `defaults(publisher): SessionArtifacts` — what is published for everybody,
  with the five calls a session's `artifacts` has (`save`, `list`, `history`,
  `restore`, `reset`) and the same body: `server.defaults(who).save([{ kind:
  'layout', body: { ref: 'action/<id>', layout, use: true } }])` publishes a
  layout for an action, and every shell draws it under that action's ref
  unless its principal has a layout of their own in use or their roles hold a
  layout variant. With `ref: 'frame'` it publishes the layout of the app's own
  shell, and with `ref: 'canvas/<id>'` that of one of its canvases: each is
  drawn for everybody who has none of their own in use. Several may be kept for one ref and the one marked `use:
  true` is drawn; every publish is a version; a `reset` shows the build's
  again. A layout is the one kind that is published: an action or a fragment
  is refused here. `publisher` is who the publish is made by, and is kept with the save
  (`artifact_saves.created_by`); an empty one is refused.
  **No session can publish.** The rows are those of one principal no caller
  is (`*`), and every write a session makes carries its own `userId`: vex's
  row rule, the one a person's own rows are under. Only the app's own code on
  the server reaches this call, as it reaches `replaceActions`. **Who may
  publish is the charter's**: the app puts the call in a function, hands it
  the session's principal as `publisher`, and grants the action that calls
  that function to the roles that may. A function is declared before the
  server exists, so the app keeps the server where its functions can reach it.
  A layout is checked when it is published as one is when it is saved, held to
  every action in force with the layout it is built with: a ref no such action
  keeps a layout under is refused, and so is what a save refuses. When a shell
  is built it is checked again for that shell and that principal: one for an
  action they do not hold is not loaded, and one that no longer passes is left
  out with a line (`[moss] the layout "…" published for everybody is left out:
  …`, said once for each time the rows are read, not at every shell).
  One read of the rows answers every shell a process builds. A boot makes it,
  and fails if it cannot. The first shell built after this process publishes,
  or after the generation pointer moves, makes it again, and a read that fails
  fails that shell and is made again by the next. A publish has every living
  shell adopt, as `refresh` does, and moves the pointer, whether or not the
  rows can be read back: every other process on the same database follows
  within one poll ([Many processes](#many-processes)).
- `catalogOf(principal): Promise<{ ids, hash }>` — what a principal holds of the
  actions in force: `{ ids, hash }`, the granted action ids sorted, with a
  content-hash version token (equal hash, equal application). The principal is
  resolved the way a request resolves it (the `identity` seam, or
  `assignments`), so an integration's actions are there only where it is
  installed. `null` is nobody signed in.
  There is no asking by a list of roles: what somebody holds depends on who
  they are resolved to be, installs included, and the server resolves it.
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
- `invalidateIdentity(principal): boolean` — forget one principal's identity
  record and reset every living shell of theirs (a role change): the one the
  app keeps for them, and the one a page built for each connection of theirs.
  `false` = no record was held.
- `invalidateTag(tag): number` — forget every identity record wearing the
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
  declares `identity`. `since` is when a record was resolved and `lastSeen`
  when it was last read, both in epoch milliseconds. `evicted` counts the
  records dropped at `runtime.identityMax` or for sitting unread, and
  `expired` the ones found older than `sessionRevalidateMs` and resolved
  again.
- `executeAs(role, fingerprint, context, scope?): Promise<unknown>` — execute a
  entry the app serves as a declared charter role, for surfaces with no principal by
  nature. In-process only, replay-only, policy compiled from that role, scope
  values supplied by server code. Its type is exported as `ExecuteAs`, for
  code that is handed the function and no server. It answers the entry's
  result. An execution vex refuses is logged and answers `undefined`.
- `nudge(principal, channel): void` — tell one principal's screens that a
  channel changed. It is published, payload-less, onto every living shell of
  theirs: the one the app keeps for them, and the one a page built for each
  connection they have to it; in this process, and over the fabric in every
  other. What is mounted and listening reads again. It answers nothing.
  This is the way for server code to say "something they are looking at
  changed". `shells.deliver` is a different thing (below): a message with a
  payload, into the shell the app's own host keeps, in this process alone.
- `close(): void` — stop every timer the server started (the generation poll,
  the identity sweep, socket revalidation, the shell idle sweeps). For a host
  that retires a server in-process; every timer is unref'd, so a process that
  boots once needs none of it.

`executeAs`, for machinery that has no principal (its type is `ExecuteAs`):

```typescript
import type { ExecuteAs } from '@niscorp/moss';

const dueReminders = (executeAs: ExecuteAs, studioId: string): Promise<unknown> =>
  executeAs('automation', 'reminders/due', {}, { studioId });

await dueReminders(server.executeAs, 'st_north');
```

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
| it cannot be read | a `layout` that is the name of a stored layout; a fingerprint the manifest does not carry |

What can be pressed is read off the layout a screen is drawn with: a `{ ref }`
in it, the one an action's own layout is named by included, is read through
to the layout the shell's store holds under it.

A read made while the action opened is **finished**: its answer is in the tree
(and listed in `drawnWith`). The app's own shell is always live for a signed-in
principal — it is the thing that is kept. nova supplies the facts
(`livenessOf`, `@niscorp/nova/reflect`); moss composes the verdict, because
the running manifest holds the entries in force, by fingerprint
(`src/shells/snapshot.ts`; the function is not exported, its answer is
`live`, `why` and `drawnWith` on the snapshot). It reads that list and not
the cache table, which can hold more: a fingerprint the running manifest does
not hold (a query written by `answerIntent`) is the last line of the table.

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
  With no `shells` (the app declares no shell), a path that is not a page
  goes out undrawn.
- **`waitMs`** is how long the screen may take to settle before it is drawn
  as it stands: `shells.snapshot`'s `waitMs`, in milliseconds, default 300.
- **What it answers.** `drawn` says whether the screen is in the page.
  `principal` is who it was drawn for, and `page` the name of the page the
  path led to (absent: the app's own). `live`, `why`, `drawnWith` and
  `settled` are the snapshot's, and are there when the page is drawn. An
  undrawn page answers `principal: null` and the headers of a page for
  nobody, whoever asked.
- **Nothing here can fail a page.** A kit component that throws, a shell that
  will not build: the answer is the template as it is (`drawn: false`), and the
  terminal paints it the way it did before any of this existed.

The route is the app's own — in production `mountSite` from `@niscorp/moss/node`
(what `nisc start` mounts), in dev a vite middleware that runs
`index.html` through `transformIndexHtml` first so the drawn page still carries
vite's client.

#### Who may keep a page

`renderDocument` answers the headers its page goes out with (`page.headers`),
and they follow from who it was drawn for:

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
A path that could not be drawn is not taken to be finished: it is reported
`drawn: false`, `live: true`, with `why` saying that it could not be drawn.
A page that is `live` is still written, and says why — its file is a true first
screen and its terminal will look for a socket. Whether that is acceptable (a
server stands beside the files) or a mistake (there is none) is the build's to
decide, from the report. Writing the files, and listing a parameterised page's
paths (`server.executeAs` runs a read the app serves as a charter role), are the
caller's.

`renderDocument` is the one way a page is drawn, and its parts are not
exported. It reads the session the browser holds off the request's cookie, and
it writes the snapshot into the page as a
`<script type="application/json" id="nisc-snapshot">` element with every `<`
(and U+2028/2029) escaped: a tree carries what people typed, and a path is
whatever was asked for, and nothing in either can close the element or open
another.

One page drawn for whoever asks, and the same pages written out for nobody:

```typescript
import { exportDocuments, renderDocument } from '@niscorp/moss';
import type { DocumentConfig, DrawnDocument, ExportedDocument } from '@niscorp/moss';

const drawing: Pick<DocumentConfig, 'server' | 'template' | 'draw' | 'site'> = { server, template, draw, site: 'https://app.example' };
const page: DrawnDocument = await renderDocument({ ...drawing, request: { path: '/docs/intro', cookie, host: 'app.example' } });
const files: ExportedDocument[] = await exportDocuments({ ...drawing, paths: ['/', '/docs/intro'] });
```

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

### Reacting to writes

Vex is the choke point every application write passes through, so its write
observer is where a host learns about all of them. Moss hears it once and
offers each write down two lanes with deliberately different privileges: the
app's reactions, which are part of the manifest and are handed no row, and a
feature that hears writes, which is handed them. The one feature that does is
the tide lane, `createTideFacts`. Features
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
onto every living shell of a principal in this process, the one the app keeps
and each one a page built for them, with the payload; every other process is
nudged on the same channel, without it. `false`: no shell of theirs lives
here.

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
its chain position in `x-tide-cause` / `x-tide-depth`. The two headers are
this feature's: the core's routes read no header by name, and hand whoever
hears a write what its request said. `chain` decides whether
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

A feature is something moss adds to its core and keeps apart from it: it owns
none of what the core answers (who is calling, what exists for them, what they
may read and write, what they are looking at, how it reaches them). It ships
from an entry point of its own, and the core never imports it. There are two,
[`@niscorp/moss/integrations`](#niscorpmossintegrations) and
[`@niscorp/moss/tide`](#niscorpmosstide), and they are moss's own: an app
cannot write one, and `Feature` and `FeatureSeams`, the types moss and its
features meet at, are not exported. An app creates the ones it wants and names
them in `features: [createIntegrations(...), createTideFacts(...)]`.

`createServer` starts each one, in order, once its core stands and before
anything is served; one that throws refuses the boot. No two features of an
app share a name. What a feature routes, keeps and serves is documented under
its entry point.

A feature names the tables that are its own and the strata sequences that make
them. The sequences are migrated in the one ledgered run, before the feature
starts, and `migrateTables` runs them too. A feature reads and writes those
tables through vex, as an app does, with entries of its own: they are seeded into a
cache of their own, held by an engine no route is handed, so `/api/vex`
answers `cache_miss` for one of them whatever the charter grants whoever asks,
and no surface lists it. They run under a policy that admits the tables the
feature named as its own and no other, and asks for no principal. An entry
that reads or writes any other table refuses the boot (`moss: the feature "…"
handed over an entry that reads or writes a table that is not its own: "…"`).
What another table holds, a feature reads as the app does: through the app's
entries, under the charter. A write by a feature tells the app's engine which
tables changed, so a reactive read over one of them answers again.

### Many processes

- `runtime.fabric` — `{ publish(message), subscribe(apply) }`, the
  host's transport (Postgres `LISTEN/NOTIFY` is the expected one; the type is
  `NiscRuntime['fabric']`, and is not exported by a name of its own). A
  message is one of the four below with `origin`, the process that
  sent it, which moss stamps and checks. Three are what
  `server.invalidateIdentity`, `invalidateTag` and `nudge` publish after
  applying locally: `invalidate-identity`, `invalidate-tag` and `nudge`. The
  fourth, `adopt`, names a principal and tells a process to bring the shells
  it holds for them level with what they hold now; moss publishes it when a
  layout is saved for that principal (`session.artifacts`), and it says
  nothing of what was saved. Best-effort:
  each targets state that heals on its own clock. Unset, every path behaves as
  in one process. The wiring is `src/server/signals.ts`; it is the server's
  own and is not exported.
  `subscribe` is called once, while the server boots, with the function the
  transport hands each message it receives to. `publish` is never awaited,
  and a throw from it is caught and logged: a transport that is slow or down
  costs nothing to the call that published. A transport may hand a process
  its own messages back (`LISTEN/NOTIFY` does): moss drops them by `origin`.
  **What the transport hands to `apply` is read by a schema** before anything
  of it is used: the object moss published, with exactly its fields. `apply`
  takes whatever the transport read off its wire (`unknown`), so a transport
  hands over what `JSON.parse` answered and casts nothing. What does not parse
  (text that was not parsed, a field of the wrong type, a field no message
  has, a `kind` this process does not know) is dropped, and the first one is
  logged with what was wrong with it and nothing it carried
  (`[moss:fabric] the transport handed over what is not a message…`); the ones
  after it are dropped without a line.
- The generation pointer — the persistent counter `server.refresh()`,
  `server.replaceActions()`, `server.replaceEntries()` and a publish
  (`server.defaults`) move (`moss_generation`, one row, part of
  `MOSS_SEQUENCE`). Each process polls it (on `sessionRevalidateMs`; 60s when
  that is unset), and when it has moved it reads again every set of actions
  it has a loader for, drops what it had read of what is published for
  everybody (the next shell it builds reads that again), runs the check
  boot runs over what it would then serve, drops what it derived (what each set of roles holds, the compiled
  policies, the identity records) and has its living shells adopt.
  **The pointer carries no set.** It says that something changed, and a
  process learns what by reading rows. The only set that has a loader is the
  integrations feature's (`'integrations'`). A set handed to
  `server.replaceActions` or `server.replaceEntries` in one process is in that
  process's memory: every other process reaches the same generation and goes
  on serving the set of that name it was last handed itself, or none. So an
  app that runs several processes hands the set to each of them, on a signal
  of its own. Each call moves the pointer once more, and the others drop
  what they derived and adopt again.
  The row is read and moved through vex, by two
  entries of moss's own that no route serves (`src/data/own-entries.ts`);
  `src/artifactory/generation.ts` holds the clock and no SQL. A move is a compare
  and a set: the next number is written where the counter is still what was
  read, and read again where it is not. A move a process could not follow is
  tried again at every poll until it is followed, and logged when that is
  news: when it first fails (`[moss:generation] the generation pointer moved
  (3 → 4) and this process could not follow it: …`), again when the pointer
  has moved on or the reload fails another way, and once when it is followed
  (`followed the generation pointer to 4, after 12 looks that failed`). A
  reload that fails the same way for an hour is one line, not sixty.
- The identity cache — what holds the records `app.identity` resolves. It is
  the server's own (`src/identity/cache.ts`) and is not exported. Its limits
  are `runtime.identityMax` (default 10,000) and `runtime.identityIdleMs`
  (default 30 minutes). At `identityMax` the least recently read record is
  dropped to make room, and whoever it was is resolved again on their next
  request. A record is forgotten with `server.invalidateIdentity`,
  `invalidateTag` and `refresh`, and what is held is read through
  `server.identities`.

### Telemetry

`runtime.telemetry` is a `Telemetry`, `{ emit(span) }` — one sink, off by
default. A `TelemetrySpan` is `{ name, startUnixNano, endUnixNano, status: 'ok'
| 'error' | 'refused', attributes, traceId?, spanId?, parentSpanId? }`. Moss
emits one per vex execution, fn call, integration call, shell build, and socket
upgrade and close: `name` is `vex.execute`, `fn.call`, `integration.call`,
`shell.build`, `socket.upgrade` or `socket.close`.
A vex execution is a request's replay, one `executeAs`
makes, and one a feature makes of its own entries: the integrations'
registry reads and writes are `vex.execute` spans whose `fingerprint` starts
with `integrations/` and whose `hasPrincipal` is `false`. The generation
counter's poll emits none. A `socket.upgrade` is `ok` (admitted), `refused` (the token
offered is nobody's, or no place is left for a shell for nobody) or
`error` (the session could not be opened: the verifier
threw, what somebody holds could not be asked, their shell could not be built).
A `socket.close` span runs from the upgrade to the close.
`emit` is never awaited, and a sink that throws costs the caller nothing: the
throw is caught where the span is emitted, and logged.

`refused` is a no the server gave (a policy, a limit, an integration that is
not installed): an outcome, and not a fault. `attributes` holds identifiers
and measurements (a fingerprint, a count, a status) and never a payload, a
row or who a principal is: a principal is there only as `hasPrincipal`. Moss
sets none of `traceId`, `spanId` and `parentSpanId`.

```typescript
import type { Telemetry, TelemetrySpan } from '@niscorp/moss';

const spans: TelemetrySpan[] = [];
const telemetry: Telemetry = { emit: (span) => void spans.push(span) };
// ...and `telemetry` on the runtime handed to createServer
```

### Resolution

Who somebody is, what they hold and what they may read and write are asked of
the server, which resolves a principal the way a request does (the `identity`
seam, or `assignments`): `(await server.identity(principal)).roles`,
`server.catalogOf(principal)`, `server.policyForRoles(roles)`. Nothing is
exported that answers them from a manifest alone: three functions did, read
`assignments` and nothing else, and so answered `public` for everybody in an
app that resolves people through `identity`.

- Nobody signed in, and a signed-in principal with no role, wears
  `['public']`. The name is fixed, and the charter has to
  define it (`public: []` grants nothing). Where it does not, the server still
  boots and nothing is said; then every request with no session, and every
  signed-in principal with no assignment, fails with `Unknown role "public"` —
  a 500, a socket closed `4500`, a page served undrawn.
- A policy is compiled **one per role, merged** — a
  person may wear several (an instructor who also trains here), and reach belongs
  to the role rather than to the person. The merge is a union: broadest wins.
- An entry that declares a `reach` (vex) is served under the same roles'
  grants recompiled at that named profile. The vex surfaces and `executeAs` do
  it themselves; it narrows rows, never widens verbs.
- A layout variant a set of roles holds (ring 2) is put in place of its
  action's layout where a shell is built, in the shell's layout store.
  Nothing answers the variants by themselves.
- `verifyApp(app, grants)` — the check boot runs, for an app
  that is not booted (a check, a build step): the charter with each role's
  closure audited, every entry's reach, the layout variants. It reads `charter`,
  `actions`, `layouts`, `wearable`, `assignments`, `entries` and `behaviors`
  of what it is handed, so a check may hand it those alone. `grants` is every
  `<table>.<verb>` the database can carry (vex's `scopeGrants(tables)`). The
  report is `{ errors, said, charter }`: `errors` is `{ check, detail }[]`,
  `check` one of `'actions'` (a definition nova's schema does not read),
  `'charter'`, `'reach'` and `'variants'`; `said` is what a boot only says (a
  chain of steps that never ends), and `charter` is the charter engine's whole
  report. A boot refuses on `errors`. A running server answers for what is in
  force with `server.charterReport()`. It verifies and does nothing else: what
  it is handed is not read by the manifest's schema and is not frozen.

A charter check that boots no server builds the universe a boot resolves
`data` over (the app's tables and the engine's own, AGENTS.md rule 10a) and
asks `verifyApp`:

```typescript
import { PGlite } from '@electric-sql/pglite';
import { MOSS_SEQUENCE, verifyApp } from '@niscorp/moss';
import { migrate } from '@niscorp/strata/postgres';
import { createPostgresCache, scopeGrants } from '@niscorp/vex';
import { createPglitePool } from '@niscorp/vex/pglite';

const scratch = createPglitePool(new PGlite());
await migrate(scratch, [MOSS_SEQUENCE, createPostgresCache({ pool: scratch }).sequence]);
const { rows } = await scratch.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
const report = verifyApp(app, scopeGrants([...tables, ...rows.map((row) => String(row['table_name']))]));
for (const error of report.errors) console.error(`${error.check}: ${error.detail}`);
```

### The shell host

- `ShellHost` — `{ session, snapshot, deliver, list, reset }`:
  the durable per-principal shell host, as `server.shells` and
  `server.page(path).host`. The server creates it (`src/shells/`; the factory
  is not exported). It is handed no manifest and no
  runtime, but a typed object of what it needs: one function that answers what
  a principal's shell is made of (who they are, the action definitions they
  hold, the canvases and the frame, each naming its layout in the layout
  store, the layout store's seed with those layouts in it (for an action the
  published one over the build's, their roles' layout variant over that, and
  over it the layout of their own they marked in use), the
  fragments, the entries, the component names), the
  app's code a shell calls (`inputs`, `seeds`, `phrases`, `functions`,
  `onSession`, `runs`), the wire for a token, and its limits. Everything in
  that answer but who somebody is comes from the running manifest, which is
  asked once for each build and once for each adopt
  (`artifactsFor`, `src/artifactory/running.ts`): an action, a layout, a fragment and an entry
  reach a shell through that one answer, and the server's wiring reads none
  of them off the app. For an entry that is what a shell is told of the reads
  on its screens. What a read replays the engine asks the running manifest
  for too (see "Where the app's entries are held", under `createServer`).
  A kept shell may sit unattached for
  `runtime.shellIdleMs` (default 30 minutes; `0` disables the sweep). A shell
  that is not kept (nobody signed in; any shell of a page's host) ends when
  its last terminal leaves, and the host holds nothing of a shell that has
  ended.
  - `session(token, principal, options?)` — `options = { seed?, inputs? }`;
    `snapshot` is described under [The document](#the-document), and what it
    answers is exported as `ShellSnapshot`.
    Two first arrivals for one principal in the same moment are handed one
    shell: one is built.
    A build is bounded by `runtime.endpointTimeoutMs` (30 seconds when
    unset). It runs the app's code (`identity`, `inputs`, `phrases`), and
    code that hangs for one call costs that call: a build that has not
    landed by then fails, `session` and `snapshot` reject for whoever waited
    on it, and the next arrival builds afresh. What the app's code answers
    after that is not used: the build stops there, calls none of
    `functions`, `onSession` and `seeds`, and makes no shell.
    A session whose shell is not kept is the host's until that shell ends,
    so that a change can reach it. The socket ends it when the connection
    closes. Code that opens one in process and attaches nothing ends it
    itself, with `session.detach(connection)` (any connection: none was
    attached); until then the host holds the shell.
  - A host has no `adopt` and no `stop`. Each was a second way, for one
    host, to something a server does for all of them at once.
    **A change is the server's.** When what the app consists of changes
    (`server.refresh()`, `server.replaceActions()`, `server.replaceEntries()`, an integration approved
    or removed, a change another process made), every living shell of every
    host adopts (a layout somebody saved for themselves is adopted by the shells of that principal alone): it is brought level with what its principal holds now, in
    place. Every living shell: the ones a host keeps, and the ones it built
    for one connection, which for the app's host is each visitor's and for a
    page's host is everybody's. Definitions that arrived or changed are
    registered and mounted instances keep their state; one that left, or is no
    longer granted, is removed and its instances unmounted. The shell's own
    layouts are taken from the same answer: each `{ ref }` of the layout
    store and each fragment that is answered differently from the last time
    is put in place, and every attached terminal is sent the frame. The
    shell's layout, a canvas's and an
    action's own layout are each one of those refs, so a screen that is open shows a
    layout that changed, with its data kept, and a ref that is answered no
    longer is taken out of the store. One
    that is answered as it was is left alone, so a ref the shell's own code
    set since (`shell.setLayout`) stands through a change that did not touch
    it. The canvases a shell's manifest declares, and what is mounted on any
    canvas, are the shell's own state and are not taken again: a reset builds
    that afresh. A canvas the manifest does not declare, that a layout in
    force held a slot for, is taken out by an adopt, with what is mounted on
    it, once no layout holds the slot. A
    shell that cannot adopt is logged and keeps what it held; the rest go on.
    Each shell adopts on its own: one whose principal is never answered (an
    `identity` that hangs for them) holds up no other. So a change asks about
    every living shell in the same moment, and an app's `identity` runs at
    once for every signed-in principal whose record is not held.
    A shell whose build was under way adopts when it lands, and so does one a
    reset was replacing; no change waits for a build, or for another change.
    One built for the length of a `snapshot` is read and ended, and adopts
    nothing.
    **So is stopping.** `server.close()` stops every host's idle sweep, with
    everything else the server started.
  - `deliver(principal, channel, payload?): boolean` — publish a message,
    with what it carries, into every living shell this host has for one
    principal. `server.shells` is the app's own host, which keeps one shell
    for a principal: that one. (A page's host keeps none and reaches the one
    it built for each of their connections.) `false` = they have no living
    shell in this host; nothing is built. This host, in this process: it
    reaches no page's shell and no other process. To tell somebody's screens
    that something changed, wherever they live, a server calls `nudge`.
  - `list()` — every durable shell alive right now, each as
    `{ principal, connections, since, idleSince, canvases }`. moss owns the map,
    so moss enumerates it; an app keeping its own note beside it can only drift.
    `connections` is how many terminals are attached now. `since` is when the
    shell was built: a reset builds another, and moves it. `idleSince` is
    since when no terminal has been attached, and `null` while one is. Both
    are epoch milliseconds. `canvases` is each canvas with something mounted,
    as `{ id, actions }`: the ids of the actions on its stack, the top one
    first.
  - `reset(principal): boolean` — dispose that principal's shell and stand its
    replacement in the same slot, carrying the attached connections across.
    Every living shell of theirs on this host: the one it keeps for them, or,
    on a host that keeps none (a page's), the one built for each of their
    connections, each replaced for itself.
    `false` = they hold no shell, which is an answer, not an error. The
    replacement is built from what the shell was opened with (for a page's,
    the inputs of its path and its id seed), and a shell's resets run one
    after another. A reset whose build throws, or has not landed within
    `runtime.endpointTimeoutMs`, is logged and leaves the shell that stood;
    the reset after it goes ahead.
- What `ShellHost.session(token, principal)` returns (a type that is not
  exported by name: `Awaited<ReturnType<ShellHost['session']>>`):
  `{ shell, attach, detach, resync, dispatch, publish, back, popTo, reset }`. The living nova `Shell`,
  for in-process hosts (dev checks, embedded tools) that drive it directly;
  remote clients ride `attach`/`dispatch`. Nine members of `shell` throw, as
  on [`FunctionSession`](#functionsession): the whole shell is
  `unverifiedShell(session)`. `shell` is a **getter** — `reset`
  replaces the shell under a session already held, so a snapshot of the field
  would go on addressing the disposed one.
  `dispatch(canvas, event)` holds what a terminal sent to the shell: the
  canvas must be one the shell has, an `origin` the event names must be an
  instance on that canvas (with none, the canvas's active instance is
  stamped), and the event must parse as one of nova's (`NovaEventSchema`:
  `ui:click`, `ui:submit`, `ui:input`, `ui:focus`, `ui:blur`, `ui:model`,
  `ui:key`, `ui:drop`, with their fields and no others). One that fails any
  of the three is dropped.
  `attach(connection, { delta? })` takes anything with `send(text)` and
  `close(code?, reason?)`. `delta: true` says the connection can apply frame
  deltas, which it is then sent where `runtime.shellFrameDelta` is on; absent,
  it is sent whole frames. `resync(connection)`, `back()`, `popTo(canvas,
  instance)` and `reset()` do what the message of the same name does
  ([The socket protocol](#the-socket-protocol)). `back()` answers `false`
  when there was nothing left to undo. After `reset()` the session object is
  still good: the attached connections are carried across and sent a fresh
  frame.

A check that connects in process hands the socket a `Connection` of its own,
and reaches the app's shell host as `server.shells`:

```typescript
import { mintDevToken } from '@niscorp/moss';
import type { ShellHost } from '@niscorp/moss';
import { PROTOCOL, offerToken } from '@niscorp/moss/protocol';
import type { Connection } from '@niscorp/moss/protocol';

const frames: string[] = [];
const connection: Connection = {
  send: (text) => void frames.push(text),
  close: () => undefined,
  onMessage: () => undefined,
  onClose: () => undefined,
  // who is asking, as a transport reads it off the upgrade (`session: 'dev-open'`)
  upgrade: { offered: offerToken(mintDevToken('usr_ada')) },
};
await server.socket(`/socket?protocol=${PROTOCOL}`, connection);
const shells: ShellHost | undefined = server.shells;
// a message with a payload, into the shell this process keeps for her
const shown: boolean = shells?.deliver('usr_ada', 'notify', { text: 'Saved.' }) ?? false;
// "her notes changed": every shell of hers, in every process, reads again
server.nudge('usr_ada', 'notes-changed');
```

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
- `Connection` (`@niscorp/moss/protocol`) — the transport seam: `{ send, close, onMessage, onClose }`.
  `onClose` is called once, as soon as who is asking is decided and before
  `hello`: a connection that closes while its session is being opened (its
  catalog asked, its shell built) is not attached to a shell, so a kept shell
  idles and one built for that connection alone is disposed. The type also
  has `upgrade` (below) and `seal`. `seal` is set by the socket, on a
  connection whose browser holds a seal: a transport leaves it out.
- `ServerMessage` (`@niscorp/moss/protocol`) — what the server sends: `hello | catalog | frame | render |
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
- **The close codes.** Two are exported, by `@niscorp/moss/protocol`, because
  they are the two a terminal recovers from by dropping its token:
  `CLOSE_INVALID_TOKEN = 4401` and
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
    keeps what it holds and reconnects with its usual backoff, which grows
    for as long as it is refused.
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
  and `offerToken` are exported from `@niscorp/moss/protocol`, for a terminal
  written by hand; `PROTOCOL_MIN` and `CLOSE_PROTOCOL_MISMATCH` are defined in
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

A terminal written by hand, with the four things it takes from this entry:

```typescript
import { CLOSE_INVALID_TOKEN, CLOSE_SIGNED_OUT, PROTOCOL, offerToken } from '@niscorp/moss/protocol';
import type { ServerMessage } from '@niscorp/moss/protocol';

const socket = new WebSocket(`wss://app.example/socket?protocol=${PROTOCOL}`, offerToken(token));
socket.addEventListener('message', (event) => {
  const message: ServerMessage = JSON.parse(String(event.data));
  if (message.type === 'render') show(message.canvas, message.tree);
});
socket.addEventListener('close', (event) => {
  // the token is nobody's, or its session ended: do not offer it again
  if (event.code === CLOSE_INVALID_TOKEN || event.code === CLOSE_SIGNED_OUT) forgetToken();
});
```

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

A host with a listener of its own does by hand what `serve` does:

```typescript
import { serve as listen } from '@hono/node-server';
import { MOSS_PATHS, attachSocket, mountSite } from '@niscorp/moss/node';
import type { SiteConfig } from '@niscorp/moss/node';

const site: SiteConfig = { dist: 'dist', draw };
mountSite(server, site);
const httpServer = listen({ fetch: server.fetch, port: 8787 });
const sockets = attachSocket(httpServer, server.socket);
// ...and to stop: server.close(); sockets.close(); httpServer.close();

// is a path one the app server answers itself?
MOSS_PATHS.test('/api/vex');
```

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
    `close` is how the app is let go (default: `server.close()`).
  - `signIn(who)` enables `/dev/as/<who>`: it puts the returned token in the
    browser's session cookie and goes to `/`. `null` is nobody of that name.
    **It answers requests from this machine only**: the address at the other
    end of the request's socket is loopback (`127.0.0.0/8`, `::1`, or either
    written as an IPv4-mapped IPv6 address). Any other request is answered
    `403` with a sentence that says why, and the app is not asked. What a
    header says of where a request came from (`X-Forwarded-For`) is not read;
    behind a proxy on the same machine every request is the proxy's, and is
    this machine's.
  - `signInFromNetwork?: boolean` (default `false`) answers the sign-in to
    every device that can reach the dev server, for trying a signed-in screen
    on a phone. It hands out a session for whoever the address names: with it
    on and vite listening on a network (`--host`), anybody on that network
    signs in as anybody. Turn it on for as long as the phone needs it, on a
    network you trust, and not while browsing elsewhere.
  - `watch?: RegExp` (default: `src/app`, `src/server`, `src/db`, `src/ui` and
    the nisc config), `index?` (default `index.html`), `owned?` (default
    `MOSS_PATHS`), `label?` (default `moss`). `index` is the page template,
    relative to vite's root, and `label` the name in vite's log. `owned` is
    the paths that go to the app server, and a path it does not match is
    vite's. It takes the place of `MOSS_PATHS`: an app with a route of its
    own under another prefix names moss's prefixes and its own there.

```typescript
import { mintDevToken } from '@niscorp/moss';
import type { MossServer } from '@niscorp/moss';
import { mossDev } from '@niscorp/moss/vite';
import type { DevApp, MossDevOptions } from '@niscorp/moss/vite';

const app: MossDevOptions['app'] = async (load): Promise<DevApp> => {
  const { boot } = await load('/src/server/boot.ts');
  if (typeof boot !== 'function') throw new Error('src/server/boot.ts exports no boot');
  const server: MossServer = await boot();
  return { server, signIn: (who) => mintDevToken(who) };
};

export const plugins = [mossDev({ app })];
```

## `@niscorp/moss/integrations`

An integration is a separate service registered with the deployment, whose
actions join the manifest once an operator approves them. It is a feature: an
app that wants integrations creates it and names it in `features`.

```typescript
import { z } from 'zod';
import { createIntegrations } from '@niscorp/moss/integrations';

// What this app lets a bundle say beyond nisc's own fields.
const Listing = z.object({ title: z.string(), placedUnder: z.string().optional() }).strict();

const integrations = createIntegrations({
  integrationActor: (integration, actsFor) => `ig_${integration}@${actsFor}`,
  extension: {
    schema: Listing,
    check: (listing) => (listing.placedUnder === undefined || listing.placedUnder === 'hub.people' ? [] : [`placedUnder: "${listing.placedUnder}" is not a hub of this app`]),
    contract: { title: 'the store tile’s title', placedUnder: ['hub.people'] },
  },
});
const app = defineApp({ charter, actions, features: [integrations] });
const server = await createServer(app, runtime);

const registered = await integrations.listIntegrations();
const titles = registered.map((integration) => integration.extension?.title);
```

**A bundle** is what an integration publishes at `<url>/bundle`. Five fields
are nisc's own, and moss reads them; a sixth is the host app's.

| Field | What |
|---|---|
| `integration` | its id |
| `grants` | `{ actions, data }`: what it asks to be allowed. The operator's approval grants it |
| `grammar` | the grammar stamps its documents are written at (optional) |
| `actions` | its action definitions, by id |
| `phrasebook` | its phrases, by language (`de`, never `de-AT`) |
| `extension` | whatever the host app's own vocabulary is (optional). Moss does not read inside it |

The schema is strict. Any other top-level key refuses the bundle: `"meta" is
not a field of a bundle. What belongs to the host app’s own vocabulary goes
under `extension`.` A store listing, where a screen is placed, a setting a
person may change, a capability, a document a person edits: each is one app's
vocabulary, and the app that has it defines it.

#### `createIntegrations(config?: IntegrationsConfig<Extension>): Integrations<Extension>`

`IntegrationsConfig`, every field optional:

- `integrationActor(integration, actsFor): string | null | Promise<string | null>`
  — the principal a call made with an integration's key acts as; `actsFor` is
  the request's `x-nisc-acts-for`. `null`, or absent, refuses (`403`).
- `extension: ExtensionConfig<Extension>` — the app's own vocabulary for a
  bundle. Absent, a bundle that carries an `extension` is refused. Its four
  members:
  - `schema: z.ZodType<Extension>` — what a bundle's `extension` may be. It
    reads whatever the bundle carries there, a bundle that carries nothing
    included: a schema that takes `undefined` (`.optional()`, `.prefault({})`)
    makes the extension optional. Each place it does not read is a reason
    under `extension`. It also reads back what was stored, so it takes what it
    answers.
  - `check(extension, bundle): string[]` — the reasons the app refuses an
    extension the schema read, each a sentence. They are reported with moss's
    own, and any one refuses the bundle.
  - `prepare(extension, bundle): Extension | Promise<Extension>` — run once
    for an import that passed every check, before the row is written: what it
    answers is what is stored. For what must not depend on the vendor's
    service being reachable later (an image copied to the app's own store).
    Throwing refuses the bundle whole. Not called for an extension that reads
    as `undefined`.
  - `contract: unknown` — what the app tells vendors about its vocabulary: a
    plain value, served with the contract as it is.

  `check` and `prepare` are handed, as `bundle` (`ExtensionContext`), what moss
  knows of the bundle: `integration` (its id), `url` (where its service
  lives), `actions` (its action definitions, each already held to its
  namespace, its endpoints and the kit), `fingerprints` (the ones the app
  serves), and `layoutMisfits(layout)` (each place a layout does not fit the
  app's kit, for a vocabulary that lets a bundle carry one).
- `signingSeed: string` — a fixed seed for the keypair assertions are signed
  with: 32 bytes, as base64 (`node -e
  "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`).
  With none, a keypair is made when the feature starts and kept nowhere, so
  each boot and each process has its own. Give one where an integration's
  service holds the public half in its environment, or where a deployment
  runs more than one process: the same seed is the same key everywhere. It is
  this feature's setting and no other feature is handed it. One that decodes
  to fewer than 32 bytes refuses the boot.
- `outboundTimeoutMs: number` — how long a call out to an integration's
  service may take, its answer and its body together. Default `30000`, nova's
  default wait for an endpoint's reply. A whole number of milliseconds from 1
  to 2^31 − 1: anything else, `Infinity` included, throws where
  `createIntegrations` is called. It bounds every call: a screen's
  through the proxy, a vendor's webhook, `callIntegration`, the bundle fetched
  at registration, and the operator's probe. A call that is given up on reads
  as a service that is unreachable: `502` from the proxy, the webhook and a
  registration whose bundle did not arrive; `callIntegration` rejects; the
  probe answers `status: 0`. The shorter of this and an action's own
  `timeoutMs` ends a call, so an integration whose endpoint is slow by nature
  needs this raised as well; an answer that streams for longer than this is
  cut.

An integration's id is lower-case letters, digits and hyphens, starting with a
letter: it is a segment of every path the integration is served under and a
part of every action it ships. A registration under any other id is a `400`,
and a bundle that calls itself anything else is refused at intake.

`Integrations` is a feature that also carries the calls an app makes. They
work once a server has started the feature, and reject with a sentence before
that:

- `listIntegrations(): Promise<RegisteredIntegration<Extension>[]>` — every
  registered integration, in the order of the ids: `{ id, status, url,
  extension }`. `status` is `'pending'` or `'approved'`; `extension` is what
  the row holds, read by the app's schema and so typed by it (`undefined`: the
  bundle carried none, the app supplied no schema, or the schema no longer
  reads what was stored, which is logged with the integration's id). An app
  builds its placements, its listing and anything else from this.
- `callIntegration(id, path, { principal, method?, body?, scope? }):
  Promise<Response>` — call an installed integration when
  nobody is driving; throws unless it is approved and installed for the
  principal's tenant. It is not held to the integration's reach: an app calls
  an endpoint its own vocabulary names (a preview, a page it mounts on a route
  of its own) with this. `principal` is who the call is made for, and who the
  assertion names. `method` defaults to `POST`; `body` is sent as JSON;
  `scope` is merged over the principal's scope values in the assertion. What
  the integration answers comes back whatever its status: only a refusal and
  a service that cannot be reached throw. So a call that must still reach an
  integration that is being uninstalled (an erase) is made before the
  uninstall.
- `integrationByKey(key): Promise<string | undefined>` — the approved
  integration a presented key belongs to.
- `integrationOfAction(actionId): string | undefined` — which integration an
  `ext.<audience>.<integration>.<name>` action belongs to. It reads nothing,
  and answers before a server has started the feature.

Which integrations are live for a principal is `installed` on the record the
app's `identity.resolve` answers; absent, every approved integration is live
for everybody, and an empty list is none.
The rule that reads it is this feature's (an
`ext.<audience>.<integration>.<name>` action is there for somebody only where
that integration is in their list), and it is laid when the feature starts:
an app that names no feature has no such rule, and holds an `ext.…` action
of its own wherever the charter grants it.

What the feature serves once it is started:

| Path | What |
|---|---|
| `/api/integrations/*` | `GET contract` (`?id=`, `?format=md`), `GET verify-key` |
| `/integrations/:id/*` | the proxy to an approved integration, as the signed-in caller; plus `hook/*`, which takes no session |
| `/operator/integrations` | list, register (`POST`), `:id/approve`, `:id/probe`, `DELETE :id` — keyed by `x-operator-key`, so only when `runtime.operatorKey` is set |

A bearer token with the `ik_` prefix is an integration key: it is resolved to
the integration it was issued to and, through `integrationActor`, to a
principal (`401` unknown key, `403` no actor). No two integrations hold the
hash of one key (a unique index on `integrations.key_hash`).

**What intake holds a bundle to**, before any of it is kept. It is upgraded by
its grammar stamps and read by the bundle's schema. Each action is named
`ext.<audience>.<integration>.<name>` under the integration's own id; each of
its endpoints is a fingerprint the app serves or a URL under
`/integrations/<id>/` (and not under `hook/`, the door that asks for no
session), and none is `fn:`; its layout composes what the app's kit has; and no
chain of its steps, laid over the app's own actions, runs for ever. Then
`extension` is read by the app's schema and held to the app's `check`. Every
reason, moss's and the app's, is reported together, and any one refuses the
bundle whole: the last good import keeps serving.

**What the routes do, in order.**

- *Register* (`POST /operator/integrations`, `{ id, url }`) fetches the
  bundle, runs intake, runs the app's `prepare`, and for an integration that
  is already approved asks whether the app could be served with the new
  actions. Then the bundle lands in one transaction: the integration's row,
  its actions in place of the ones it shipped before, and the hash of its key
  on the import a key is issued with. It lands whole, or the import before it
  is still there, whole. The answer carries `key` once, on the registration
  whose key the row holds: the hash is written where the row holds none, so of
  two registrations of one new integration in the same moment one is answered
  the key and the other is answered as a later import is, with none.
- *Approve* (`POST /operator/integrations/:id/approve`) reads what the
  integration shipped, asks whether the app could be served with it, and only
  then writes the approval. Refused, it answers `422` with the reason and
  nothing is written. Written, its actions are read from the rows and handed
  to the running app; if the app does not take them all the same (something
  else changed what it consists of in between), the approval is taken back:
  the row is pending again with the reason in `lastError`, and the answer is
  the same `422`.
- *The list* (`GET /operator/integrations`) answers each integration as `{ id,
  url, status, requestedActions, requestedData, approvedData, extension,
  lastImportAt, lastError, actionCount }`. `extension` is the stored value,
  as it is (`null`: none).
- *The contract* (`GET /api/integrations/contract`) carries the kit's
  components with their props, the audiences the charter drew an `ext.` fence
  for, the namespace, the key assertions are verified with, and, under
  `fingerprints`, the reads and writes the caller's own policy lets them
  replay: an integration asking with its key reads what its actor's rung
  reaches, and nobody signed in reads what `public` reaches. Under `extension`
  it carries the app's `extension.contract`, as the app handed it over; the
  key is absent when the app handed none.
- *The proxy* (`/integrations/:id/*`) forwards a signed-in caller's call to an
  approved integration that is installed for them, with an assertion that
  says who they are. It forwards the paths the integration's actions declare
  as endpoints, each for whoever holds an action that declares it, and
  answers `404` for any other path.
- *A webhook* (`POST /integrations/:id/hook/*`) takes no session and no
  assertion is minted for it: the body goes on to the integration's service
  byte for byte, with the vendor's headers but `authorization` and `host`,
  and the integration checks the vendor's signature itself. An integration
  that is unknown or not approved answers `404`. **The door has a limit, and
  it is a limit per process**: 240 calls a minute for each integration,
  counted in the memory of the process that takes them, in windows of a minute
  that start at a window's first call. Past it the answer is `429`
  `{ message: 'Too many.' }` and nothing is forwarded. With several processes
  behind one address a vendor is let through up
  to that many times 240 a minute, however the balancer splits its calls, and
  a process that restarts counts from nothing. It is not a ceiling for the
  deployment, and neither number is a setting: a deployment that needs one
  ceiling across its processes sets it where they meet, at its proxy.

**A vendor's own page inside the app** is the app's to mount. Moss frames
none: an app that wants one serves a route of its own (`routes(server)` in
`nisc.config.ts`), decides there who may open it, and fetches the page from the
integration's service with `callIntegration`, which signs the call as the
person looking.

**Its tables.** `integrations` and `integration_actions` are part of
`MOSS_SEQUENCE` (`@niscorp/moss`), and the feature names both as its own. They
are tables like any other in the charter's `data` universe: a role granted a
data wildcard denies them (`integrations.*`, `integration_actions.*`). An
app's own vex entry reads `integrations.extension` as it reads any column.

| Column of `integrations` | What |
|---|---|
| `id`, `url`, `status` | which it is, where its service lives, `pending` or `approved` |
| `key_hash` | the hash of the key it was issued; never the key |
| `requested_actions`, `requested_data`, `approved_data` | what it asked to be allowed, and what the approval granted |
| `reach` | every path the proxy forwards, with the actions that declare it |
| `phrasebook` | its phrases, by language |
| `extension` | what its bundle said in the app's own vocabulary, as the app's `prepare` answered it |
| `last_import_at`, `last_error` | when the last good import landed, and why the last one did not |

`integration_actions` holds one row for each action: `integration_id`,
`action_id`, `definition`, and `grammar`, the stamps the definition is written
at.

The feature reads and writes them through vex, with entries of its own that no
route serves (see [Features](#features)); it holds no SQL. Landing a bundle is
a batch, so `runtime.db` has to have `transaction`, as it does for any batch an
app writes.

The configuration, built apart from the call:

```typescript
import { z } from 'zod';
import { createIntegrations } from '@niscorp/moss/integrations';
import type { ExtensionConfig, Integrations, IntegrationsConfig, RegisteredIntegration } from '@niscorp/moss/integrations';

const Listing = z.object({ title: z.string(), press: z.array(z.string()).default([]) }).strict();
type Listing = z.infer<typeof Listing>;

const extension: ExtensionConfig<Listing> = {
  schema: Listing,
  // A press image is a path of the integration's own.
  check: (listing, bundle) => listing.press.filter((path) => !path.startsWith(`/integrations/${bundle.integration}/`)).map((path) => `press "${path}": not under this integration's own prefix`),
  // Copied once, at import: the listing never depends on the vendor's service again.
  prepare: async (listing, bundle) => ({ ...listing, press: await Promise.all(listing.press.map((path) => copyToOwnStore(bundle.url, path))) }),
};
const config: IntegrationsConfig<Listing> = { extension, signingSeed: process.env['SIGNING_SEED'] };
const integrations: Integrations<Listing> = createIntegrations(config);
const approved = async (): Promise<RegisteredIntegration<Listing>[]> => (await integrations.listIntegrations()).filter((integration) => integration.status === 'approved');
```

#### `createAssertionSigner(seed?)`

`{ verifyKey, mint(claims, ttlMs?) }` — the ed25519 assertion the feature signs
every call to an integration with, for a check or a service in the same
workspace that wants to mint or hold one. An integration verifies it against
`GET /api/integrations/verify-key`.

`seed` is 32 bytes as base64, and makes the same keypair wherever it is given:
it is what the feature is given as `signingSeed`. With no seed (absent, or
the empty string) a keypair is generated and kept nowhere. **A seed that is
given and decodes to fewer than 32 bytes throws**, when the signer is made,
which for a server is while it boots: `moss: the signing seed decodes to 13
bytes, and a signing key is 32. …` The sentence says the length and never the
seed. It used to be dropped without a word and a random key made in its place.
A seed longer than 32 bytes is its first 32.

```typescript
import { createAssertionSigner } from '@niscorp/moss/integrations';

// a check of an integration's own service: it is given the public half, and
// is then called with what a deployment would have signed
const signer = createAssertionSigner();
process.env['VERIFY_KEY'] = signer.verifyKey;
const assertion = signer.mint({ integration: 'belts', principal: 'usr_ada', scope: { studioId: 'st_north' } });
```

## `@niscorp/moss/tide`

A committed write, minted into [tide](../tide/README.md) as a fact. A feature:
an app that runs tide creates it and names it in `features`. It is what moss
keeps of hosting tide; the store and the driver are tide's own.

```typescript
import { createTideFacts } from '@niscorp/moss/tide';

const app = defineApp({ charter, actions, features: [createTideFacts({ tide: () => driver, identity, chain })] });
```

- `createTideFacts(config: TideFactsConfig)` — the feature an app names in
  `features`. The server starts it; it hears each committed write, and keeps no
  table.
- `TideFactsConfig` — `{ tide: () => Pick<Tide, 'ingest'> | undefined;
  identity: (scope) => string | undefined; chain?: (scope, hints) => hints |
  undefined }`. What each is asked, and when, is under
  [Reacting to writes](#reacting-to-writes). `ingest` is the one verb the
  feature calls: a `Tide` and a `TideDriver` each have it.

`@niscorp/tide` is an optional peer of moss, and this entry is the only one
that names it, as a type: an app that imports this entry has tide installed.

```typescript
import { createTideFacts } from '@niscorp/moss/tide';
import type { TideFactsConfig } from '@niscorp/moss/tide';

const facts: TideFactsConfig = {
  tide: () => driver,
  identity: (scope) => (typeof scope['studioId'] === 'string' ? `automation@${scope['studioId']}` : undefined),
};
const app = defineApp({ charter, actions, features: [createTideFacts(facts)] });
```

## `@niscorp/moss/protocol`

For code that speaks the wire itself: a client written by hand (a check that
opens a socket and reads frames), or a transport other than the one in
`@niscorp/moss/node`. A terminal uses `@niscorp/moss/client`, and an app
served by `nisc` or `serve` needs none of this. It exports `PROTOCOL`,
`offerToken`, `CLOSE_INVALID_TOKEN`, `CLOSE_SIGNED_OUT` and the types
`ServerMessage` and `Connection`, each described under
[The socket protocol](#the-socket-protocol).

## `@niscorp/moss/unverified`

`unverifiedShell(session)` — the whole nova `Shell` of a session, for code that
goes around moss: see [`FunctionSession`](#functionsession).

## `@niscorp/moss/client`

- `createWire(config?): Wire` — the app end of the socket. `config` is a
  `WireConfig`: `{ url?, env?, delta?, initial?, path? }`. Plain TypeScript, no React, no globals — everything
  host-shaped comes in as a `WireEnv`. `delta` (default `false`) advertises
  that this terminal can rebuild frame deltas; the snapshot it produces is
  identical either way. See [Wire size](#wire-size). `env` defaults to
  `browserEnv()`, and `url` (the socket's address) to `env.defaultUrl()`.
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
connection is served its first frame and on any principal change (a session
grant or a close-code recovery starts the backoff clean). Not when the socket
opens: a server opens a connection before it refuses it (`4503`, `4500`), so
a terminal that is refused each time waits longer each time. Two close codes are recoveries, not retries: `4403`
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
  a host's own control. `initial` names the target that is mounted first
  (default: the first). Omit `wire` and the terminal makes (and owns) one; `url`
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
  none). Omit `registry` for nova's default kit, as on `domTarget`.
  A kit's components name `document` as a global, so for the length of
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
  wire updates into one repaint, and `0` paints at once. Omit `registry` for
  nova's default TTY kit; `fallback` draws a component the kit has no entry
  for (default: nova's). `prompt` defaults to `› `.

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
  ink's renderer. `registry` puts the app's own Ink kit in its place.
  Interaction is the TTY REPL's numbered addressing plus
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
