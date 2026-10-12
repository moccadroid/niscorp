# The artifactory

**Status: Proposed (2026-10-12). What it has to do is decided: part 2 is the
owner's. The design is part 5. Of its ten decisions (part 6), D2, D4, D6 and
D8 are approved; D1, D3, D5, D7, D9 and D10 are explained there and wait for a
yes. Nothing is built. Moss was rebuilt first so that this has one place to go
([moss-refactor.md](moss-refactor.md)).**

## 1. What it is

An app is made of artifacts: actions, layouts, fragments, vex entries. Today
they are what the build shipped, and changing one is a deploy. The artifactory
is the part of moss every load of an artifact goes through. It decides what an
id resolves to for the person asking: what the build shipped, what the
developers published since, what that person generated, or what they are
drafting right now. It keeps every saved version, so there is a history and a
way back.

It is a mechanism of moss, not a library. An agent, an editor, an assistant
and a builder screen are callers of it and no part of it.

## 2. What is decided

The owner's. Not to be asked again.

**What it holds**

- Every nova artifact can be generated and saved: actions, an action's layout,
  the shell's layout (the frame), a canvas's layout, fragments. And vex reads.
- Nothing else. Which canvases a shell has is declared in the shell manifest
  and is not an artifact. Colour themes, wording and site content are not
  artifacts of nova or of moss.
- An action and an entry carry their prisms with them.
- A shipped artifact goes through the same way in as every other, and does not
  have to be a row.

**Whose it is**

- What is for everybody is shipped or published. What is generated is for the
  person who generated it.
- No feature is built around sharing a generated artifact. It was built on the
  fly, and nobody should rely on one that somebody else generated.

**Where an id resolves**

- Every load goes through it: an action, a layout, a fragment, a vex entry. It
  is asked; it is not handed around.
- It decides what a shell's layout store holds. It is where the charter is
  applied.
- Developers publish new defaults without deploying. A published default wins.
  The build's own copy is what is left when nothing is published, or when the
  published one fails its check.
- Developers shipping a new look to everyone (the same kit, most layouts, a few
  actions) is this same system, not a second one.

**Layouts**

- Several layouts may exist for one thing. Generating three of my own while
  the app ships one loses none of them: which one is in use is separate from
  the layouts.
- The app may ship several styles, and a person chooses one.
- My own change shows on my open screen at once. What somebody else publishes
  while my screen is open is adopted in place (D8).

**The draft**

- While something is being generated it lives in a draft, in the shell: a
  temporary manifest.
- Several things that depend on each other are saved together, by hand. That
  save is one step of the history.
- The steps taken while refining are the draft's own history and nobody
  else's.
- The draft is gone when the shell is lost.

**Saving, history, reset**

- Everything saved is kept as a version. There is a history.
- Reset is what a person does to one artifact they changed: back to the
  default. The default is whatever is published now. If the developers ship an
  upgrade, that is the default.
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

**The check**

- One check for an artifact, made of the checks prism, nova and vex already
  have.

**The first use**

- Lyceum, so that it can be shown. No other app gets a new feature for it:
  what they do today has to work, loading through the artifactory.

**Words**

- Use the words that exist: artifact, kind, version, save, draft, default,
  publish, principal, ref (of the layout store), layout variant, style, entry,
  fingerprint, manifest. "Generated" for what a person or a model produces
  while the app runs. "Steps" only for the draft's own history.
- Not to be used: made, slot, look, picks, an owner called "shipped", "step" as
  a column, one blob called "documents", "from".

**The bar**

- The result is simple in its architecture. A requirement that would contort
  it is dropped before the design is.

## 3. What was run

Probes on 2026-10-07 and 2026-10-08, all removed afterwards. Each is a fact the
design may lean on.

**Nova**

- Replacing an action with `registerAction`: an instance that is already open
  keeps the old layout, and one opened afterwards shows the new.
- An action whose layout is held in the layout store and named by `{ ref }`
  follows `setLayout` on the open screen, with its data kept. The same holds
  inside a fragment.
- A shell handed a layout store whose `get` asks somebody else: an open action
  and the frame follow a changed answer on the next render. Nova does not
  render by itself when that answer changes, so moss has to trigger it.
- Every action of the five lab apps (185) draws the same first screen with its
  layout held under `action/<id>` and named by ref, alone and inside each of
  its app's fragments (335 combinations).
