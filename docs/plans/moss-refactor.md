# Moss: the audit, and the refactor that follows from it

**Status: Audit done (2026-10-09), refactor proposed. Built: the first gate,
`check:raw-sql`, in `pnpm verify` and CI. No phase of the refactor has a go.
Decided: the public API may break and is to be refactored; an app editing the
manifest it handed over is not kept working. Open: Part 8. Branch
`worktree-moss-refactor`, base `9e88009` (moss 0.4.0).**

This replaces the first version of this file, which planned a tidy-up. The
audit found that the problem is larger than structure.

## 1. How this was done

Every file under `packages/moss/src` was read to the end: 43 files, 10,554
lines. `server.ts` by the author of this plan; the other 42 by four read-only
audits, each given the same rubric and told to report facts with line numbers.
The higher-impact findings in each report were then opened and checked; every
one checked held. Counts come from one script over the whole tree. Nothing was
run: this worktree has no install yet.

Not done: no test was run, no defect below was reproduced, and whether moss's
SQL fits vex's grammars was read, not tried (Part 7, phase 7).

## 2. Why no check caught any of it

- **The rule against SQL outside vex is enforced for one app.**
  `apps/lab/lyra/src/dev/reads-are-vex-check.ts` and `identity-sql-check.ts`
  sweep lyra's `src/server` and `src/app` and hold lyra to exactly one raw
  statement. Nothing sweeps a package.
- **CI runs no lint and no app check.** `pnpm verify` and `verify.yml` run
  build, `check:packages`, `check:create`, `check:grammars`, `check:sources`,
  `check:fact-door`, typecheck and test.
- **The lint exists and nothing runs it.** `eslint.config.mjs` covers
  `packages/moss/src`, and for packages it holds four rules: no module-level
  `let`, no enum, no class, no default export. Type assertions are left out on
  purpose, with a note that they "come out by hand first".
- **One package has one architecture gate.** `check:fact-door` holds tide to a
  single writer of facts. Moss has none.

So for a package the rules in `AGENTS.md`, `STYLE_GUIDE.md` and its own
`DESIGN.md` are prose. No build fails when they are broken.

## 3. What moss is today

| | |
|---|---|
| Source files | 43, of which 28 sit flat in `src/` and hold 8,710 of the 10,554 lines |
| Directories | two: `client/`, `terminal/` |
| Code and comment lines | 5,868 and 4,017 |
| Names exported from the main entry | 135; imported by anything outside moss: 64; by nobody: 71 |
| Functions over 120 lines | ten (below) |
| Type assertions (`as`, not `as const`) | about 110; the style guide allows none |
| Files that import zod | one, `integrations.ts`; two schema parses in the package |
| SQL statements outside vex | 40 that read or write rows (server 18, integrations 6, sessions 6, tide 6, generation 4), beside the DDL |
| Tests | 43 files, 9,159 lines, 546 cases; 12 files start a database |

The ten functions: `createServer` 1,345 lines; `createShellHost` 756 (its
`build` 289); `runIntake` 303; `createSocket` 289 (its `open` 205);
`createWire` 280; `ttyTarget` 222; `inkTarget` 164; `createTideStore` 156;
`createIdentityCache` 144; `mossDev` 121.

What sits in the three largest files:

- **`server.ts`**: one function. Boot and its checks; `executeAs`; identity and
  scope composition; four memo tables; the authentication middleware; the vex
  routes with the fact lane and the reactions; twelve integration and operator
  routes with their SQL inline; frame grants; the webhook limiter; the proxy;
  shells; pages; the fabric; `refresh`; the generation pointer; the socket.
- **`integrations.ts`**: ten jobs in seven unrelated groups: the bundle schema,
  the reach rules, intake, a sentence renderer, an image copier, the outbound
  call, the table definitions for all of moss (the generation table included),
  the row readers, the install filter, and a markdown renderer.
