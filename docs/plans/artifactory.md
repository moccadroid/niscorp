# The artifactory

**Status: Proposed (2026-10-12), ready to build from. What it has to do
(part 2) and its ten design decisions (part 9) are the owner's and are
settled. Steps 1 to 9 of part 6 are built (2026-10-14), on the branch
`worktree-artifactory`. Step 10 is struck (2026-10-14). Part 0 is for whoever builds it, part 6 is the
build, step by step, and part 7 is what needs the owner's word before it is
touched.**

## 0. For whoever builds this

You are adding one module to `@niscorp/moss`, the app server of nisc. You have
none of the conversation this plan came out of, and you do not need it: what
was decided is here.

**Read first, in this order.** `packages/nisc/AGENTS.md`, whole: its last
part, "Changing a package", binds this work. `packages/nisc/STYLE_GUIDE.md`.
`packages/moss/DESIGN.md`, "How the code is laid out". Then
[moss-refactor.md](moss-refactor.md): how moss is built, and in its part 6 the
owner's standing decisions. Then this file. Then the code part 4 names.

**Where the repository stands.** Start from the branch `worktree-artifactory`,
or from `main` once that branch is in it. Moss is
`packages/moss/src`: 95 files in 16 modules, about 8,360 lines of code and
490 comment lines. `pnpm verify` passes on the branch. CI has passed on
`main`, and has not run on the branch until it is pushed.

**The owner's rules.** Each was learned the hard way.

1. **A step is built on the owner's go, and on nothing else.** A question from
   the owner is not a go. Build one step of part 6, report, and stop.
2. **No other package's source is changed** without the owner's explicit
   approval: nova, vex, charter, strata, prism, tide, the CLI. Part 7 lists
   what this plan would need of them. Ask with the concrete change in hand. A
   document in another package that follows a new API is fine, and so is a
   lab app that follows one.
3. **The code speaks.** A comment only where the reasoning, a decision or the
   workings would be misread without it. No file headers, no history.
4. **Names an engineer would guess.** No coined words. What a person or a model
   produces while the app runs is "generated". A "tag" is a cache tag and
   nothing else. If a name needs a comment, change the name.
5. **The fewest mechanisms that solve it.** Never a mechanism to make one
   example pass. If something asks for a new mechanism that is not in this
   plan, it goes to the owner before any code.
6. **Tests.** Behaviour gets a test that fails first. A moss test starts no
   database and does not call `createServer`: it uses the doubles in
   `packages/moss/test` (`data-double.ts`, `shell-host-double.ts`). The one
   suite on a database is the integrations registry's.
7. **A commit moves code or changes behaviour, never both.**
8. **Say what you measured.** After each step: files, lines of code, comment
   lines and tests in `packages/moss`, before and after.
9. **No review loops.** At most one review of a step. A reviewer always finds
   something; what it finds that asks for a new mechanism goes to the owner.
10. **A green `pnpm verify` here is not a green CI.** A branch goes through a
    pull request before `main`. Never push without the owner's word, and never
    merge the "release: version packages" pull request: that one is the
    owner's alone.

**What "works" means after every step.** `pnpm verify` passes, and the lab
apps' checks are where they are today. Run each `src/dev/*-check.ts` as its
own process from its app's folder (`node --import tsx src/dev/<name>.ts`), one
at a time: encore 13 of 13; lyceum 17 of 18 (`model-check` needs a model key);
atrium 18 of 19 (`nisc-check` cannot spawn on Windows); relay 28 of 32 (two
need a model key, one a built file, and `harness-check` fails without this
work too); lyra 49 or 50 of 50 (`campaigns-check` fails between 23:00 and
24:00 UTC, `scoping-check` on some dates).

**To start a session on it:** "Read `docs/plans/artifactory.md` and propose
step N of part 6 to me before building it."

## 1. What it is

An app is made of artifacts: actions, layouts, fragments, vex entries. Today
they are what the build shipped, and changing one is a deploy. The artifactory
is the module of moss every load of an artifact goes through. It decides what
an id resolves to for the person asking: what the build shipped, what was
published since, what that person generated, or what they are drafting right
now. It keeps every saved version, so there is a history and a way back.

An agent, an editor, an assistant and a builder screen are callers of it and
no part of it.

## 2. What is decided

The owner's. Not to be asked again.

**What it is, and where**

- A mechanism of moss, not a library, and a module of its own:
  `packages/moss/src/artifactory/`.
- The first use is lyceum, so that it can be shown. No other app gets a new
  feature for it.
- No lab app is protected as it is, and none is left broken. Where one reaches
  around moss for what the artifactory now holds, it is moved onto the
  artifactory in the same step. What it generated before is dropped: none of
  their databases is live.
- An app talks to the artifactory's API and to nothing behind it. Where a
  thing is kept is internal, so that a change of storage is a migration and
  never a change of API.

**What it holds**

- Every nova artifact can be generated and saved: actions, an action's layout,
  the shell's layout (the frame), a canvas's layout, fragments. And vex reads.
- Nothing else. A canvas is not a kind of its own: a layout may hold canvas
  slots, and a canvas is added that way. Colour themes, wording and site
  content are not artifacts of nova or of moss.
- An action and an entry carry their prisms with them.
- A shipped artifact goes through the same way in as every other, and does not
  have to be a row.
- The actions of an integration, and a set of actions an app hands over while
  it runs, are in the artifactory's live list. They are not rows of its
  tables.

**Whose it is**

- What is for everybody is shipped or published. What is generated is for the
  person who generated it.
- No feature is built around sharing a generated artifact. It was built on the
  fly, and nobody should rely on one that somebody else generated.

**Ids, and what goes with what**

- The id of a generated action is never chosen by a person or a model. The
  charter grants by id, so a chosen id could claim a grant or stand in for a
  shipped action.
- A generated action runs in its owner's scope.
- Layouts go with the action they are for. A layout for an action that is
  gone is waste and does not linger. A generated layout for an action that
  exists stays.

**Where an id resolves**

- Every load goes through it: an action, a layout, a fragment, a vex entry. It
  is asked; it is not handed around.
- It decides what a shell's layout store holds. It is where the charter is
  applied.
- A published default wins. The build's own copy is what is left when nothing
  is published, or when the published one fails its check.
- Shipping a new look to everyone (the same kit, most layouts, a few actions)
  is this same system, not a second one.

**Publishing**

- New defaults go live without a deploy.
- Publishing happens the same way a person saves what they generated, through
  a trusted channel for the owners. There is no command for it and no build
  step: a publish from the app's source is a deploy by another name.

**Layouts**

- Several layouts may exist for one thing. Generating three of my own while
  the app ships one loses none of them: which one is in use is separate from
  the layouts.
- My own change shows on my open screen at once. What somebody else publishes
  while my screen is open is adopted in place.

**The draft**

- While something is being generated it lives in a draft, in the shell: a
  temporary manifest.
- Several things that depend on each other are saved together, by hand. That
  save is one step of the history.
- The steps taken while refining are the draft's own history and nobody
  else's.
- The draft is gone when the shell is lost.

**Saving, history, reset**

