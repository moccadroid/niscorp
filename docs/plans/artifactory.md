# The artifactory

**Status: Proposed (2026-10-12). What it has to do is decided: part 2 is the
owner's, from five rounds on 2026-10-07 and 2026-10-08. How it is built is not
decided: part 5 is the last design proposed, which was not rejected and is not
approved. Part 6 is the decisions to take, part 7 the questions that are open.
Nothing is built. Moss was rebuilt first so that this has one place to go
([moss-refactor.md](moss-refactor.md)).**

## 1. What it is

An app is made of artifacts: actions, layouts, fragments, vex entries. Today
they are what the build shipped, and changing one is a deploy. The artifactory
is the part of moss every load of an artifact goes through. It decides what an
id resolves to for the person asking: what the build shipped, what the
developers published since, what that person made, or what they are drafting
right now. It keeps every saved version, so there is a history and a way back.

It is a mechanism of moss, not a library. An agent, an editor and a builder
screen are callers of it and no part of it.

## 2. What is decided

The owner's. Not to be asked again.

**What it holds**

- Every nova artifact can be made and saved: actions, an action's layout, the
  shell's layout (the frame), a canvas's layout, fragments. And vex reads.
- An action and an entry carry their prisms with them.
- The kinds stay open. Colour themes, wording and site content are different,
  and would be part of it if they are built.
- A shipped artifact goes through the same way in as every other, and does not
  have to be a row.

**Where an id resolves**

- Every load goes through it: an action, a layout, a fragment, a vex entry. It
  is asked; it is not handed around.
- It decides what a shell's layout store holds, and which actions an assistant
  is handed. It is where the charter is applied.
- Developers publish new defaults without deploying. A published default wins.
  The build's own copy is what is left when nothing is published, or when the
  published one fails its check.
- Developers shipping a new look to everyone (the same kit, most layouts, a few
  actions) is this same system, not a second one.

**Layouts**

- Several layouts may exist for one thing. Making three of my own while the app
  ships one loses none of them: which one is in use is separate from the
  layouts.
- The app may ship several styles, and a person chooses one.
- My own change shows on my open screen at once. What somebody else publishes
  while my screen is open is a different case (part 6, D8).

**The draft**

- While something is being made it lives in a draft, in the shell: a temporary
  manifest.
- Several things that depend on each other are saved together, by hand. That
  save is one step of the history.
- The steps taken while refining are the draft's own history and nobody
  else's.
- The draft is gone when the shell is lost.

**Saving, history, reset**

- Everything saved is kept as a version. There is a history.
- Reset is back to the default, and the default is whatever is published now.
  If the developers ship an upgrade, that is the default.
- An artifact is replaced whole for now. Room is left for updating or merging
  one later.

**What a made action may do**

- It calls only shipped functions, and only those on a list the charter
  approves. Each function on the list has a description, and the list is what
  an agent or an editor is handed.
- It makes no vex write. A write is wrapped in a function.
- A shipped action is reviewed and is not held to the list.
- The charter is not edited through the artifactory.

**Vex entries**

- The artifactory holds the whole entry and is asked before vex's cache.
- There is one path for all entries. A saved entry is not a second form beside
  a seeded one.

**The check**

- One check for an artifact, made of the checks prism, nova and vex already
  have.

**Words**

- Use the words that exist: artifact, kind, version, save, draft, default,
  publish, principal, tag, ref (of the layout store), layout variant, style,
  entry, fingerprint, manifest. "Made" for what a person made. "Steps" only
  for the draft's own history.
- Not to be used: slot, look, picks, an owner called "shipped", "step" as a
  column, one blob called "documents", "from".

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
  (`manifest/roles.ts`). What one person made needs the principal, and rows
  need to be awaited: the signature, the key the answer is kept under and its
  one caller (`server/hosts.ts`) move.
  `ShellHostConfig.composition(principal)` is already by principal and
  awaited.
- **`catalogFor(roles, installed)` is the same**, with four callers outside
  `manifest`: `server.catalogOf` and the socket's catalog
  (`server/server.ts`), the catalog route (`server/routes.ts`), and the seam
  `grantedActionIds` (`server/features.ts`), which the integrations proxy asks
  on every call it forwards.