- The refs apps use today (`renderer` and `xray` in lyceum, `room` in encore,
  Midas's dock) do not clash with `action/…`, `canvas/…` and `frame`.
- Nova's `livenessOf` cannot see what is behind a `{ ref }` root. A page whose
  layouts are held by ref is misjudged (a file, or a server behind it) unless
  the definition is handed over with its layout in place.

**Vex**

- Vex, unchanged, behind a cache backend that asks somebody else first: a
  shipped entry that was never written to any table answers; a saved one
  answers and survives an unrelated `ADD COLUMN`; a generated one that was not
  saved stays in `vex_cache` and is deleted by the schema change.
- A generated entry is deleted on its first replay after the schema changes. A
  seeded one carries no schema fingerprint and is never stale.
- After a column an entry reads is dropped, a replay fails with `invalid_dsl`,
  and `engine.compile(dsl)` throws the same before anything runs.
- A cache entry holds the query and the compiled mapping only, and prism's
  compiled form has no migration path. What is stored has to be the entry as
  authored.
- Vex names a generated query itself: `fp_` and sixteen characters of a random
  hash. A shipped entry's fingerprint is a name its author wrote.

**The apps as they are**

- All 185 actions and 408 entries of the lab apps are plain JSON and parse
  again after a round trip.
- 69 of the 185 shipped actions call a vex write directly. They name 71
  functions, and none has a description.
- Relay builds actions and reads with a model and keeps them in a map; an edit
  pushes a second copy over the open screen. Atrium previews a fetched layout
  in one operator's shell. Lyceum sets two layouts from functions. Midas has a
  dock layout a model writes that lives only in the shell.

## 4. What moss does for it now, and what it still has to change

Read against the code on 2026-10-12.

**Now.** While a server runs, the running manifest is the one place an action,
a layout and a fragment are asked of: `artifactsFor(shell, roles, installed)`
in `manifest/running.ts` answers the definitions a set of roles holds with
their layout variant in place, the shell's canvases, frame, layout store and
fragments, the entries by fingerprint, and the component names. A shell host
asks it once for each build and once for each adopt. An adopt brings a living
shell level with that answer in place. A change in one process reaches the
others through the generation pointer.

**Still to change**

- **Entries have two holders.** The manifest's list is copied once, at boot,
  into vex's cache (`Data.seed`, called in `buildRunningManifest`,
  `server/server.ts`). From then on a replay resolves in the cache and asks
  the manifest nothing. The cache also holds a query written for an intent
  while the app runs (`createIntentAnswers`, `data/routes.ts`), and any row
  from before this boot. There is no way to hand an entry over while a server
  runs.
- **`artifactsFor` is synchronous and asked by roles.** Its answer is kept for
  each set of roles and install list, never for a person
  (`manifest/roles.ts`). What one person generated needs the principal, and
  rows need to be awaited: the signature, the key the answer is kept under and
  its one caller (`server/hosts.ts`) move.
  `ShellHostConfig.composition(principal)` is already by principal and
  awaited.
- **`catalogFor(roles, installed)` is the same**, with four callers outside
  `manifest`: `server.catalogOf` and the socket's catalog
  (`server/server.ts`), the catalog route (`server/routes.ts`), and the seam
  `grantedActionIds` (`server/features.ts`), which the integrations proxy asks
  on every call it forwards.
- **An adopt does not take the canvases again** (`takeLayouts`,
  `shells/host.ts`). It applies the frame, each ref of the layout store and
  each fragment that is answered differently.
- **A shell's liveness reads the entries of its composition** (`shellNeedOf`,
  `shells/snapshot.ts`), so an entry that is only in the cache is reported as
  not readable.
- **`@niscorp/moss/unverified` is the second way in.** Relay, atrium and
  lyceum change a shell through it, unverified. The draft is what can take
  these over.
- **Named sets of actions** (`server.replaceActions`, a feature's own set and
  its loader) are how an action arrives while a server runs today.
- **The integrations feature's actions**: a bundle's actions and layouts are
  artifacts that arrive from somewhere else. Eleven of its 23 seams and the
  rows of `integration_actions` exist for that.
- **The module rule.** `manifest` may not import `data`. Rows it needs are read
  and written by entries that `data` replays for it and hands over as
  functions, as the generation pointer's are.