- **`shells.ts`**: one function that builds shells, streams frames, encodes
  deltas, answers snapshots, sweeps idle shells, adopts new definitions,
  revokes sessions, and words integration errors for a "studio".

## 4. How it fails

### 4.1 Rules moss sets and does not keep

1. **"Reads are vex, writes are vex."** 40 statements go straight to the pool.
   Two kinds have a reason: the credential lookups (a session token hash, an
   integration key hash), which run before a principal exists, and tide's own
   store. The 24 on the integration tables and the 4 on the generation counter
   have none; `executeAs` was built for exactly those surfaces.
2. **"Everything that crosses a boundary is parsed by a schema."** One boundary
   is: the integration bundle. These are not:
   - the manifest (`defineApp` returns its argument);
   - every socket message, on the server (`socket.ts:241`) and in the client
     (`client/index.ts:327`);
   - the bodies of the operator and frame routes (`server.ts:783`, `985`,
     `1051`);
   - database rows, used through casts (`integrations.ts:1315–1366`,
     `server.ts:829–1276`), one of them served as an action definition
     (`integrations.ts:1361`);
   - a message from another process (`fabric.ts:82`), the assertion payload
     (`assert.ts:107`), the app's identity record (`identity.ts:228`).
3. **The style guide.** About 110 type assertions; one `function` declaration
   (`server.ts:470`); tide's DDL is split on every `;` (`tide.ts:328`), which
   rule 17 forbids.
4. **Its own design document.** `DESIGN.md` says moss "never mints" a session
   (`mintSession` and `mintDevToken` are exported), has "no head management"
   (`document.ts:153`, `terminal/head.ts`), "no middleware"
   (`runtime.operatorGate`), and "adds no vocabulary of its own"
   (`integrations.ts` defines three). `app.ts` opens with "every field is an
   artifact, never machinery"; 13 of its 29 fields carry functions.

### 4.2 Structure

5. **Nothing owns the manifest.** `app` is handed whole to `createServer`, the
   shell host, every resolver, intake, the contract builder, the grammar
   upgrader and `migrateTables`. `app.actions` is reassigned in five places.
6. **App code is handed the keys.** `FunctionSession.runtime` (`app.ts:436`) is
   the whole runtime: the pool, the operator key, the signing seed.
7. **A feature is a file plus edits elsewhere.** Integrations is
   `integrations.ts`, 613 lines inside `createServer`, an error floor inside
   the shell host, a filter the resolvers import, and the table sequence
   `migrate.ts` imports.
8. **The client imports the server.** `client/index.ts` takes constants and
   codecs from `socket.ts`, `delta.ts` and `session-cookie.ts`. The message
   types are declared on both sides and agree only by hand.
9. **Internals are the API.** About 85 of the 135 exports are internals.
   `createShellHost`, `createSocket`, `createDataLayer`, `runIntake`,
   `createGeneration` and `createIdentityCache` are all public.
10. **The same thing is written several times.** The boot check, twice. The
    integration lookup by id, seven times. "Granted definitions with the
    role's layout", twice. The canvas walk, six times. The wire slots, once
    for React and once for Vue. The frame tree, three times. Every resolver in
    two forms, of which moss calls one.
11. **The shell host's interface lies.** It requires `catalogFor` and
    `variantsFor` and reads neither; it writes `roles`, `installed` and `hash`
    on each cell and reads none.

### 4.3 Defects found on the way

Read, not reproduced. Each needs a failing test before it is fixed.

