# Moss: how it is built, and what is open

**Status: Built (2026-10-12) on branch `worktree-moss-refactor` (base `9e88009`,
moss 0.4.0), and on main since 2026-10-12, where CI passes. What is
open is in part 7. Midas and the two websites are other repositories and follow
at their next bump (part 9). Next is the artifactory (part 10), which is its
own plan and is not started.**

The audit that led here, the build order and the record of each step are in
this file's history: `git log -- docs/plans/moss-refactor.md`.

## 1. What moss answers

Moss answers five questions about a request. Each has one owner under
`packages/moss/src/`:

| Question | Module | It owns |
|---|---|---|
| Who is calling? | `identity` | a token is a principal, a principal is a record; the session cookie; the stored sessions |
| What exists for them? | `manifest` | the app as authored artifacts, parsed and frozen once; one verification; the running manifest, which answers what a shell is made of |
| What may they read and write? | `data` | the vex engine, the policy for a set of roles, `executeAs`, the routes, moss's own tables and their migrations |
| What are they looking at? | `shells` | the living nova shells: build, keep, stream, reset, adopt, snapshot |
| How does it reach them? | `socket`, `documents` | the live connection; the drawn page, and pages as files |

Under them are `runtime` (what a deployment supplies) and `protocol` (what both
ends of the wire agree on). `server` wires them and owns none of the five.
`node` is how moss runs on Node (the listener, the `ws` transport, the Vite dev
plugin): it imports the server and nothing imports it. The terminal side
(`client`, `terminal`) imports `protocol` and nothing else of moss.

A **feature** owns none of the five. It has a directory and an entry point of
its own, the core never imports it, and it reaches the core only through the
seams it is started with (`feature/index.ts`). There are two, `integrations`
and `tide`, and both are moss's own: the types `Feature` and `FeatureSeams` are
not exported.

Which module may import which is one table, in `scripts/check-modules.mts`.

## 2. The rules

They are in `packages/nisc/AGENTS.md`, "Changing a package": one door per
module, declared dependencies with no cycle, one owner per table and per piece
of state, narrow inputs (never the whole manifest or runtime), parse where it
enters, nothing at the top of `src/` but `index.ts`, and the sizes. A function
of 200 lines is fine and 300 is the ceiling; a file is at most 400 lines of
code; a line is at most 200 wide. A function or a file is split when it has
stopped being one thing, not to satisfy a number, and a file of a few lines
joins what uses it unless it is a published entry point.

The code speaks. A comment is there only where the reasoning, a decision or
the workings would be misread without it: a race a line closes, an order that
must not change, a property of a library that makes a line right. No file
headers, and no prose on the fields of a type: what an app author needs of an
exported type is in `DOCS.md`. How the code came to be is in the commit
message.

Something new names the question it answers and goes to that owner. If it
answers none, it is a feature on the seams, and a seam that is missing is
added to its owner first, as its own change. If it fits neither, the refactor
is proposed before the code.

## 3. The public API

`packages/moss/api.txt` lists every exported name, per entry point: 90 names
over 18 entries, 30 of them on the main entry. A new export is a line in that
file in the same change.

| Entry point | For |
|---|---|
| `@niscorp/moss` | what an app author writes: `defineApp`, `createServer`, `verifyApp`, `migrateTables`; sign-in (`mintSession`, `revokeAllFor`, `sessionCookies`, `mintDevToken`); pages (`renderDocument`, `exportDocuments`); their types |
| `/node`, `/vite` | the Node listener and transport; the dev plugin |
| `/integrations`, `/tide` | the two features, created by the app and named in `features` |
| `/protocol` | code that speaks the wire itself: a client written by hand, another transport |
| `/unverified` | the whole nova shell of a session |
| `/client`, `/client/node` | the wire client |
| `/terminal` and its targets | the canvas terminal: react, vue, dom, tty, ink, and their server renderers |

**The shell a session hands out** is nova's `Shell` with nine members that
throw: `registerAction`, `removeAction`, `registerFragment`, `addCanvas`,
`removeCanvas`, `setCanvasLayout`, `setLayout`, `setPhrases`, `dispose`. What
they add is not verified, is in nobody's catalog and is gone when the shell is
rebuilt. Code that does it anyway takes the whole shell from
`unverifiedShell(session)`, so the file says so in its imports. The type stays
`Shell` because nova's helpers take one (`sessionShellOf`, `shells/build.ts`).

What an app changes for this release is the last part of
`.changeset/moss-in-modules.md`.

## 4. The gates

All four run in `pnpm verify` and in CI.