- **An adopt does not take the canvases again** (`takeLayouts`,
  `shells/host.ts`). It applies the frame, each ref of the layout store and
  each fragment that is answered differently. A change to which canvases a
  shell has reaches a living shell by a reset.
- **A shell's liveness reads the entries of its composition** (`shellNeedOf`,
  `shells/snapshot.ts`), so an entry that is only in the cache is reported as
  not readable.
- **`@niscorp/moss/unverified` is the second way in.** Relay, atrium and
  lyceum change a shell through it, unverified. The draft takes these over.
- **Named sets of actions** (`server.replaceActions`, a feature's own set and
  its loader) are how an action arrives while a server runs today.
- **The integrations feature's actions**: a bundle's actions and layouts are
  artifacts that arrive from somewhere else. Eleven of its 23 seams and the
  rows of `integration_actions` exist for that.
- **The module rule.** `manifest` may not import `data`. Rows it needs are read
  and written by entries that `data` replays for it and hands over as
  functions, as the generation pointer's are.

## 5. The design last proposed

**Not approved.** It is the fifth round's, set against the code as it is now.
Where it differs from what was said then, it says so.

**Where an id resolves.** For a principal, in this order, the first that
exists and passes the check: the draft in their shell; what they made; what is
made for a tag they carry; the published default; the build's copy.

**Two tables.** Read and written through vex entries, like every row of
moss's.

- `artifacts`: a row is one version of one artifact. `kind` (action, layout,
  fragment, entry), `id`, `principal` (absent: a default), `tag` (absent: not
  for a group), `version`, `body` (the artifact as authored), `grammar` (the
  stamp it was written at), which version it was copied from (the room left
  for merging), and the save it belongs to. The fifth round also had a kind
  `canvas`; whether there is one is Q5.
- `artifact_saves`: a row is one save. Who saved, when, and for whom. A save
  holds one or several versions, and is the unit of history, restore and
  reset.

A default is a row with no principal. A version is never changed or deleted:
a restore is a new save with old bodies.

