# The artifactory

**Status: Proposed (2026-10-12), ready to build from. What it has to do
(part 2) and its ten design decisions (part 9) are the owner's and are
settled. Steps 1 to 3 of part 6 are built (2026-10-12), on the branch
`worktree-artifactory`; nothing else is. Part 0 is for whoever builds it, part 6 is the
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
`packages/moss/src`: 91 files in 16 modules, about 7,650 lines of code and
380 comment lines. `pnpm verify` passes on the branch. CI has passed on
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
- The app may ship several styles, and a person chooses one.
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
  publish, principal, ref (of the layout store), layout variant, style, entry,
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
| `data/tables.ts` | `MOSS_SEQUENCE` (`nisc.moss`): moss's tables, four migrations so far |
| `data/routes.ts` | the vex routes; `createIntentAnswers`, a query written for an intent while the app runs |
| `shells/build.ts` | `buildShell`: one nova shell from a `ShellComposition` |
| `shells/host.ts` | the shell host: build, adopt (`takeLayouts`), reset |
| `shells/sessions.ts` | the session a host hands out, and the one an app's functions are handed |
| `shells/snapshot.ts` | a drawn screen, and `shellNeedOf` (does a page need a server behind it) |
| `server/server.ts` | the boot, one step to a line |
| `server/hosts.ts` | what a shell is built from for a principal (`composition`) |
| `server/signals.ts` | what crosses processes on the fabric: a forgotten identity, a forgotten tag, a nudge |

**What has to change**

- **Entries had two holders, and have one since step 2.** The manifest's list
  was copied at every boot into vex's cache, a replay resolved there and asked
  the manifest nothing, a row from an earlier boot stayed, and there was no
  way to hand an entry over while a server ran. Now the artifactory holds
  them, the engine's cache asks it first, and `server.replaceEntries` hands a
  set over.
- **`artifactsFor(shell, roles, installed)` is synchronous and asked by
  roles.** Its answer is kept for each set of roles and install list, never
  for a person. What one person generated needs the principal, and rows need
  to be awaited. Its one caller is `server/hosts.ts`, and
  `ShellHostConfig.composition(principal)` is already by principal and
  awaited.
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
written through vex entries that `data` replays for the artifactory (the way
`data/own-entries.ts` serves the generation pointer).

- `artifacts`: a row is one version of one artifact. `kind` (action, layout,
  fragment, entry), `id`, `principal` (absent: a default), `version`, `body`
  (the artifact as authored), `grammar` (the stamp it was written at), which
  version it was copied from (the room left for merging), and the save it
  belongs to.
- `artifact_saves`: a row is one save. Who saved and when, and for whom (the
  principal, or everybody). A save holds one or several versions, and for
  each artifact it touches it says which version is in force, or none.

No row is changed or deleted. The latest save that touches an artifact says
what is in force for it. Going back to a version is a new save that holds a
copy of it. A reset is a new save that says none of mine is in force.

**Ids.** The artifactory gives a generated action its id: `generated.` and a
random part. Nobody passes one in. Nothing shipped, published or from an
integration may begin with `generated.`. A generated id is never held against
the charter's globs: it is in its owner's catalog because they own it, and in
nobody else's.

**Layouts.** Every layout sits in the shell's layout store under the name of
what draws it: `action/<id>`, `canvas/<id>`, `frame`. An app goes on writing
an action's layout inline; the artifactory moves it into the store when it
answers what a shell is made of, and the definition names it by `{ ref }`.
Changing a layout is then `setLayout`, and an open screen follows with its
data kept. A layout's body is `{ ref, layout, style?, use? }`: `style` says
which of the app's styles it belongs to, and `use` marks the one of several
that is in use. At a ref the order is: mine marked in use; the default of the
style I chose; the layout variant of my roles; the plain default; the build's
copy. Which style somebody chose is the app's to keep: it reaches the
artifactory on their identity record, beside their roles.

**What goes with an action.** A layout's id is the ref it fills, so it names
the action it is for. Taking a generated action out of force takes its owner's
layouts for it out of force in the same save, and a restore brings them back
together. A layout for an action that does not exist for its owner is not
loaded. When versions are pruned, the first to go are those for an action that
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

**Saving and publishing are one call.** A save is told who it is for: the
session's principal, or everybody. Nothing else differs: the same check, the
same two tables, the same history. A save for everybody is a default.

**The trusted channel.** The session handed to an app's functions can already
do what moss trusts shipped code with (`session.grant`, `session.revoke`).
Saving is one more of those. Any function may save for the session's own
principal. A save for everybody is reached the same way, from a function the
app ships for its owners, and the charter says who holds that function. That
is the whole channel: no route, no key, no command. A generated action cannot
reach it, because that function is on no list a generated action may call.

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
and nothing else. A save for everybody also passes what a boot verifies
(`verifyManifest`). A version that fails when a shell is built is left out,
and what is under it shows.

**Functions and the charter.** The manifest declares its functions by name
with a description each. The charter gains one part: which of them the
generated actions of a role may call. Until both exist, a generated action
calls no function.

**After a save.** A default moves the generation pointer: every process
follows and living shells adopt, as for every change of the app today. A
person's own save is adopted at once by their shells in the process that
saved; a deployment with several processes carries it to the others on its
fabric, as it carries a forgotten identity. An answer is kept for a principal
until they save or the pointer moves, so a request does not ask the database.

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