| | Where | What |
|---|---|---|
| 1 | `server.ts:940–956` | Approval is written before it is verified, then undone on failure. A crash in between leaves rows that make the next boot refuse. |
| 2 | `server.ts:844–913` | Registration writes with no transaction: an upsert, a `DELETE`, one `INSERT` per action. |
| 3 | `shells.ts:932–942` | Two first arrivals for one person build two shells; one is overwritten and never disposed. |
| 4 | `shells.ts:784–798` | Overlapping resets leave terminals on a shell that is not the kept one; a page shell loses its path parameters. |
| 5 | `shells.ts:1008–1024` | `adopt` only registers. An action that was removed or revoked stays in every living shell. One throw skips everybody after it. |
| 6 | `socket.ts:424–454` | Detach is registered after two awaits. A socket that closes during them stays attached, so its shell never idles. |
| 7 | `socket.ts:464–529` | The message handler has no error boundary. |
| 8 | `socket.ts:316` | `String(error)` is sent to the terminal. |
| 9 | `socket.ts:451` | Every anonymous connection builds a shell; nothing limits them. |
| 10 | `server.ts:1034`, `1211` | Frame grants and the webhook limit live in one process's memory. With two processes a grant minted by one is unknown to the other. |
| 11 | `assert.ts:83` | A signing seed under 32 bytes silently becomes a random key, so two processes sign with different keys. |
| 12 | `server.ts:995–1313`, `integrations.ts:995`, `1103` | No outbound call has a timeout; the press copy has no size limit. |
| 13 | `runtime.ts:183`, `sessions.ts:121` | `devSession` trusts any token with a `sub`, is exported, and passed as a function skips the boot warning. |
| 14 | `identity.ts:232–236` | An invalidation during a resolve is undone when the resolve lands. |
| 15 | `generation.ts:74–80`, `93–97` | A failed reload is logged as "could not read" and never retried; a bump can adopt another process's move without reloading. |
| 16 | `tide.ts:470–472` | Two instances can both claim one serial group. |
| 17 | `driver.ts:116` | A delay over 2^31 ms becomes 1 ms: a loop. |
| 18 | `client/index.ts:507–512` | `reset()` while connecting leaves two sockets writing one snapshot. |
| 19 | `client/index.ts:459`, `terminal/index.ts:24` | After a reconnect the old screen stays up with no sign; React, Vue and DOM targets are never told the status. |
| 20 | `integrations.ts:299`, `1147` | An integration id has no character rule; `key_hash` has no unique constraint. |
| 21 | `vite.ts:136–155` | The dev server signs anybody in as anybody, with no loopback check. |

## 5. The architecture

### 5.1 The idea every module shares

Moss answers five questions about one request, in this order, and each
question has one owner:

1. **Who is calling?** `identity`
2. **What exists for them?** `manifest` (the artifactory grows here)
3. **What may they read and write?** `data`
4. **What are they looking at?** `shells`
5. **How does it reach them?** `socket` for the live wire, `documents` for a
   screen drawn into a page

Under them sit `runtime`, which is what a deployment supplies, and `protocol`,
which is what both ends of the wire agree on. Over them sits `server`, which
only wires them together.

A **feature** owns none of the five. It plugs into them through seams they
offer and ships from its own entry point. Integrations and tide's hosting are
features.

### 5.2 What a module is

A directory under `src/` with an `index.ts`. The rules:

1. **One door.** Code outside a module imports `../<module>` and nothing
   deeper.
2. **Declared dependencies.** What a module may import is written in one
   table, and the table has no cycle.
3. **One owner.** Each table and each long-lived piece of state belongs to one
   module. Nobody else writes it.
4. **Narrow inputs.** A factory takes a typed object of the functions and
   values it needs. Never `NiscApp`, never `NiscRuntime`.
5. **Parse where it enters.** A body, a socket message, a row, a fetched
   payload, a message from another process or a token is parsed by a schema in
   the module where it enters.
6. **Nothing flat.** Only `index.ts` sits at the top of `src/`.
7. **Limits.** A function is at most 100 lines; a file at most 400 lines of
   code. Today ten functions and three files are over.

### 5.3 The modules

Nine in the core, in dependency order (each may import those above it):

