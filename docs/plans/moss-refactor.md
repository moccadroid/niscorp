# Moss: the refactor that comes before the artifactory

**Status: Proposed (2026-10-09). Nothing is built and no step has a go. Two
decisions are open (Part 4). Branch `worktree-moss-refactor`.**

## 1. Why

The artifactory is to be the one owner of an app's artifacts: every load of an
action, a layout, a fragment or a vex entry asks it. Moss cannot take that yet,
because today nothing owns them. The manifest object `app` is handed whole to
every module and each one reads the fields it wants; one field of it is
reassigned in five places.

This plan fixes that structure and adds no feature. It was decided on
2026-10-07 to do it first and separately.

## 2. What was measured

Measured 2026-10-07, re-checked on `9e88009` (moss 0.4.0) on 2026-10-09. Since
the first measurement moss's source changed by 15 lines, in `grammar.ts` and
`shells.ts`.

- `createServer` is one function: [`server.ts`](../../packages/moss/src/server.ts)
  lines 252–1596. Of its 1,345 lines, 613 are integration routes (716–1328), and
  all 18 SQL statements in it are on the integration tables.
- `createShellHost` is one function of about 760 lines
  ([`shells.ts`](../../packages/moss/src/shells.ts), from line 313); its `build`
  is about 300.
- 16 exported functions take `app: NiscApp`, and the shell host's context
  carries `app` as well.
- `app.actions` is assigned in five places in `server.ts` (508, 834, 838, 1499,
  1511), each from a snapshot taken at boot. Atrium edits the same record in
  place and calls `server.refresh()`; the two would overwrite each other.
- The boot check (292–333) is written a second time in `refreshLocal`
  (1461–1473). Boot runs four checks, refresh two. The two it skips concern
  things a refresh cannot change today, so this is duplication, not a live bug.
- Registering an integration tests the bundle by assigning it into the live
  manifest and calling `refresh()` (832–842), then writes its rows with no
  transaction: one `DELETE`, then one `INSERT` per action (903–913).
  `PgPool.transaction` exists.
- The shell host is handed `resolve`, `catalogFor` and `variantsFor`, and still
  filters `app.actions` and swaps in a role's layout variant itself, once in
  build (608–614) and again in adopt (about 1020). It walks the manifest's
  canvas list in five loops to learn which canvases a shell has.
- Liveness reads a definition off the shell's runtime (`shells.ts`, `needOf`).
  Nova calls an action whose layout is a store id unreadable
  (`reflect/liveness.ts`, `opaqueLayout`) and cannot see bindings behind a
  `{ ref }`. Anything that later holds layouts by reference has to give
  liveness the definition with its layout in force.
- `entriesNow()` rebuilds a map of every entry on each call (1339, 1342). The
  contract route resolves a policy and then filters with a test that ignores it
  (730–736).
- The layout check, the endpoint-reach check and the chain check live inside
  `runIntake` in [`integrations.ts`](../../packages/moss/src/integrations.ts)
  (1,533 lines), so nothing else can use them. Moss's own table sequence is
  defined in that file too.
- The main entry exports 135 names (77 values, 58 types). 64 are imported by
  anything outside moss (lab apps 46, Midas 22, the two websites 19, other
  packages 10). 71 are imported by nobody. Of Midas's 22, five are internals:
  `auditClosure`, `resolveCatalogForRoles`, `wearableOf`, `integrationByKey`,
  `integrationOfAction`.

## 3. Where moss ends up

- **Single writer.** One module owns the running manifest. Everything else
  asks it.
- **Narrow interfaces.** A module receives the function, or the small typed
  object of functions, that it needs. Nothing receives `app`, and nothing
  receives an object that stands in for it.
- **A feature is a module.** Its own directory, with its schema, its
  repository (the SQL), its routes and its checks, and one function the host
  calls to mount it.
- **`createServer` is the composition root.** It constructs the modules, wires
  them and mounts their routes.

## 4. Decisions a human has to make

1. **Remove the 71 exports nobody imports?** It is a breaking change for code
   outside these repositories only. Decide it before step 4: with a yes, steps
   4 and 5 may reshape `createShellHost`, `runIntake` and `createDataLayer`;
   without it each keeps a wrapper with today's signature.