- Everything saved is kept as a version. History is append only: nothing a
  person does destroys anything.
- Reset is what a person does to one artifact they changed: back to the
  default. The default is whatever is published now.
- An artifact is replaced whole for now. Room is left for updating or merging
  one later.

**What a generated action may do**

- It calls only shipped functions, and only those on a list the charter
  approves. Each function on the list has a description, and the list is what
  an agent or an editor is handed.
- It makes no vex write. A write is wrapped in a function. A copy of a shipped
  action is a generated action and is held to the same.
- A shipped action is reviewed and is not held to the list.
- The charter is not edited through the artifactory.

**Vex entries**

- The artifactory holds the whole entry and is asked before vex's cache.
- There is one path for all entries. A saved entry is not a second form beside
  a seeded one.
- The entries an app ships are in the live list, read from the build at every
  boot, as its actions are. They are copied into no table.
- An entry reaches a running server through the server
  (`server.replaceEntries`), never by a row written into vex's cache table.
- `vex_cache` stays as it is until the artifactory holds everything and every
  app is moved onto it. Then it is deleted.

**The check**

- One check for an artifact, made of the checks prism, nova and vex already
  have.

**Words**

- Use the words that exist: artifact, kind, version, save, draft, default,
  publish, principal, ref (of the layout store), layout variant, entry,
  fingerprint, manifest. "Generated" for what a person or a model produces
  while the app runs. "Steps" only for the draft's own history.