| Module | Its question | Comes from |
|---|---|---|
| `runtime` | what the deployment supplies: the runtime type, the telemetry sink | `runtime.ts`, `telemetry.ts` |
| `protocol` | what both ends agree on: message schemas, version numbers, close codes, the token offer, the delta codec | types and constants in `socket.ts`, `delta.ts`, the copy in `client/index.ts` |
| `identity` | who is calling: session verification, the credential store, the cookie and its seal, the identity cache | `sessions.ts`, `session-cookie.ts`, `identity.ts`, the dev verifier, `server.ts` 403–478 |
| `manifest` | what exists for them: the manifest's schema, the running manifest (single writer), verification, the catalog and layout variants a set of roles holds, the generation pointer | `app.ts`, `closure.ts`, `generation.ts`, the catalog half of `principal.ts`, `server.ts` 292–333 and 1445–1514 |
| `data` | what they may read and write: the engine, the policy for a set of roles, the routes, `executeAs`, the write lanes, moss's tables and their migration | `data.ts`, `follow.ts`, `migrate.ts`, `grammar.ts`, the policy half of `principal.ts`, `server.ts` 376–401 and 633–714 |
| `shells` | what they are looking at: a shell's lifecycle, its build, its snapshot, liveness | `shells.ts` without its streaming, `liveness.ts` |
| `socket` | how it reaches them live: the handshake, message routing, frame streaming | `createSocket` in `socket.ts`, the streaming in `shells.ts` |
| `documents` | how it reaches them as a page: drawn documents, pages, export | `document.ts`, `pages.ts` |
| `server` | wiring: `createServer`, authentication, the fabric, the Node transport, the dev plugin | the rest of `server.ts`, `fabric.ts`, `node.ts`, `vite.ts` |

Two features, each with its own entry point:

| Feature | What it is | Comes from | Goes to |
|---|---|---|---|
| `integrations` | services that add screens: the bundle schema, intake, the registry, its routes, the forwarder, assertion signing | `integrations.ts`, `assert.ts`, `server.ts` 716–1328, `shells.ts` 119–152, nine fields of the manifest | `@niscorp/moss/integrations` |
| tide's hosting | a Postgres store and a driver for tide | `tide.ts`, `driver.ts` | tide's own Postgres entry; moss keeps the write lane |

And the terminal side, which imports `protocol` and nothing else of moss:
`client`, `terminal`.

Without the two features the core is about 7,550 of today's 10,554 lines, and
tide stops being a peer every app must install.

### 5.4 The seams a feature uses

A feature never reaches into a module. It uses these, and if one is missing,
adding it to its owner is the first change, on its own:

- `manifest`: hand over a set of actions and take one back.
- `data`: declare tables, declare entries of its own, hear a write.
- `server`: mount routes behind the authentication every route gets.
- `shells`: wrap the wire a shell calls through.

### 5.5 How something new gets in

1. Name the question it answers. It goes in that module.
2. If it answers none, it is a feature: its own directory and entry point, on
   the seams.
3. If the seam it needs is missing, that seam is the first change.
4. If it fits nowhere, the architecture is wrong. Say so and propose the
   refactor before writing the feature.

### 5.6 The review behind the map

Quality is the code as it stands; fit is whether it belongs in a lean core.
Both out of five.