## 5. The design

**Where an id resolves.** For a principal, in this order, the first that
exists and passes the check: the draft in their shell; what they generated;
the published default; the build's copy.

**Two tables.** Read and written through vex entries, like every row of
moss's.

- `artifacts`: a row is one version of one artifact. `kind` (action, layout,
  fragment, entry), `id`, `principal` (absent: a default), `version`, `body`
  (the artifact as authored), `grammar` (the stamp it was written at), which
  version it was copied from (the room left for merging), and the save it
  belongs to.
- `artifact_saves`: a row is one save. Who saved and when. A save holds one or
  several versions, and is the unit of history, restore and reset.

A default is a row with no principal. A version is never changed or deleted.

**Layouts.** Every layout sits in the shell's layout store under the name of
what draws it: `action/<id>`, `canvas/<id>`, `frame`. An action's definition
names its layout by `{ ref }`. Changing a layout is then `setLayout`, and an
open screen follows with its data kept. A layout's body is `{ ref, layout,
style?, use? }`: `style` says which of the app's styles it belongs to, and
`use` marks the one of several that is in use. At a ref the order is: mine
marked in use; the default of the style I chose; the layout variant of my
roles; the plain default; the build's copy.

**The draft.** On the session: read and list what is in it, put one or several
artifacts (one numbered step), remove one, show the draft as it was at a step,
discard it, and save it (one save of everything in it). It lives in the shell
and passes the same check as a save.

**Entries.** Moss already hands vex its cache (`data/engine.ts`). The
artifactory becomes that cache's first answer: a shipped, published or saved
entry is answered by it, compiled from the entry as authored; anything else
goes to vex's own cache as today. Nothing is seeded at boot, and `Data.seed`
goes. A generated read keeps the fingerprint vex gave it (`fp_…`). Saving one
under a fingerprint a shipped or published entry has is refused, so a
generated read can never answer in place of a shipped one. A replay runs under
the policy of whoever calls it, whoever saved the entry.

**The check.** At a put into the draft, at a save, at a publish and when a
shell is built: the kind's schema (nova's, vex's), `auditAction`, the layout
against the kit (`layoutMisfits`), the chains that never end
(`endlessChains`), a read against the schema (`engine.compile`), the action's
endpoints against what it may call. A version that fails when a shell is built
is left out, and what is under it shows.

**Functions and the charter.** The manifest declares its functions by name
with a description each. The charter gains one part: which of them the
generated actions of a role may call. A generated action that names any other
fails the check.

**Publishing.** `nisc publish` sends the build's artifacts, or the ones it is
told, to an operator route, which checks them and writes them as defaults in
one save. The pointer moves, every process follows, and living shells adopt.
Taking a default back is publishing the version before it.

## 6. The decisions

**Approved (2026-10-12): D2, D4, D6, D8.**

- **D2. Two tables**, as in part 5.
- **D4. Every layout by ref.** Liveness is handed a definition with its layout
  in place. A change to an action's definition, not its layout, is seen by
  instances opened afterwards.
- **D6. What a generated action may call.** Any read its owner may replay, the
  functions on the charter's list, and no vex write.
- **D8. Somebody else's publish while my screen is open** is adopted in place:
  layouts at once, an action's definition on its next open.

**Explained, waiting for a yes: D1, D3, D5, D7, D9, D10.**

- **D1. Where it lives.** No new module. `manifest/running.ts` already is "what
  the app consists of right now", answered from what the build shipped. It
  becomes the artifactory by also looking at rows. `manifest` may not import
  `data`, so it is handed functions for its rows (the versions in force for a
  principal, the defaults, a save), which `data` implements as vex entries on
  the two tables, as it does for the generation pointer today. *What moves:*
  the answer depends on the person and on rows, so `artifactsFor` and
  `catalogFor` take a principal and are awaited. Five callers change; four
  already have the principal and already wait. *What it costs:* one read of a
  principal's versions when their shell is built. The answer is kept for that
  principal until they save or the pointer moves, so the catalog route and the
  integrations proxy do not ask the database on each call.
- **D3. Who a generated action exists for.** Today an action exists for a
  person because the charter grants its id to one of their roles. A generated
  action is in no charter, and the charter is not edited while the app runs.
  So: it exists for the principal who saved it, because they saved it, and for
  nobody else. That adds no reach, because what it can do stays the charter's:
  its reads replay as its owner, under their policy; it makes no vex write;
  the only code it calls is on the charter's list for their roles; its layout
  holds only components of the kit. Who may generate at all is the charter's
  too: it grants the shipped actions and functions that do it. If a role is
  taken from somebody, their generated action is still theirs, and what it
  calls is refused. A generated layout for a shipped action raises none of
  this: the action exists by the charter, and the layout is the owner's.
- **D5. Entries through vex's cache seam.** Today an app's entries are in the
  manifest, and at boot moss copies them into the table `vex_cache`; a replay
  then finds them there. So they are held twice, an entry that left the app
  stays in the table, and a read cannot be published without writing into
  vex's own table. Vex is built with a cache it asks for an entry by
  fingerprint, and moss already supplies that cache. The artifactory answers
  first: a shipped, published or saved entry by its fingerprint; everything
  else (a query a model wrote and nobody saved) is vex's own cache's, as
  today. Vex is not changed. *What goes:* the copy at boot. *What it costs:*
  the shipped entries are no longer rows of `vex_cache`, so anything that
  reads that table directly has to stop; the step that checks entries before
  a migration reads it for one thing and has to ask the artifactory.
- **D7. Publishing is an operator call.** A developer changes an action, a
  layout or a read in the app's source and wants it live without a deploy.
  `nisc publish` loads the manifest from source, as `nisc migrate` does, and
  sends it to a route under `/operator`, behind the operator key and the
  app's own gate. The route runs the same verification a boot runs and writes
  the artifacts as defaults, in one save. It is an operator's call and not a
  role's, because a default changes what every person's screens run: it is a
  deploy without a build. *What follows from "published wins":* after a new
  build is deployed, a default published before it still wins over the
  build's newer copy, so a deploy publishes again as one of its steps.
- **D9. Named sets and integrations' actions become artifacts.** Three things
  bring an action in while a server runs today: `server.replaceActions` (an
  app hands over a named set; atrium does), the integrations feature (the
  actions of approved bundles, kept in `integration_actions`), and
  `unverifiedShell`. With published and generated artifacts there would be a
  fourth and a fifth. D9 folds the first two into publishing: an approved
  bundle's actions are published artifacts whose source is that integration,
  its intake is the artifactory's check and the two rules that are an
  integration's own (its namespace, and what its endpoints may call), and
  `integration_actions` and `server.replaceActions` go. The integrations
  feature keeps the registry, the keys, the forwarder and the operator's
  routes, and its seam loses about ten of its 23 members. Last, because it
  changes something that works and that Midas runs on.
- **D10. History is append only.** No row of `artifacts` is ever changed or
  deleted, and the latest save says what is in force. I generate a layout for
  `door.join` (version 1), then change it (version 2). Going back to version 1
  is a new save that holds a copy of it as version 3. A reset is a new save
  that says none of mine is in force for that artifact: the default shows, and
  versions 1 to 3 are still there. Nothing a person does destroys anything.
  *What it costs:* rows only grow. How many versions of one artifact are kept
  is a number to set after measuring.

## 7. What is still open

- The six decisions above.
- How many versions of one artifact are kept, and how large a body may be.
  Measured before a number is proposed.
- What lyceum shows. To be said when the first step is built.

## 8. What other packages would owe

Each is a change to another library and needs its own approval.

- **charter:** one part, which functions the generated actions of a role may
  call.
- **strata:** one stored kind, for a vex entry.
- **cli:** `nisc publish`.
- **moss's manifest:** functions declared by name with a description. Today
  `functions(session)` is one map whose names are not known before a session.
- **nova:** nothing.
- **vex:** nothing. The cache seam and `engine.compile` are there.

## 9. Build order

Proposed. Each step is its own approval, and every lab app's checks pass after
each.

1. Entries through the cache seam, shipped only. No table yet. It removes the
   seeding and proves D5.
2. The two tables, published defaults, `nisc publish`, and adopt on publish.
3. Layouts by ref, styles, and which is in use.
4. Generated artifacts: save, history, restore, reset, and the check.
5. The draft in the shell, shown in lyceum.
6. The declared functions and the charter's part.
7. Integrations' actions and named sets as artifacts.