**Layouts.** Every layout sits in the shell's layout store under the name of
what draws it: `action/<id>`, `canvas/<id>`, `frame`. An action's definition
names its layout by `{ ref }`. Changing a layout is then `setLayout`, and an
open screen follows with its data kept. A layout's body is `{ ref, layout,
style?, use? }`: `style` says which of the app's styles it belongs to, and
`use` marks the one of several that is in use. At a ref the order is: mine
marked in use; my tag's marked in use; the default of the style I chose; the
layout variant of my roles; the plain default; the build's copy.

**The draft.** On the session: read and list what is in it, put one or several
artifacts (one numbered step), remove one, show the draft as it was at a step,
discard it, and save it (one save of everything in it). It lives in the shell
and passes the same check as a save.

**Entries.** Moss already hands vex its cache (`data/engine.ts`). The
artifactory becomes that cache's first answer: a shipped, published or made
entry is answered by it, compiled from the entry as authored; anything else
goes to vex's own cache as today. Nothing is seeded at boot, and `Data.seed`
goes.

**The check.** At a put into the draft, at a save, at a publish and when a
shell is built: the kind's schema (nova's, vex's), `auditAction`, the layout
against the kit (`layoutMisfits`), the chains that never end
(`endlessChains`), a read against the schema (`engine.compile`), the action's
endpoints against what it may call. A version that fails when a shell is built
is left out, and what is under it shows.

**Functions and the charter.** The manifest declares its functions by name
with a description each. The charter gains one part: which of them the made
actions of a role may call. A made action that names any other fails the
check.

**Publishing.** `nisc publish` sends the build's artifacts to an operator
route, which checks them and writes them as defaults in one save. The pointer
moves, every process follows, and living shells adopt.

## 6. Decisions to take

Each with what I would do and what it costs.

- **D1. Where it lives.** Inside `manifest`: the running manifest becomes it.
  Its rows go through entries `data` replays for it. *Cost:* `artifactsFor`
  and `catalogFor` become awaited and take a principal, so their five callers
  change.
- **D2. Two tables, as in part 5.** A row of `artifacts` is one version; a row
  of `artifact_saves` is one save. *Alternative:* a table for each kind, which
  is four tables that differ in nothing but a name.
- **D3. Who holds a made action.** The principal who saved it holds it, and so
  does whoever carries the tag it was saved for. The charter is not edited, so
  holding a made action does not come from a grant. What it may do does: its
  reads replay under the holder's policy and its functions are on the
  charter's list. **This is the security model**, so it wants an explicit yes.
- **D4. Every layout by ref.** It is what makes "my change shows at once" one
  call and no new mechanism. *Cost:* liveness has to be handed a definition
  with its layout in place, or pages are misjudged. And a change to an
  action's definition, not its layout, is seen by instances opened afterwards.
  I would accept that for now. The alternative is a change in nova.
- **D5. Entries through vex's cache seam.** Vex stays as it is and the two
  holders become one. *Cost:* `vex_cache` no longer holds the shipped entries,
  so anything that reads that table directly has to stop.
- **D6. What a made action may call.** Any read its holder may replay, the
  functions on the charter's list, and no vex write. See Q2 for the case that
  rule does not settle.
- **D7. Publishing is an operator call**, from the app's source, as one save.
  Not a role's.
- **D8. Somebody else's publish while my screen is open.** Adopt in place:
  layouts follow at once, an action's definition on its next open. It is what
  moss does for every other change since the refactor. *Alternative:* nothing
  until the shell is next built.
- **D9. Named sets and integrations' actions become artifacts**, and
  `integration_actions` and `server.replaceActions` go. I would do this last,
  after the core is proven on shipped, published and made.
- **D10. History is append only.** A restore is a new save with old bodies. A
  reset is a save that puts none of mine in force. Nothing is deleted.

## 7. Open questions

Things I cannot settle from what was said.

- **Q1. Which app is the first real use?** Relay's builder, Midas's dock and
  themes, or lyra's theme layouts. It decides what "done" means for the first
  version.
- **Q2. A copy of a shipped action that calls a vex write.** 69 of 185 shipped
  actions do. Is a made copy refused, or may it keep a write the shipped
  action already had, since that write was shipped and reviewed?
- **Q3. What a tag is.** One name from the identity record (a tenant, a
  business), or an ordered list (a person, then a team, then a tenant)?
- **Q4. Who may save for a tag.** Any holder of a role through a shipped
  function, or an operator only?
- **Q5. Is the set of canvases a kind?** A canvas's layout is. Can a made or
  published artifact add a canvas, or only change how one is laid out?
- **Q6. Made reads.** May one be saved for a tag and replayed by others? And
  how is its fingerprint named so that it can never stand in for a shipped
  one?
- **Q7. Reset.** One artifact, everything I made, or both?
- **Q8. Nobody signed in.** A draft and no save?
- **Q9. Themes, wording, site content.** Out of the first version, with the
  kinds left open?
- **Q10. `@niscorp/moss/unverified`.** Does it go in the release the draft
  arrives in, with relay, atrium and lyceum moved onto the draft?
- **Q11. An assistant.** Which principal is it handed actions for, and is it
  handed that principal's made actions and the function list?
- **Q12. `nisc publish`.** Everything in the build, or a named part? And is
  there a way to take a published default back?
- **Q13. Limits.** How many versions of one artifact are kept, and how large a
  body may be. I would measure before proposing numbers.

## 8. What other packages would owe

Each is a change to another library and needs its own approval.

- **charter:** one part, which functions the made actions of a role may call.
- **strata:** one stored kind, for a vex entry.
- **cli:** `nisc publish`.
- **moss's manifest:** functions declared by name with a description. Today
  `functions(session)` is one map whose names are not known before a session.
- **nova:** nothing, if D4's cost is accepted. Otherwise: an action's open
  instances are opened again when it is replaced.
- **vex:** nothing. The cache seam and `engine.compile` are there.

## 9. Build order

Proposed, for after the decisions. Each step is its own approval, and moss
works after each.

1. Entries through the cache seam, shipped only. No table yet. It removes the
   seeding and proves D5.
2. The two tables, published defaults, `nisc publish`, and adopt on publish.
3. Layouts by ref, styles, and which is in use.
4. Made artifacts: save, history, restore, reset, and the check.
5. The draft in the shell. Relay, atrium and lyceum move onto it, and
   `/unverified` goes.
6. The declared functions and the charter's part.
7. Integrations' actions and named sets as artifacts.