| Unit today | Lines | Quality | Fit | Verdict |
|---|---|---|---|---|
| App contract (`app.ts`) | 524, of which 127 code | 2 | 5 | Change: a schema, frozen on hand-over. Nine of its 29 fields exist to host integrations and leave with them; one is dead. |
| Boot check (in `server.ts`, `closure.ts`, `principal.ts`) | about 150 | 3 | 5 | Merge into `manifest`. Sound, written twice, and it picks nova's findings by their wording. |
| Charter resolution (`principal.ts` and the memo tables) | about 270 | 3 | 5 | Split: catalog and variants into `manifest`, policy into `data`. Small pure functions, each written twice, all taking `app`. |
| Identity (`sessions.ts`, `session-cookie.ts`, `identity.ts`) | about 600 | 3 | 5 | Keep, as one module. Small files, recently hardened; one race; an unsigned dev verifier in the public API. |
| Data (`data.ts`, the vex routes, `executeAs`, `follow.ts`) | about 350 | 3 | 5 | Keep. Thin and right, and buried inside `createServer`. |
| Tables and migration (`migrate.ts`, `grammar.ts`) | 195 | 4 | 5 | Merge into `data`. No assertion, tested. |
| Shell host (`shells.ts`, `liveness.ts`) | 1,141 | 2 | 5 | Keep; it is the heart. Split it, fix three races, and move frame streaming to `socket`. |
| Socket (`socket.ts`) | 539 | 2 | 5 | Keep. Messages are unparsed, the handler has no error boundary, a closed socket can stay attached. |
| Delta codec (`delta.ts`) | 110 | 4 | 5 | Becomes `protocol`, with the message schemas. |
| Documents and pages (`document.ts`, `pages.ts`) | 303 | 4 | 4 | Keep, as one module. |
| Generation and fabric (`generation.ts`, `fabric.ts`) | 225 | 3 | 4 | Dissolve: the generation pointer into `manifest`, the fabric into `server`. |
| Runtime and telemetry (`runtime.ts`, `telemetry.ts`) | 274 | 4 | 5 | Merge into `runtime`; the dev verifier goes to `identity`. |
| Server (`createServer`, `node.ts`, `vite.ts`) | 1,740 | 1 | 5 | Keep as the composition root and nothing else. One 1,345-line function today. |
| Integrations (`integrations.ts`, `assert.ts`, 613 lines of `server.ts`) | about 2,270 | 1 | 2 | Move out of the core. The largest unit and the least structured: all the SQL with no reason, 28 assertions, ten jobs in one file, and a store listing and an editor vocabulary that belong to one app. |
| Tide's hosting (`tide.ts`, `driver.ts`) | 728 | 3 | 1 | Move to tide. It works and is tested, and it is tide's storage. |
| Wire client (`client/`) | 571 | 2 | 5 | Keep, on `protocol`. A 280-line function, unparsed messages, reconnect defects. |
| Terminal and its five targets (`terminal/`) | 1,258 | 3 | 4 | Keep. Small files; slots, frames and snapshot adapters written two and three times; the ink target has no test. |

## 6. Gates

All of these are in `pnpm verify` and CI, or join them. A rule that is only
written down is the failure this audit found.

- **`check:raw-sql` — built (2026-10-09).** `scripts/check-raw-sql.mts`, ported
  from lyra's `reads-are-vex-check`. It sweeps every package but vex and
  strata. Each file that holds a door to the pool or a statement is in the
  script's ledger with its exact numbers and its reason: credential, store or
  debt. A file outside the ledger fails; a number that is off fails in either
  direction. Today: 28 statements with no reason, 6 in tide's store, 6
  credential. Run: green on this tree; red with a statement added to an
  unlisted file, to a listed file, and with a stale number.
- **`pnpm lint`**, which runs nowhere today. For each module, from the commit
  that creates it: no type assertion but `as const`, no non-null assertion, no
  `function` declaration, the two size limits, no import of another module's
  inner file, and for `client/` and `terminal/` no import of moss but
  `protocol`.
- **`check:modules`**. The dependency table has no cycle and matches the
  imports. Nothing sits flat in `src/` except the files not yet moved, which
  the script lists; the list may only get shorter.
- **`check:api`**. Each package's exported names, per entry point, are a
  committed file. An export that is not in the file fails.
- **`AGENTS.md`** gets a part for changing a package: 5.2 and 5.5.

The numbers the counting gates start from are today's. They may go down, never
up.

## 7. Build order

Each phase is its own go and lands alone. A commit moves code or changes
behaviour, never both. Every defect in 4.3 gets a failing test first.