**Step 4. The two tables, and layouts that are saved.** The migration, the vex
entries for the rows, and saving a layout for the session's principal or for
everybody, from a function's session. Resolution for a principal (part 5), the
order at a ref, styles, which one is in use, history, going back to a
version, reset. `artifactsFor` and `catalogFor` take a principal and are
awaited. A person's own save reaches their open screens, and the other
processes over the fabric. *Tests that fail first:* one for each sentence of
this step. *Done when:* a generated layout for a shipped action shows on its
owner's open screen at once and on nobody else's; a published one shows for
everybody and wins over the build's; taking it back shows the build's again.

**Step 5. Generated actions and fragments.** The id (part 5, "Ids"), the
catalog of a principal with what they own, the check of a generated action's
endpoints, what goes with an action. A generated action calls reads only,
until step 8. Publishing an action gives it its id. *Done when:* a generated
action exists in its owner's shell and catalog and in nobody else's; one that
names a vex write, a function, or a read its owner may not replay is refused
with a sentence; removing it takes its layouts along and a restore brings
both back.

**Step 6. The draft.** In the shell, on the function session (part 5, "The
draft"). Lyceum shows it. Relay's builder, atrium's preview and lyceum's two
layouts move from `@niscorp/moss/unverified` onto it; the entry stays. *Done
when:* those three no longer import it, and what they did still works.

**Step 7. Generated reads that are saved.** Needs part 7's two items for vex
and strata first. A saved read is the query and its mapping's prism config,
under the fingerprint vex gave it. *Done when:* a saved read survives a
schema change that does not touch what it reads, and one saved under a shipped
fingerprint is refused.

**Step 8. The declared functions and the charter's part.** Needs part 7's
items for the manifest and for charter first. *Done when:* a generated action
may call a function on its owner's roles' list and no other.

**Step 9. Canvases through canvas slots.** An adopt adds a canvas a layout in
force has a slot for, and takes out one no layout has a slot for any more
(part 5, "Canvases"). *Done when:* a generated frame with a slot for a new
canvas shows that canvas on its owner's open screen, and taking the frame back
removes it.

**Step 10. Integrations through the one check.** The integrations feature asks
the artifactory to check a bundle's actions and layouts, in place of the three
seams it assembles that check from (`refusalOf`, `layoutMisfits`,
`endlessChains`). Its actions stay in its own table and reach the live list
as its set does today. *Done when:* the feature's seam is shorter by those,
and lyra's and lyceum's integrations checks pass.

## 7. What needs the owner's word before it is touched

Each is a change outside the artifactory, or to a type an app writes against.
Ask with the concrete change, at the step that needs it.

| What | Why | Step |
|---|---|---|
| **vex:** its shape mapper hands back the prism config it compiled, beside the compiled form | a saved read has to be the entry as authored, and the config is kept nowhere today | 7 |
| **strata:** one stored kind, for a vex entry | a stored entry carries the stamp it was written at and is upgraded where it is read | 7 |
| **moss, `NiscApp`:** functions declared by name with a description | today `functions(session)` is one map whose names are not known before a session | 8 |
| **charter:** one part, which functions the generated actions of a role may call | the charter decides what a generated action may run | 8 |
| **moss, `IdentityRecord`:** the style somebody chose | the app keeps the choice, and it reaches the artifactory with the roles | 4 |
| **moss, the fabric:** one more signal, "this principal saved" | a person's own save reaches their screens in another process | 4 |
| **moss, the function session:** the draft, and saving | the names are the owner's to hear before they are built | 4, 6 |

Nova owes nothing. Its reflection (`describeInstance`, which the devtools use)
and its audit read a layout off the definition and do not look behind a ref:
moss hands them a definition with the layout in place, through the session's
shell. On the whole shell (`unverifiedShell`) they see the ref.

## 8. Open

- How many versions of one artifact are kept, how large a body may be, and
  when pruning runs. Measure before proposing a number.
- What lyceum shows in step 6. The owner's to say.
- Relay's assistant still runs an engine of its own over `vex_cache`, for the
  queries its model writes. It moves onto the draft (step 6) and onto saved
  reads (step 7), which is where a query a model wrote gets a place in the
  artifactory.
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

## 9. The ten decisions

Settled on 2026-10-12. The reasoning is in parts 2 and 5.

- **D1.** A module of its own, `packages/moss/src/artifactory/`.
- **D2.** Two tables: a row per version, a row per save.
- **D3.** The artifactory gives a generated action its id. It exists for its
  owner and nobody else, and is never held against a charter glob. Removing
  it takes its owner's layouts for it along.
- **D4.** Every layout by ref. A change to an action's definition, not its
  layout, is seen by instances opened afterwards.
- **D5.** The artifactory takes the entries over, as the first answer of the
  cache vex is built with.
- **D6.** A generated action calls reads its owner may replay and functions on
  the charter's list, and makes no vex write.
- **D7.** Publishing is the save a person makes of their own, told it is for
  everybody, through a function the app ships for its owners.
- **D8.** Somebody else's publish while my screen is open is adopted in place.
- **D9.** Integrations' actions and an app's named sets are in the live list,
  not in the tables.
- **D10.** History is append only.