2. **Stop honouring edits made in place to `app.actions`?** Atrium does this.
   The recommendation is to keep it working throughout this plan and remove it
   with the artifactory, fixing atrium in the same commit.

Stopping the seeding of `vex_cache` is not decided here. It belongs to the
artifactory. The maintainer has said it may break (relay and lyceum build their
own engine over that table).

## 5. Build order

Each step is its own go and lands alone. Moss's tests (594 cases on
2026-10-07) pass unchanged after every commit that only moves code.

1. **One verification function.** A pure `verifyManifest(candidate)` in
   `manifest/verification.ts`: charter, closure, layout variants, entry reach,
   chain report. Boot and `refresh` call it. Integration registration calls it
   on a candidate built in memory and writes its rows in one transaction.
   Removes the second copy of the check and the assign-refresh-restore block.
   New behaviour to test: a refused re-import leaves the charter report and the
   generation pointer as they were; a failed write leaves the previous rows.
2. **A single writer for the running manifest.** `manifest/running-manifest.ts`
   holds the compiled artifacts and the integration actions, with one method
   that replaces the integration part and a change subscription. Removes the
   boot snapshot and four of the five assignments. The entry index is built
   once.
3. **Resolution as a module.** `resolution/resolution.ts` answers catalog,
   layout variants and policy for a set of roles, owns its memo and invalidates
   on a manifest change. Removes the four memo maps from `createServer` and
   their clearing in `refresh`. The exported resolver functions stay.
4. **The shell host on a narrow interface.** It receives
   `composeShell(principal)` and a small object of the app's code hooks, and no
   `app`. Build and adopt share that call. One helper reads the shell's own
   canvases. Liveness reads definitions from the composition. The host splits
   into lifecycle, build, transport and snapshot.
5. **Integrations as a module.** `integrations/` with `bundle-schema.ts`,
   `intake.ts`, `repository.ts`, `routes.ts`, `outbound-call.ts`,
   `contract.ts`, `press.ts`. The 613 lines of routes and the 18 SQL statements
   leave `createServer`. The layout and endpoint checks move beside
   `verifyManifest`. Moss's table sequence moves out.
6. **`createServer` as the composition root.** Authentication, the vex mounts
   with their write lanes, and the fabric and generation wiring each become a
   module.
7. **The public API.** The main entry exports what an app is meant to call.
   What happens to the 71 follows decision 1.

## 6. Rules for whoever builds this

- One step per branch state; never start the next inside the same change.
- A commit either moves code or changes behaviour, never both.
- No artifactory feature, table or type is added by this plan.
- A moss test written for this boots no database and no `createServer`.
- Count what a number counts before quoting it.

## 7. Done

- No function in moss takes `app: NiscApp` except `createServer`, `serve`,
  `defineApp`, `migrateTables` and the exported resolvers.
- `app.actions` has one writer inside moss.
- `createServer` holds no SQL and no route body.
- The check that boot runs is the check refresh and integration intake run.
- Lyceum's, relay's, lyra's, atrium's and encore's checks pass.

## 8. Not verified

- The four-way split of the shell host is drawn from its function outline. The
  state its inner functions share has not been traced; the cut lines may move.
- `socket.ts`, `tide.ts` and `document.ts` were not read in full.

## 9. What comes after

The artifactory is its own plan and is not designed in detail. What the
maintainer has decided about it so far:

- It is a sub-module of moss that every load goes through. It is asked; it is
  not handed around.
- An id resolves to what is shipped, published, made by a person, or held in a
  draft in the shell. Shipped artifacts go through the same path and need not
  be rows. Developers publish new defaults without deploying.
- Several layouts may exist for one action; which is in use is separate. A
  person's own change shows on their open screen at once.
- A made action calls only functions the charter allows, described in the
  manifest, and no vex write.
- The design has to stay simple. A requirement that contorts it is dropped.

Probes run on 2026-10-07 and 2026-10-08 that this rests on, all removed
afterwards: vex, unchanged, answers shipped and saved entries from a cache
backend that asks somebody else first; a nova shell reads its layouts through a
store that asks somebody else, and an open screen follows; every action of the
five moss lab apps (185) draws the same with its layout held by reference.