- Not to be used: made, slot (for anything but nova's canvas slot), look,
  picks, an owner called "shipped", "step" as a column, one blob called
  "documents", "from", and "tag" for anything but a cache tag.

**The bar**

- The result is simple in its architecture. A requirement that would contort
  it is dropped before the design is.

## 3. What was run

Probes on 2026-10-07 and 2026-10-08, all removed afterwards. Each is a fact the
design leans on. Run one again before you lean on it harder than it was run.

**Nova**

- Replacing an action with `registerAction`: an instance that is already open
  keeps the old layout, and one opened afterwards shows the new.
- An action whose layout is held in the layout store and named by `{ ref }`
  follows `setLayout` on the open screen, with its data kept. The same holds
  inside a fragment.
- Every action of the five lab apps (185) draws the same first screen with its
  layout held under `action/<id>` and named by ref, alone and inside each of
  its app's fragments (335 combinations). First screen, default data, no
  network; triggers were not run.
- The refs apps use today (`renderer` and `xray` in lyceum, `room` in encore,
  Midas's dock) do not clash with `action/…`, `canvas/…` and `frame`.
- Nova's `livenessOf` cannot see what is behind a `{ ref }` root. A page whose
  layouts are held by ref is misjudged (a file, or a server behind it) unless
  the definition is handed over with its layout in place.
- A canvas slot names a canvas by `canvasId` and may sit in any layout. A slot
  for a canvas the shell does not have draws nothing. A shell has `addCanvas`
  and `removeCanvas`.

**Vex**

- Vex, unchanged, behind a cache that asks somebody else first: a shipped
  entry that was never written to any table answers; a saved one answers and
  survives an unrelated `ADD COLUMN`; a generated one that was not saved stays
  in `vex_cache` and is deleted by the schema change.
- A seeded entry carries no schema fingerprint and is never stale. A generated
  one carries it, and is deleted on its first replay after the schema changes.
- After a column an entry reads is dropped, a replay fails with `invalid_dsl`,
  and `engine.compile(dsl)` throws the same before anything runs.
- Vex names a generated query itself: `fp_` and sixteen characters of a random
  hash (`mintFingerprint`). A shipped entry's fingerprint is a name its author
  wrote.
- A cache entry holds the query and the compiled mapping. The mapping's prism
  config is not kept anywhere: `createShapeMapper` (`@niscorp/vex/agent`)
  answers `{ ir, transformed }`. Prism's compiled form has no migration path.

**The apps as they are**

- All 185 actions and 408 entries of the lab apps are plain JSON and parse
  again after a round trip.
- 69 of the 185 shipped actions call a vex write directly. They name 71
  functions, and none has a description.
- `vex_cache` is named in atrium, relay, encore's boot check, fable and
  mythos. Fable and mythos have a shell of their own and no moss.
- Three things read the copies of an app's entries that moss wrote into
  `vex_cache` until step 2 (read on 2026-10-12): relay's assistant, which runs
  an engine of its own over that table and replays shipped entries from it;
  atrium, which wrote a connector's entries there itself after a sync; and
  moss's own `migrateTables`, which takes a copy as the record that an earlier
  deploy shipped an entry as it is. Midas does none of the three.
- `@niscorp/moss/unverified` is used by relay (a model builds an action and it
  is registered in the user's shell), atrium (an operator previews a fetched
  layout as an action), lyceum (two functions set a layout into a ref for one
  session), and by lyra's check harness and relay's builder checks.

## 4. Moss as it is, and what has to change

Read against the code on 2026-10-12. Paths are under `packages/moss/src/`.

**Who answers what today**

| File | It holds |
|---|---|
| `manifest/app.ts` | the types an app is written in (`NiscApp`, `ShellManifest`), `defineApp`, and two readings of an app: `entriesOf`, `wearableOf` |
| `manifest/schema.ts` | the schema that parses a manifest and freezes it |
| `manifest/verify.ts` | `verifyManifest` (what a boot checks), `layoutMisfits`, `endlessChains`, and a layout variant put in place (`variantLayouts`, `withVariants`) |
| `artifactory/running.ts` | `createRunningManifest`: the actions in force (the build's, then each named set), `catalogFor`, `artifactsFor`, `onChange`, `claim` and `replace` for named sets |
| `artifactory/roles.ts` | what a set of roles holds, kept per set of roles |
| `artifactory/artifacts.ts` | `ShellArtifacts`, `shellComponents` |
| `artifactory/generation.ts` | the generation pointer: a counter every process polls, so a change in one reaches the others |
| `artifactory/entries.ts` | the entries in force (the build's, then each set handed over), compiled as vex replays them |
| `data/engine.ts` | `createDataLayer`: the vex engine, and the cache it is built with, which asks the artifactory first (`createEntryCache`) |
| `data/data.ts` | `createData`: `entriesHeldBy`, `fingerprints`, policies, `executeAs`, the pointer's row |
| `data/own-entries.ts` | how moss reads and writes its own rows through vex (`createOwnEntries`, `POINTER`) |
| `data/tables.ts` | `MOSS_SEQUENCE` (`nisc.moss`): moss's tables, five migrations so far |
| `data/routes.ts` | the vex routes; `createIntentAnswers`, a query written for an intent while the app runs |
| `shells/build.ts` | `buildShell`: one nova shell from a `ShellComposition` |
| `shells/host.ts` | the shell host: build, adopt (`takeLayouts`), reset |
| `shells/sessions.ts` | the session a host hands out, and the one an app's functions are handed |
| `shells/snapshot.ts` | a drawn screen, and `shellNeedOf` (does a page need a server behind it) |
| `server/server.ts` | the boot, one step to a line |
| `server/hosts.ts` | what a shell is built from for a principal (`composition`) |
| `server/signals.ts` | what crosses processes on the fabric: a forgotten identity, a forgotten tag, a nudge, and (since step 4) the word to adopt for one principal |

**What has to change**

- **Entries had two holders, and have one since step 2.** The manifest's list
  was copied at every boot into vex's cache, a replay resolved there and asked
  the manifest nothing, a row from an earlier boot stayed, and there was no
  way to hand an entry over while a server ran. Now the artifactory holds
  them, the engine's cache asks it first, and `server.replaceEntries` hands a
  set over.
- **`artifactsFor(shell, roles, installed)` was synchronous and asked by
  roles**, and takes a principal with their rows and is awaited since step 4.
  What a set of roles holds is still kept for each set of roles and install
  list; what one person saved is laid over it. Its one caller is
  `server/hosts.ts`.
- **`catalogFor(roles, installed)` is the same**, with four callers outside
  `artifactory`: `server.catalogOf` and the socket's catalog
  (`server/server.ts`), the catalog route (`server/routes.ts`), and the seam
  `grantedActionIds` (`server/features.ts`), which the integrations proxy asks
  on every call it forwards.
- **An adopt does not take the canvases again** (`takeLayouts`,
  `shells/host.ts`). It applies the frame, each ref of the layout store and
  each fragment that is answered differently.
- **A shell's liveness reads a definition off the mounted instance**
  (`shells/snapshot.ts`). Since step 3 it puts the layouts the shell's store
  holds in place of the refs before it asks nova (`store.resolveReferences`).
- **The module rule.** `manifest` may not import `data`, and `data` imports
  `manifest`. The artifactory and `data` need each other: one for its rows,
  the other for the entries. Neither imports the other: each is handed
  functions by the server, as the generation pointer's are today.

## 5. The design

**The module.** `artifactory/` takes over the question `manifest` answers
while a server runs: what the app consists of right now, and what of it exists
for somebody. `running.ts`, `roles.ts`, `artifacts.ts` and `generation.ts`
are in it. `manifest` keeps the app as it is handed over: its types, its
schema, its verification, and the four functions that verification is built
from (`entriesOf`, `wearableOf`, `variantLayouts`, `withVariants`). The
artifactory imports `manifest` and `identity`.

**The live list.** What it answers from while a server runs: the build's
artifacts, the published defaults, and the sets that are handed to it (an
integration's approved actions, a set an app hands over). The handed sets are
checked and resolved like everything else and are not written to its tables.

**Where an id resolves.** For a principal, in this order, the first that
exists and passes the check: the draft in their shell; what they generated;
the published default; the build's copy.

**Two tables**, appended to `nisc.moss` as its next migration, and read and
written through vex entries that `data` replays for the artifactory, as
`data/own-entries.ts` does for the generation pointer, with one difference
(the owner's, 2026-10-13): the pointer's row is nobody's, and these rows are
somebody's. So the entries are replayed as the caller, with the caller's
scope, under a row rule moss ships: a caller reads and writes only the rows
whose `principal` is their `userId`. Vex keeps that on every read and write.
No entry names a principal, and moss's code passes none. The same rule is in
the policy an app's charter compiles to, so a role that is granted the two
tables reaches its own rows there. The tables are moss's and an app's charter
does not have to name them. What is published for everybody is the rows of
one principal that no caller is, `*`, under that same rule ("Publishing a
default", below).

- `artifacts`: a row is one version of one artifact, which is what one save
  says about it. `kind` (action, layout, fragment, entry), `id`, `principal`
  (whose it is), `body` (the artifact as authored; absent: none is in
  force), `grammar` (the stamp it was written at), the version it was copied
  from (the room left for merging), the save it belongs to, and `created_at`.
- `artifact_saves`: a row is one save. Its `id`, who made it, whose it is,
  and `created_at`. A save holds one or several
  versions. Who made it is the saver for a person's own, and whoever
  published for a default.

No row is changed or deleted, so `created_at` is the one time a row has, and
there is no version counter: the latest save that touches an artifact says
what is in force for it. Going back to a version is a new save that holds a
copy of it. A reset is a new save that says none of mine is in force.

Every id moss gives is a uuid: a save's, and a generated artifact's. An id
that names something stays that name: an action's id, the ref a default layout
fills, a fingerprint.

**Ids.** The artifactory gives a generated action its id: `generated.` and a
uuid. Nobody passes one in. Nothing shipped, published or from an
integration may begin with `generated.`. A generated id is never held against
the charter's globs: it is among the actions its owner's shells are built with
because they own it, and among nobody else's. It is in no catalog (the
owner's, 2026-10-13; it was to be in its owner's catalog): the catalog is what
the charter grants, and what somebody generated is listed by
`session.artifacts.list('action')`.

**Layouts.** Every layout sits in the shell's layout store under the name of
what draws it: `action/<id>`, `canvas/<id>`, `frame`. An app goes on writing
an action's layout inline; the artifactory moves it into the store when it
answers what a shell is made of, and the definition names it by `{ ref }`.
Changing a layout is then `setLayout`, and an open screen follows with its
data kept. A layout's body is `{ ref, layout, use? }`: `use` marks the one of
several that is in use. At a ref the order is: mine marked in use; the layout
variant of my roles; the published default; the build's copy. Moss knows that
several layouts may fill one ref, and nothing about why an app has several.

**What goes with an action.** A layout names the ref it fills, and so the
action it is for. A layout's id is one moss gave it, a person's own and a
published one alike (the owner's, 2026-10-13; a default's id was to be its
ref, one for each ref): several may be kept for a ref, and one is marked in
use. A layout for an action that does not exist for its owner is not
loaded, and that is how a generated action that is taken out of force takes
its owner's layouts for it along (the owner's, 2026-10-13; they were to be
written out of force in the same save): no row is written for them, they stay
listed and are not drawn, and they are drawn again when the action is
restored. When versions are pruned, the first to go are those for an action that
exists nowhere any more.

**Canvases.** A canvas exists for a shell while a layout in force holds a
canvas slot for it. A layout that comes into force with a slot for a canvas
the shell does not have adds it (`addCanvas`), and one that leaves takes it
out again. The canvases a shell manifest declares stay as they are.

**The draft.** It lives in the shell and is a capability of the session an
app's functions are handed: read and list what is in it, put one or several
artifacts (one numbered step), remove one, show the draft as it was at a step,
discard it, save it. What is put passes the check and is applied to that one
shell at once, so its owner sees it. It is gone when the shell is.

**Saving is the session's principal's** (the owner's, 2026-10-13; it was
"saving and publishing are one call", told who it is for). No call names whose
rows are meant: a function that saves reaches its own principal's rows and
nothing else, whatever it passes. A default for everybody is a different
question (who may change what everybody sees) and is not a way of saving from
a session.

**Publishing a default** (the owner's, 2026-10-13). A published layout is a
row of the same two tables, read and written by the same three entries under
the same row rule. Its `principal` is `*`: one principal that stands for
everybody and that no caller is. A publish is a save replayed with `*` as the
`userId`, so history, going back, reset, the mark for the one in use and the
check are a person's, with no second path. It is called on the server:
`server.defaults(publisher)` answers the five calls a session's `artifacts`
has. No session can reach it: every write a session makes carries its own
`userId`, by the rule, and moss refuses a caller whose `userId` is `*`
wherever it composes a caller's scope for vex (its own entries, the routes, an
intent a function asks). Only the app's own server code
calls `defaults`, as only it calls `replaceActions`. **Who may publish is the
charter's**: the app puts the call in a function and the charter says who
holds the action that calls it. Who published is kept with the save
(`created_by`), written by the rule from a scope value no caller's scope may
carry (`artifactSavedBy`). One read of what is published answers every shell a
process builds: a boot makes it, and the first shell after a publish there or
a move of the generation pointer makes it again. It is laid under what a
person saved. A publish has this process's living shells adopt and moves the
pointer.

**Who may save.** A function that calls `session.artifacts.save` is the app's,
an action calls it, and the charter says who holds that action. There is no
route, no key and no command. A generated action cannot reach it, because that
function is on no list a generated action may call.

**What a publish gives an id.** A generated action has an id nobody chose and
no charter grants. As a default it has to be granted, so whoever publishes it
gives it its id, as a shipped action has one, and its layouts' refs follow
that id. Publishing a new version of something that is already a default
keeps the id. A read keeps its fingerprint.

**Entries.** `data/engine.ts` builds the engine with a cache that asks the
artifactory first (built in step 2): a shipped or handed-over entry, and later
a published or saved one, is answered by it, compiled from the entry as
authored. Anything else is vex's own table's, but only a row vex wrote for a
request: it carries that request's hash (`requestHash`), or is a negative
result. A copy of an app's entry that an earlier release left there carries no
such hash and is not an entry any more, and neither is a row an app put there
by hand. The schema fingerprint is not the mark: an app's cache may strip it
(relay's does). What vex writes goes to its own table. Listing the keys
answers both. Nothing is copied at boot. A generated read keeps the
fingerprint vex gave it. Saving one under a fingerprint a shipped or published
entry has is refused, so a generated read can never answer in place of a
shipped one. A replay runs under the policy of whoever calls it, whoever saved
the entry.

When everything is held by the artifactory and every app is moved, `vex_cache`
is deleted. Until then it keeps the queries a model wrote; for it to go, a
query that was written and not saved needs a place in the artifactory, which
the draft is.

**The check.** At a put into the draft, at a save, and when a shell is built:
the kind's schema (nova's, vex's), `auditAction`, the layout against the kit
(`layoutMisfits`), the chains that never end (`endlessChains`), a read against
the schema (`engine.compile`), and a generated action's endpoints against what
it may call: a read its owner may replay, a function on the charter's list,
and nothing else. A published action also passes what a boot verifies
(`verifyManifest`), from step 5 on; of a layout a boot verifies only that it
names no ref under `action/`, which every save checks. A version that fails when a shell is built is left out,
and what is under it shows.

**Functions and the charter.** The manifest declares its functions by name
with a description each. The charter gains one part: which of them the
generated actions of a role may call. Until both exist, a generated action
calls no function.

**After a save.** A default moves the generation pointer: every process
follows and living shells adopt, as for every change of the app today. A
person's own save is adopted at once by their shells in the process that
saved; a deployment with several processes tells the others on its fabric to
bring that principal's shells level. The message says that, and nothing about
what the person did. No answer is kept for a principal (the owner's,
2026-10-13; it was to be kept until they save or the pointer moves): what they
saved is asked of the rows once for each shell built for them and once for
each adopt, so a save made in another process is theirs at the next build
whether or not a fabric is set.

## 6. The build

Each step is its own go from the owner, and moss works after each (part 0).
Before building a step, say to the owner what it adds to moss's public API and
by what names, and wait.

**Step 1. The module. Built (2026-10-12).** Moves only. `artifactory/` has
`running.ts` and `generation.ts` from `manifest/`, and `roles.ts` and
`artifacts.ts` but for four functions: `entriesOf`, `wearableOf`,
`variantLayouts` and `withVariants` stay in `manifest`, because its
verification is built from them and the artifactory imports `manifest`
(`entriesOf` is read by `data`'s migration too). It has its own `index.ts` and
a line in the table of `scripts/check-modules.mts`. `data` writes out the two
shapes it took from `manifest` (the pointer, and the listener it subscribes
with), so that it imports nothing of the artifactory. Nothing behaves
differently. *Done when:* the source holds the same top-level statements as
before, but for two types in `data` (`Pointer` is written out there, and one
member of `Data` names the listener's shape), and part 0's "works" holds.

**Step 2. Entries through the cache. Built (2026-10-12).** The engine's cache
asks the artifactory first (part 5, "Entries"): for the build's entries, and
for a set an app hands over while the server runs, which is one new call,
`server.replaceEntries(source, entries)`, the twin of `replaceActions`.
`Data.seed` and its call are gone, and nothing is copied into `vex_cache`.
Two lab apps moved with it: atrium hands its connectors' entries over as a set
where it wrote them into the table, and relay's assistant, which runs an
engine of its own, is given relay's entries by relay where it found moss's
copies. `data/migrate.ts` is as it was: it still takes a copy in the table as
the record that an earlier deploy shipped an entry as it is. Moss writes no
copy any more, so that pass is given for what a release before this one
copied, and for what an app copies itself for an engine of its own (relay). *Tests that failed first:* a
shipped entry replays with nothing in the table; an entry that left the app is
refused though an old row holds it; a generated query still replays from the
table; the list of fingerprints holds both; a set of entries handed over is
replayed, replaced whole, and refused whole when one of it fails. *Done when:*
those pass and part 0's "works" holds.

**Step 3. Every layout by ref. Built (2026-10-12).** The artifactory answers
each action's layout in the layout store under `action/<id>` and the
definition with `{ ref }` (part 5, "Layouts"; `actionsByRef`,
`artifactory/roles.ts`). No table yet. `shells/snapshot.ts` puts the shell's
layouts in place of the refs before it asks nova whether a page is live: every
ref, with nova's own `resolveReferences`, so a field in a stored layout an app
names by ref counts too, where it was missed. Where a layout is kept does not
show to an app: a definition read off a session's shell is the action as it
was written, with its layout in place, and that shell's layout store is to
read. `action/` is moss's: a manifest whose layout store declares a name under
it refuses the boot, and so does an action's layout or a layout variant that
names one, so no layout is drawn inside itself. The layout of an action that
leaves a shell leaves its store. *Tests that fail
first:* a shell's actions name their layouts by ref and draw what they drew;
`setLayout` on that ref changes an open screen and keeps its data; a page
that was a file is still judged a file. *Done when:* those pass, every lab
app draws what it drew, and part 0's "works" holds.

**Step 4. The two tables, and a person's saved layouts. Built (2026-10-13).**
Migration `nisc.moss/5` makes `artifact_saves` and `artifacts`. Three vex
entries read and write them (`artifactory/saves.ts`), with the row rule they
run under, replayed by `data` as the caller (`Data.artifactEntries`; an
owner's entries may now carry row rules and a replay takes a scope,
`data/own-entries.ts`). A function's session saves through
`session.artifacts`: `save`, `list`, `history`, `restore`, `reset`, each for
the session's principal (`artifactory/session.ts`). `artifactsFor` takes a
principal with their rows and is awaited: under an action's ref it answers
their own layout marked in use, else their roles' layout variant, else the
build's. A save tells whoever follows that principal (`onChangeFor`), which
the server answers by having their shells adopt and by the fabric's fourth
message, `adopt`. `catalogFor` stays as it is: what somebody generated is in
no catalog (step 5). No lab app saves a layout yet: lyceum does in step 6.
*Tests that failed first:* `artifactory-saved.test.ts` (the calls, the order
at a ref, what is refused, what is left out), `server-saved.test.ts` (open
screens, two processes on one fabric), cases in `server-assemble.test.ts`
(the server's own wiring; `behaviors` that name the tables), and the rows on
a real database in the case of `baselines.test.ts` that already has one up
(whose a row is, what a charter's grant reaches). *Done when:* a generated
layout for a shipped action shows on its owner's open screen at once and on
nobody else's, and nobody reads or writes a row that is not theirs.

**Step 4b. A layout published for everybody. Built (2026-10-13).** Part 5,
"Publishing a default". `server.defaults(publisher)` (`server/server.ts`)
answers the calls of `artifactory/session.ts` over the rows of `*`
(`savedRowsOver(...).published`, `artifactory/saves.ts`), held to every
action in force. The running manifest keeps one read of what is published and
drops it when this process publishes or the pointer moves (`readPublished` is
the boot's read, made once the pointer is watched), and `artifactsFor` lays it
over the build's and under a role's layout variant and a person's own.
`callerScope` refuses a caller whose `userId` is `*`, or whose scope says who
made a save, for moss's own entries, the routes and a function's intents. No
migration and no new entry: the write rule of `artifact_saves` now takes
`created_by` from `artifactSavedBy`. *Tests
that failed first:* cases in `artifactory-saved.test.ts` (the order at a ref,
the calls, what is refused, what is left out, two processes on one pointer,
whose rows a call reaches), `server-assemble.test.ts` (open shells, a boot,
a caller whose `userId` is `*`), `server-saved.test.ts` (open screens) and
the rows on a real database in `baselines.test.ts`. *Done when:* a layout an
owner publishes shows on every open screen without a deploy, a person's own
stays over it, and no session can write or change one.

**Step 5. Generated actions and fragments. Built (2026-10-13)**, as the list
the owner approved that day, which is narrower than this step was written.
`session.artifacts` keeps two more kinds, `action` and `fragment`
(`artifactory/session.ts`). Moss gives the id (`generated.` and a uuid), and
no action in force and no fragment a shell ships has one under that prefix
(`manifest/verify.ts`, `manifest/schema.ts`). The check is
`artifactory/generated.ts`: nova's schema, the id, the layout against the kit
and the names under `action/`, each endpoint (a `POST` to the app's vex route
naming one fingerprint of a read in force its owner may replay), and nova's
audit with what its owner holds as the catalog. `artifactsFor` adds what
passes to the actions and the fragments a shell is built from, each action's
layout under its ref, and leaves out what does not, with a line. What a caller
may replay is `data`'s to say, handed over by the server (`server/hosts.ts`).
*Tests that failed first:* `artifactory-generated.test.ts`, and cases in
`server-saved.test.ts` (an open shell), `server-assemble.test.ts` (the read
answered as its owner) and `manifest-schema.test.ts`. *Done when:* a generated
action exists in its owner's shell and in nobody else's; one that names a vex
write, a function, or a read its owner may not replay is refused with a
sentence; removing it takes its layouts along and a restore brings both back.
*Not in this step any more:* the catalog (part 5, "Ids"); publishing an
action, which is to be proposed on its own, because it changes the live list
and what a boot verifies; a fragment of one's own in the place of a shipped
one; saving and opening in one call, which is the draft's (step 6).

**Step 6. The draft. Built (2026-10-13)**, in moss, and no app uses it yet
(the owner's: lyceum is wired to it in a session of its own, and no app is
touched while it works). `session.draft` (`manifest/app.ts`) has `put`,
`list`, `remove`, `show`, `discard` and `save`. The draft is kept by the shell
it is in (`shells/draft.ts`): its steps, and which one is shown. The shell
asks for what it is made of with what its draft holds (`composition`, and
`artifactsFor` lays it over what was saved, `artifactory/draft.ts`), and a
change to the draft is awaited (`adoptDraft`, `shells/host.ts`). What is put
is checked, and a draft is saved, by what a session's save is made of
(`draftSaving`, `artifactory/draft.ts`). *Tests that failed first:*
`server-draft.test.ts`. *Done when:* what is put into a draft is on that one
screen when the put answers and nowhere else, and one call saves it.
*Not in this step any more:* relay's builder, atrium's preview and lyceum's
two layouts stay on `@niscorp/moss/unverified`, which they were to leave. Read
on 2026-10-13, none of the three is something a draft takes: the actions
relay's model builds replay queries the model wrote (step 7); atrium previews
another app's layout with components its own shell has none of; lyceum's two
calls switch a layout of the shell's own store for one session, which is
neither generated nor saved.

**Step 7. Generated reads that are saved. Built (2026-10-14).** Needs part 7's two items for vex
and strata first. A saved read is the query and its mapping's prism config,
under the fingerprint vex gave it. *Done when:* a saved read survives a
schema change that does not touch what it reads, and one saved under a shipped
fingerprint is refused. As built: three changes in vex and the read kind in
the artifactory (`artifactory/reads.ts`); part 8, "Step 7 as built".

**Step 8. The declared functions and the charter's part. Built
(2026-10-14).** Needs part 7's items for the manifest and for charter first.
*Done when:* a generated action may call a function on its owner's roles'
list and no other. As built: the charter's `functions` part decides what every
session may call, and a generated action holds its owner's; part 8, "Step 8 as
built".

**Step 9. Canvases through canvas slots. Built (2026-10-13).** An adopt adds a canvas a layout in
force has a slot for, and takes out one no layout has a slot for any more
(part 5, "Canvases"). *Done when:* a generated frame with a slot for a new
canvas shows that canvas on its owner's open screen, and taking the frame back
removes it. As built: the shell's own layout and each canvas's are in the
layout store, under `frame` and `canvas/<id>`, and the shell draws each by
that name (`shellWithStoredLayouts`, `artifactory/artifacts.ts`); a layout
saved under `frame` or `canvas/<id>` takes the place of the app's own shell's
(`artifactory/layouts.ts`); the answer for a shell lists the canvases its
layouts hold a slot for and its manifest does not declare (`slottedCanvases`),
and an adopt takes out one that none holds a slot for any more
(`takeCanvases`, `shells/host.ts`). It adds none: part 8, "Step 9 as built",
has why, and what else was decided on the way.

**Step 10. Integrations through the one check. Struck (the owner's,
2026-10-14).** The integrations feature was to ask the artifactory to check a
bundle's actions and layouts, in place of the three seams the server hands it
(`refusalOf`, `layoutMisfits`, `endlessChains`). There is no check of its own
to replace. `refusalOf` is the running manifest verifying a set of actions, as
`replaceActions` does, and the other two are the functions a boot and the
check of a saved layout call (`manifest/verify.ts`). They are asked at three
moments (a bundle taken in, installed, approved), `layoutMisfits` is handed on
to the host app's own check of a bundle, and a bundle's layouts are held to
the components the app declares, where a saved layout is held to those its
shells use. One call in their place would be a wrapper around the same three,
with nothing an app or whoever writes a bundle could tell apart. No step
touched the integrations feature, and lyra's, lyceum's and atrium's
integrations checks pass.

## 7. What needs the owner's word before it is touched

Each is a change outside the artifactory, or to a type an app writes against.
Ask with the concrete change, at the step that needs it.

| What | Why | Step |
|---|---|---|
| **vex:** its shape mapper hands back the prism config it compiled, beside the compiled form | a saved read has to be the entry as authored, and the config is kept nowhere today | 7, built |
| **strata:** one stored kind, for a vex entry | a stored entry carries the stamp it was written at and is upgraded where it is read | 7, built: declared by vex (`@niscorp/vex/migrations`); strata needed nothing |
| **moss, `NiscApp`:** functions declared by name with a description | today `functions(session)` is one map whose names are not known before a session | 8, not built: nothing is added to `defineApp`; after 8, `functions(session)` returns a list of `{ id, description, execute }` |
| **charter:** one part, which functions the generated actions of a role may call | the charter decides what a generated action may run | 8, built as the part that decides what every session may call |
| **moss, the fabric:** one more message, "bring this principal's shells level" | a person's own save reaches their screens in another process; the message says what to do, and nothing about why | 4, built: `adopt` |
| **moss, the function session:** the draft, and saving | the names are the owner's to hear before they are built | 4 built: `session.artifacts`; 6 built: `session.draft` |
| **moss, `MossServer`:** `defaults(publisher)` | publishing is the app's own server code's, and no session's | 4b, built |

Nova owes nothing. Its reflection (`describeInstance`, which the devtools use)
and its audit read a layout off the definition and do not look behind a ref:
moss hands them a definition with the layout in place, through the session's
shell. On the whole shell (`unverifiedShell`) they see the ref.

## 8. Open

- How many versions of one artifact are kept, how large a body may be, and
  when pruning runs. Measure before proposing a number.
- What lyceum shows with the draft. The owner's to say, and to build in a
  session of lyceum's own.
- Relay's assistant still runs an engine of its own over `vex_cache`, for the
  queries its model writes. It moves onto saved reads (step 7), which is
  where a query a model wrote gets a place in the artifactory, and onto the
  draft with them.
- `nisc migrate` gives its pass, for an entry that was already broken before a
  run, to an entry that has a copy in `vex_cache`: one an earlier release
  wrote, or one an app writes itself for an engine of its own. The pass goes
  when the table does.
- An app that hands over a set of entries and a set of actions makes two
  calls, and living shells adopt twice. One call for a whole set would be a
  third way to hand something over; it is not built.
- A new action that makes a vex write still ships in a build: what can be
  published is what can be generated. And a published default wins over a
  build that is deployed later, until it is taken back. Both follow from what
  is decided, and are said here so that nobody is surprised by them.

**Functions with descriptions, after step 8** (the owner's go, 2026-10-14).

- **`functions(session)` returns a list of `{ id, description, execute }`**
  (`FunctionDefinition`, exported): a function carries its id, which the
  charter's `functions` and every `fn:` endpoint name. `session.functions()`
  answers `{ id, description? }` for each function a session may call. Two
  under one id are refused when a shell is built: the boot cannot see them,
  as a session's functions are known only once it is.
- **A map of handlers still works, and is deprecated.** The first shell a
  process builds says once what to change: the map, or the functions with no
  description (an empty one counts as none).
- **In moss only.** Nova's `createShell` keeps a name and a handler; moss hands
  it each `execute`. Nobody but the listing reads a description, and the
  listing is moss's.
- **Not built:** an `input` schema on a function. It is the next field when an
  app's model needs to know what to send.

**Step 8 as built** (the owner's go, 2026-10-14, for the list below).

- **The charter's `functions` part means the same for every session**: the
  app's functions a principal's shell holds. A role with none may call none
  (the owner's: "from now on we encourage people to be deliberate"). The plan's
  design had the part decide only what generated actions may call, beside a
  declaration of functions with descriptions; neither was built. A generated
  action holds what its owner's roles grant, as it does for the actions it
  opens and the reads it replays.
- **Nothing was added to `defineApp` in step 8.** `session.functions()` named
  the functions a session may call; what one does was the app's to tell its
  model. Descriptions came after it (above).
- **The boot refuses**, and lists per role combination people wear (and
  `public`) each call of a held action, and of a fragment the shells ship,
  that its grants miss. **`'*'` is said at boot. A grant that names nothing is
  said at the first shell a process builds**, with the charter's own checks,
  because the names of the app's functions are known only once a session is.
- **The upgrade is the app's:** the changeset says what to add, and the boot
  lists it. No codemod: a charter is the app's permissions table. The lab
  apps' charters were given deliberate lists, read off the boot's refusal.
- **A vex write a generated action names itself stays refused.** A function
  the charter grants is the app's own code, and may write.
- **From the review:** what a living shell holds follows the roles an adopt
  answers, as its actions do (it was fixed at build, so a role gained while a
  shell was open got its actions and not their functions); the boot check
  reads each role on its own too, as the variant check does; a function name
  with a template in it is decided when it is called (a generated one is
  refused, as a templated address is); two shells that ship a fragment under
  one id are each read; the `'*'` line says "allows" and names the roles that
  extend it.
- **The first-shell check reads that shell's names.** An app whose functions
  differ by who the session is for may see a grant reported that another
  session's names would match. Merging the names over later shells would be a
  further mechanism; not built.
- **Not built:** a switch that lets generated actions replay vex writes (the
  owner floated it; not now, with no app that needs it).

**Step 7 as built** (the owner's go, 2026-10-14).

- **Three changes in vex.** Its shape mapper answers the Prism config it
  compiled (`config`, required: every app here uses vex's own mapper), and the
  engine keeps it on the entry it writes (`mapping`), with a column for it in
  vex's table, a new migration, `nisc.vex.cache/2`. Vex declares one stored
  kind, `nisc.vex/entry` (`@niscorp/vex/migrations`). And the two lookups that
  replay an entry hand the cache the scope of whoever asks.
- **A saved read is answered to its owner alone** (the owner's choice between
  two, 2026-10-14). Sharing with everybody is publishing, which is not built
  for a read. Anybody else who sends its fingerprint gets what vex's table still
  holds under it, as for any query vex wrote and nobody saved.
- **It is saved with no body**, under the fingerprint vex gave it: moss takes
  the entry vex wrote for the request from vex's table.
- **The order of a lookup:** what the app ships or was handed, then the
  caller's own saved read, then vex's table. The caller's read is asked before
  vex's table because vex drops a stale copy and does not ask again in the same
  request. Vex looks an entry up twice in a request (its handler, for the
  reach, and its engine), so a replay of a fingerprint the app does not ship,
  by a caller who is signed in, costs two reads of the history of that one id
  in the caller's rows, and a Prism compile each where a read is saved. Not
  measured. A caller nobody is signed in for is not asked for: nothing saved is
  answered to them, though a principal named as they are has the same id.
- **Held as a query vex wrote:** a saved read is answered not protected, so
  vex's `maxLimit` applies to it, and a request with an intent and a shape
  under its fingerprint writes a new query into vex's table, which its owner
  can save in its place. Answered protected, as the review found it built at
  first, it ran past `maxLimit`, and such a request was refused.
- **Its owner's policy applies when it is replayed, and not at the check of a
  generated action.** One over a read whose tables its owner can no longer
  read stays in force and its replay is refused, where one over such an entry
  the app ships is left out. Holding it at the check needs the owner's policy
  handed to the read's check, which is a new input: brought to the owner, not
  built.
- **Moss's data layer hands vex's table only what vex wrote for a request.**
  Vex writes back an entry it replays; one answered from a saved read is not
  the table's.
- **Loom moves with nova and vex.** It depends on both, and the changeset
  check refuses a breaking release whose dependents do not move. The nova
  changeset missed it since that change.
- **Not built:** publishing a read, and relay's assistant moving onto saved
  reads.

**Step 9 as built.** The builder's recommendations, built on the owner's go
(2026-10-13).

- **The shell's own layout is in the layout store under `frame`, and a
  canvas's under `canvas/<id>`.** An app writes `layout` and `actionLayout` as
  before. A shell manifest with no `layout` has no `frame` in its store and is
  drawn with nova's own. A canvas with no `actionLayout`, or with the name of
  a stored layout, is handed over as it is.
- **Both names are moss's, as `action/` is.** A manifest's `layoutStore`
  declares neither, and no action's layout, layout variant, saved layout or
  generated action or fragment names one by `{ ref }`. Without the second, a
  layout that names `frame` draws the shell's layout inside itself, and two
  that name each other are nested by nova until the stack overflows (1,422
  levels and a tree of 133 KB for a layout of two nodes, measured). The first
  breaks an app that has a stored layout under `frame` or under `canvas/`;
  none of the five lab apps has. Its changeset line says so.
- **The shell host calls nova's `setCanvasLayout` no longer.** The name of the
  shell's layout is given when the shell is built, and a changed layout is a
  changed ref.
- **A saved frame is the app's own shell's.** A row says `ref: 'frame'` and
  not which shell, and a page's frame places other canvases. So a page draws
  the layout it declares, and is a screen no saved frame changes. A row that
  says which shell can be added without breaking this.
- **A frame is not held to having a slot for every canvas its manifest
  declares.** A canvas a frame leaves out is drawn nowhere. The check was
  considered and left out: it can only read a slot whose id is written out, it
  forbids leaving a canvas out on purpose, and, as a saved layout is checked
  again whenever a shell is built, a deploy that adds a canvas would stop
  every saved frame from being drawn. An app that wants it checks the layout
  in its own function before it saves.
- **A shell manifest with no `layout` has no frame to take the place of.** An
  open shell could start drawing a saved one, and could not go back to nova's
  own when it is taken back: nova has no call for that and does not export
  its own.
- **Moss gives a shell no canvas, where this plan had an adopt add one**
  (`addCanvas`, part 5 and step 9). Nova gives a shell a canvas when something
  is first pushed onto it, and keeps such a canvas out of the canvases a frame
  loops over (`$.canvases`). Built with `addCanvas`, a canvas a slot named
  joined that loop, and a frame that loops over the canvases, nova's own among
  them, drew it twice: once by the loop and once by the slot (the review found
  it, and it was run). So an adopt only takes out: a canvas the manifest does
  not declare, that a layout held a slot for, once none does.
- **Every layout a shell is built from counts for a slot**, the build's and
  a saved or generated one alike: an action's that the principal holds, a
  fragment's, a canvas's, the frame, one the app keeps in its layout store. So
  an app that saves nothing notices one thing: a canvas its manifest does not
  declare, that an action's layout has a slot for, is taken out of an open
  shell once that action leaves it. It stayed before, drawn nowhere.
- **What each layout holds a slot for is read once and kept** with the layout
  document (a `WeakMap`). Reading every layout each time a shell is asked for
  took 3.4 ms for 200 layouts of 150 nodes, on the thread every session
  shares; kept, 0.005 ms.
- **A layout is named by a node that is `{ ref }` and nothing else.** A `ref`
  a component carries, on its node or in its props, names none: the check
  read every record with a `ref` before, which no prop collided with while
  the only names were under `action/`, and `frame` is a word a prop may hold.
- **A `layout`, or a canvas's `actionLayout`, that is the name of a stored
  layout is handed over as it is**, and one written as `null` is none. Nothing
  is kept under `frame` for such a shell, and no frame is saved for it.
- **A frame that names a ref nothing is kept under is saved.** Nova draws its
  error box in that place (`LAYOUT_REF_NOT_FOUND`) and the rest of the frame,
  as it does in an action's layout.
- **A canvas's layout is saved as the frame is**, under `canvas/<id>`, for the
  app's own shell, where the canvas has a layout of its own. Part 2 has it
  among what can be saved. It was left out of the list this step was first
  built from, by the builder's error, and built on the same go (2026-10-14).
- **Not built:** a layout of a page's shell, which follows from a saved
  layout being the app's own shell's.

**Step 6 as built.**

- **A session nobody is signed in to has no draft.** A draft is what is to be
  saved, and nobody saves nothing.
- **A draft layout fills `action/<id>`, as a saved one does.** A layout of the
  shell's own store (lyceum's `xray` and `renderer`) is not something a draft
  holds.
- **A step is the whole draft after it**, kept in the shell's memory, with no
  bound on how many there are. A shell that is dropped drops them.
- **`save` saves the step that is shown**, which is the last one unless
  `show` moved it.
- **Calls on one draft are taken in turn.**
- **What is put into a draft is held to what its own shell can draw**, where a
  save is held to what any shell of the app can. So a put is in the shell
  whenever it answers.
- **The draft is as it is to be only once the shell has taken it.** A change
  to it that the shell could not take leaves both as they were. Where the
  shell has adopted a later answer while this one was asked for, it is asked
  for again.
- **An adopt is the shell's it was asked for.** One that was asked for before
  the draft moved is asked for again with the draft as it is. One that is
  answered after a reset replaced its shell is dropped, where before step 6
  it was applied to the new shell: its answer holds the old shell's draft,
  and the new shell adopts for itself where it is behind.
- **A put that marks a layout in use takes the mark off the draft's others for
  that ref**, as a save does. Two of one put marked for one ref are refused.
- **The draft's code is in two modules**, as the draft is: the shell keeps it
  (`shells/draft.ts`, and the adopt in `shells/host.ts`), and the artifactory
  checks and saves it (`artifactory/draft.ts`). `shells` may not import
  `artifactory`, so the server hands the second to the first.

**Step 5 as built.**

- **The artifactory checks the artifact, and nothing about what it is combined
  with** (the owner's, 2026-10-13). A generated action emits and listens on
  channels as any action does, and the steps of a generated fragment run
  inside the action it is wrapped around, with that action's endpoints: both
  are nova's, and what an app hangs on a message is that app's. A refusal for
  either was proposed and turned down: it would have been a rule taken from
  what two lab apps happen to do. What an assistant may generate is the app's
  to decide, in its prompt and in the function that calls `save`.
- **`session.actions` holds the ids moss gave to the actions its principal
  generated**, beside the ids their roles are granted: it is the ids of the
  actions the shell was built with, and so are the `actions` the `inputs` and
  `seeds` hooks are handed. Left as it is (the owner's, 2026-10-13).
- **Nova keeps actions and fragments in one registry** (the owner's,
  2026-10-13; built the same day, outside the ten steps): `registerAction` and
  `removeAction` take either, told apart by `kind`, `registerFragment` is
  gone, a fragment a shell is constructed with is validated, and an id names
  an action or a fragment and never both. Moss's adopt takes a fragment that
  left out of a shell that is already open, and what a boot verifies refuses
  an action under the id of a fragment a shell ships. An app still writes
  `actions` and `fragments` as two lists; one list for both was not proposed.
- **What a generated action may open is held against what was in force for
  its owner when it was checked**, one of their own that is itself left out
  included. Nova refuses the push when it runs.
- **A fragment is not run through nova's audit**, which reads an action. It
  is held to its schema, its id, its layout and its endpoints.
- **A read is named by its fingerprint and not by the route it is called
  through.** One called through a resource's route that does not serve it is
  refused by vex when it runs.
- **The check asks what a caller may replay once for each save and once for
  each shell built for somebody who has a generated action or fragment with
  an endpoint**, and not otherwise.

**Step 4b as built, where the owner has not been asked.**

- **A caller whose `userId` is `*` is refused everywhere**, not only where
  they save: no shell is built for them, and `/api/vex` answers 500. An app
  whose `scope` answered `*` for somebody worked before this and does not
  now.
- **An app's own entry cannot make a save for a caller.** `created_by` is
  written from `artifactSavedBy`, which no caller's scope carries (one that
  does is refused, as `*` is: an app whose `scope` answers a value by that
  name does not run), so an insert or update of `artifact_saves` through an
  app's charter is refused (500). Before, a role that was granted the table
  could insert a save of its own. It can still read its rows, and add or
  remove versions of its own where its charter grants that. `executeAs` is
  the app's own code and hands vex the scope it is given.
- **Another process follows a publish within one poll of the pointer** (60 s
  unless `sessionRevalidateMs` says otherwise), as it follows a set of
  actions. The fabric carries nothing for a publish.
- **A publish is held to every action in force with the layout it is built
  with**, not to what one role holds. Under a role's layout variant it is not
  drawn, and it is not checked against that variant.
- **`publisher` is what the app hands over.** Moss keeps it and does not ask
  whether it is anybody.
- **A publish drops every identity record and has every living shell adopt**,
  as `refresh` does.
- **Of a published layout that no longer passes, each line is said once for
  each read of the rows.** A person's own is said at each shell built for
  them.
- **A read of what is published that fails fails the shell that asked**, as
  a read of a person's own rows does, and the next shell asks again. A
  publish is announced whether or not this process can read the rows back.
- **Where a set of actions a process loads is refused when the pointer
  moves**, the shells it builds from then on draw what is published now, and
  its living shells follow when the move is followed, at a later look.

**Step 4 as built, where the owner has not been asked.**

- **The audit.** A saved layout is held to what `auditAction` finds of its
  action with the layout in place and does not find of the action as it is
  built. So a layout that leaves out a control its action listens on is
  refused.
- **A saved layout fills `action/<id>`, where the action has a layout of its
  own.** An action with none, or one that names a stored layout by its id,
  cannot be given one. The frame and a canvas's layout are not in the layout
  store by ref, so neither can be saved. Step 9 needs the frame there.
- **`session.artifacts` as written**: what a call answers (`save` answers the
  save's id and each artifact's id, `list` and `history` answer versions with
  their bodies); `history` answers the newest 500; marking a layout in use
  writes a version without the mark for each of its holder's others for that
  ref, and of two that are marked the later counts (two saves at the same
  moment can leave that; a save that marks one for the ref, or takes the one
  in use out by a reset or by saving it without the mark, takes the mark off
  the rest); `restore` checks the old version as a save is checked and brings
  it to the grammars the server runs; a reset of what is not in force is
  refused.
- **The tables.** `created_by` is the saver's `userId`, as `principal` is,
  until somebody saves for somebody else; `principal` is never NULL in either
  table; `artifacts` is keyed by `(save, kind, id)` and refers to its
  save; one index, `(principal, kind, id, created_at)`; `created_at` is the
  database's clock, and two versions of one artifact in the same instant are
  told apart by their save; `copied_from` is a save's id; a reset is a version
  whose body is null. They are named `artifacts` and `artifact_saves`: an app
  whose database already has a table by either name cannot take the release
  that brings them.
- **Whose a row is, is the caller's `userId`**, which an app's `scope` can set.
  One account for each tenant keeps a person's layouts apart by tenant; one
  account across tenants has them follow the person. On a read the rule is
  one match and stays one. An app whose `scope` answers `userId: null` saves
  nothing: the two `principal` columns refuse a null.
- **A save is not told to `app.reactions`**, as no write of moss's own entries
  is. A read of the app's that follows the tables refreshes.
- **Moss's own entries only add rows.** An app whose charter grants a role
  update or delete on the two tables, and that ships an entry for it, lets
  that role change or remove its own rows. A row rule cannot take a verb away
  that a charter granted; it keeps every verb to the caller's own rows.
- **A saved layout is held to the components of every shell at a save, and to
  those of the one shell when it is built.** In a shell that cannot draw it,
  it is left out with a line.
- A sentence a refused layout gets from nova's schema can be as short as
  "layout: Invalid input". It is the schema's own.

## 9. The ten decisions

Settled on 2026-10-12. The reasoning is in parts 2 and 5.

- **D1.** A module of its own, `packages/moss/src/artifactory/`.
- **D2.** Two tables: a row per version, a row per save.
- **D3.** (Its last sentence is kept by its effect, 2026-10-13: part 5, "What
  goes with an action".) The artifactory gives a generated action its id. It exists for its
  owner and nobody else, and is never held against a charter glob. Removing
  it takes its owner's layouts for it along.
- **D4.** Every layout by ref. A change to an action's definition, not its
  layout, is seen by instances opened afterwards.
- **D5.** The artifactory takes the entries over, as the first answer of the
  cache vex is built with.
- **D6.** A generated action calls reads its owner may replay and functions on
  the charter's list, and makes no vex write.
- **D7.** Publishing is the save a person makes, made by the app's own server
  code as the one principal that stands for everybody, from a function the
  app ships for its owners. (Changed 2026-10-13: it was "the save a person
  makes of their own, told it is for everybody".)
- **D8.** Somebody else's publish while my screen is open is adopted in place.
- **D9.** Integrations' actions and an app's named sets are in the live list,
  not in the tables.
- **D10.** History is append only.