0. **The gates.** `check:raw-sql` is built; `lint` joins `verify`;
   `check:modules` and `check:api` are written.
1. **Cut the public API**: the 71 names nobody imports.
2. **`protocol`**: one set of message schemas, parsed on both sides; the client
   stops importing the server. Fixes 7, 8.
3. **`manifest`**: the manifest is parsed and frozen when it is handed over, so
   an edit to it throws; one verification for boot, refresh and intake; a
   single writer; the catalog and variants in one form. Atrium moves to the
   seam that hands over a set of actions.
4. **`identity`**. Fixes 13, 14.
5. **`data`**: the engine, the policy, the routes, `executeAs`, the write
   lanes, moss's tables.
6. **`integrations`**, out of the core. First a probe: every one of its
   statements as a vex entry, run by a private engine that no route serves.
   Vex's write grammar has insert with conflict, upsert, update, delete, one
   insert per item of a list, and batches in one transaction, which covers the
   shapes in the registration route; this is read, not tried. Then one
   forwarder for frame, webhook, proxy and outbound call, with a timeout.
   Fixes 1, 2, 10, 12, 20.
7. **`shells` and `socket`**: the narrow interface, the split, streaming moved
   to the socket. Fixes 3, 4, 5, 6, 9.
8. **`documents`, `runtime`, tide's hosting moved to tide.** Fixes 15, 16, 17.
9. **`server`** as the composition root; `FunctionSession` stops carrying the
   runtime.
10. **`client` and `terminal`**: one set of wire slots, one frame tree, a
    status every target is told. Fixes 18, 19.
11. **The documents**: `DESIGN.md` and `README.md` say what the code does; the
    last internals our apps import are removed.

## 8. Decisions

Taken:

- The public API may break and is refactored (2026-10-09: "yes remove all
  unnecessary exports... refactor the outside api").
- An app editing the manifest it handed over is not supported. The API makes
  it impossible rather than tolerating it (2026-10-09).

Open, each a breaking change for an app:

1. **`FunctionSession.runtime` goes.** Lyceum reads the pool and the cache from
   it to build its own query engine. It needs a named capability in its place.
2. **`devSession` leaves the public API**, and a verifier passed as a function
   is named as such at boot.
3. **Tide's DDL split cannot be corrected for migrations that have run**; their
   checksums are in every ledger. It can only be corrected for new ones.

4. **Integrations ships from `@niscorp/moss/integrations`** and tide's store
   from tide. Lyra, lyceum and Midas change their imports.

Not here: stopping the seeding of `vex_cache`. That belongs to the artifactory.

## 9. Done

- `src/` holds `index.ts` and directories.
- No factory takes `NiscApp` or `NiscRuntime` but `createServer` and `serve`.
- No SQL statement outside the two declared places.
- No boundary without a schema; no type assertion.
- `createServer` builds, wires and mounts, and holds no route body.
- Every gate in Part 6 is in CI and green.
- Lyceum's, relay's, lyra's, atrium's and encore's checks pass.

## 10. After this

The artifactory is its own plan. What is decided about it:

- It is a sub-module of moss that every load goes through. It is asked; it is
  not handed around. In the map above it is what `manifest` grows into.
- An id resolves to what is shipped, published, made by a person, or held in a
  draft in the shell. Developers publish new defaults without deploying.
- Several layouts may exist for one action; which is in use is separate. A
  person's own change shows on their open screen at once.
- A made action calls only functions the charter allows, described in the
  manifest, and no vex write.
- The design has to stay simple. A requirement that contorts it is dropped.

Probes run on 2026-10-07 and 2026-10-08, all removed afterwards: vex,
unchanged, answers shipped and saved entries from a cache that asks somebody
else first; a nova shell reads its layouts through a store that asks somebody
else, and an open screen follows; every action of the five moss lab apps (185)
draws the same with its layout held by reference.