| Run | It fails when |
|---|---|
| `pnpm check:modules` | a file other than `index.ts` is at the top of `src/`; a module imports a file inside another module; a module imports one the table does not give it; the table has a cycle; the core imports a feature |
| `pnpm check:api` | an entry point exports a name that is not in `api.txt`, or the reverse; an entry writes `export *` |
| `pnpm check:raw-sql` | a file outside the script's ledger holds a statement or a call on a database pool, or a file in it holds more or fewer than its line says |
| `pnpm lint` | a type assertion, an `any` that becomes a typed value, a type predicate, a non-null `!`, a `function` declaration, an inline directive, or a size over the limits, in moss's source or in tide's Postgres store and driver |

The lint reads types, and a type from another package of the repository is
read from its `dist`, so `pnpm build` runs first.

No gate holds one owner per table or narrow inputs: a reader does. No test
holds what two database connections do to each other: the suites run on PGlite,
which has one.

## 5. How three things work that are easy to get wrong

**A shell host counts changes** (`shells/host.ts`). The host counts how many
times what is in force has changed, and each shell records how many of those
it reflects. A build reads the count before it asks the app anything, so a
shell that lands having seen fewer changes than there have been adopts. Work
waits on the app's code, so two answers to a change may arrive in either
order: the one for a change the shell already reflects is dropped. Two
arrivals for one principal share one build, and the resets of one shell run in
turn. A build runs under `runtime.endpointTimeoutMs` (30 seconds unless set)
and fails when it has not landed by then, so whoever waits on one waits that
long at most, and app code that hangs inside a build holds up nobody else.

**What a shell is made of is one answer** (`manifest/running.ts`,
`artifactsFor`): the definitions a set of roles holds with their layout variant
in place, the shell's canvases, frame, layout store and fragments, the entries
by fingerprint, and the component names. A shell host asks it once for each
build and once for each adopt (`server/hosts.ts`). An adopt brings a living
shell level with that answer in place; it does not take the canvases again.

**Moss's own rows go through vex.** A feature authors its reads and writes as
entries and replays them through the `ownEntries` seam, on an engine no route
serves, under a policy that admits the tables that feature named and no other.
The generation pointer is two such entries (`data/own-entries.ts`). What is
left outside vex is the session credential (`identity/sessions.ts`), which is
looked up before anybody is signed in, the table definitions, and tide's own
store; `scripts/check-raw-sql.mts` lists each file with its reason.

## 6. Decisions

The owner's, taken between 2026-10-09 and 2026-10-12. They are what gets asked
again.

- **The public API breaks in this release**, and every app follows. The
  changeset carries the approval.
- **An app does not change its actions by editing the object it handed
  `createServer`.** The manifest is frozen at hand-over;
  `server.replaceActions` is the way.
- **Integrations and tide's hosting are features**, not core, each with an
  entry point of its own.
- **A feature is moss's own.** Nobody outside writes one, so its types are not
  exported.
- **Going around moss is allowed and is visible**: `@niscorp/moss/unverified`
  for the whole shell, and a route of the app's own on the Hono server for
  anything else.
- **Moss owns no product vocabulary.** A store listing, a placement, a
  setting, a document type and an assistant are the host app's, carried under a
  bundle's `extension` (part 8). Frames are gone: an app that wants a
  vendor's page in its UI mounts a route of its own.
- **Four gates, each short.** No script that tests a gate, and no Postgres
  service in CI.
- **Sizes**: 200 lines for a function is fine, 300 is the ceiling.
- **The code speaks.** A comment only where the code would be misread without
  it. Every other comment is text a reader has to take in and nothing checks.
  The prose on the fields of the exported types is in `DOCS.md` and not in the
  source.
- **A new moss test starts no database and does not call `createServer`.** The
  one suite kept on PGlite by decision is the registry's 18 cases
  (`test/integrations.test.ts`), because nothing else runs the registry's vex
  statements.
- **No other package's source is changed to solve moss's problem** without the
  owner's word. A document in another package that follows moss's new API is
  fine.
- **One review round at most.** A finding that asks for a new mechanism goes to
  the owner before any code.

## 7. Open

Nothing below is being worked on.

- **Two fixes are held by no automated test**, because PGlite has one
  connection: tide's serial claim (an advisory lock taken inside a
  transaction), and two first registrations of one integration at once. Both
  were run on PostgreSQL 18.4 on 2026-10-11 with scripts that are not in the
  repository.
- **`packages/cli/test/dev.test.ts` failed once** inside a full verify (a fetch
  was reset). It passes alone, and passed in the last full verify and the last
  uncached run of every package's tests. The cause is not found.
- **Two names in the public API, the owner's to settle before 0.5.0 is
  released.** `server.invalidateTenant(tag)` forgets every identity record
  that carries one cache tag (`IdentityRecord.tag`): the method names one use
  of it, a tenant, and the field names the mechanism. And
  `@niscorp/moss/unverified` with `unverifiedShell`, which hands over a
  session's whole nova shell.

The lab apps' checks pass except where the reason is outside moss: `model-check`
(lyceum) and two of relay's need a model key; `nisc-check` (atrium) fails to
spawn on Windows; relay's `console-terminal-check` needs a built file and its
`harness-check` fails on the base too; lyra's `scoping-check` and
`campaigns-check` depend on the date and the hour through its seed.

## 8. Integrations as it stands

`packages/moss/src/integrations/` is nine files behind
`@niscorp/moss/integrations`. It imports `runtime` and `feature` and nothing
else of moss.

- **A bundle** is `integration`, `grants`, `grammar`, `actions`, `phrasebook`
  and `extension`. Any other top-level key refuses it.
- **`createIntegrations`** takes `extension` (`{ schema, check?, prepare?,
  contract? }`), `integrationActor`, `signingSeed` and `outboundTimeoutMs`. It
  answers a feature with `listIntegrations()`, `callIntegration`,
  `integrationByKey` and `integrationOfAction`.
- **Intake** (`intake.ts`) holds a bundle to moss's checks (its actions'
  namespace, endpoints, layouts and chains of steps), reads `extension` with
  the app's schema and runs the app's `check`. A bundle lands whole, in one
  transaction, or not at all, and an approval is verified before it is written.
- **The way out** (`forward.ts`) is one forwarder with a timeout, used by a
  screen's call through the proxy, a vendor's webhook and the app's own call.
- **Its two tables** are read and written through vex entries (`entries.ts`,
  `registry.ts`). Migration `nisc.moss/4` adds `integrations.extension` and
  drops the columns that held one product's vocabulary.

It has three parts, and only the first was cut out here:

1. **One product's vocabulary** left moss for `extension`. What a host with a
   store takes over is listed in the changeset; the last commit that has it all
   is `41fc8942`.
2. **The artifact half** is what the artifactory takes: a bundle's actions and
   layouts are artifacts that arrive from somewhere else. Eleven of the 23
   seams exist for it (`actions`, `replaceActions`, `refusalOf`,
   `setActionsLoader`, `addCatalogFilter`, `grantedActionIds`, `components`,
   `layoutMisfits`, `endlessChains`, `fingerprints`, `fingerprintsFor`), and so
   do the rows of `integration_actions`.
3. **The network half** stays a feature: the registry, the two credentials, the
   forwarder, the operator's routes.

## 9. What the other repositories owe

None of them is edited from here.

- **Midas** follows the changeset's last part, "What an app changes". The
  largest piece is the vocabulary: its 13 bundles say `meta`, `capabilities`,
  `offers`, `needs`, `placements`, `settings`, `documents` and `assistants`
  under `extension`, and its substrate supplies `extension: { schema, check,
  prepare, contract }` in place of `menuSlots`, `placementNames`,
  `assistantTools` and `storePress`. None of its bundles declares `frames`,
  `attachments` or `configuration` (read on 2026-10-11).
- **nisc-website and moccadroid-website** follow the import table at the top of
  the changeset.

## 10. The artifactory

Its own plan: [artifactory.md](artifactory.md). It holds what is decided, what
was run, the last design proposed, and what moss still has to change for it.
Not started.

What this refactor did for it: while a server runs, one place answers what a
shell is made of (part 5); a living shell is brought level in place when that
changes; and a change in one process reaches the others. What it left, by
decision: the entries have two holders, the feature seam carries the half of
integrations that handles a bundle's actions, and `@niscorp/moss/unverified`
is a second way into a shell.

## 11. In numbers

Counted on 2026-10-12 by one script over `git show` at each commit. A line is
blank, a comment, or code. The base's moss held tide's Postgres store and
driver (about 470 lines of code), which are in the tide package now.

| | Base `9e88009` | Now |
|---|---|---|
| `packages/moss/src` files | 43, of them 28 at the top of `src/` | 89 in 15 directories, `index.ts` at the top |
| lines of code | 5,829 | 7,432 |
| comment lines | 4,056 | 373 |
| longest function as written | 1,345 lines (`createServer`) | 95 lines (`createRunningManifest`) |
| largest file, lines of code | 862 (`server.ts`) | 284 (`integrations/operator.ts`) |
| type assertions | about 110 | 0 |
| files that import zod | 1 | 15 |
| names on the main entry; on all entries | 135; 185 over 14 | 30; 90 over 18 |
| statements the SQL gate counts with no reason | 28 | 0 |
| moss tests (vitest's count) | 616 in 43 files | 1,086 in 75 files |
| lines of moss tests | 9,159 | 16,577 |
