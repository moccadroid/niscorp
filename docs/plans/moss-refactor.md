# Moss: the audit, and the refactor that follows from it

**Status: Built (2026-10-11), with what Part 9 lists as not met. The go was the
owner's, on 2026-10-09: "we'll break it... go do the refactor". Every item of
the build order is built (Part 7 gives the commits): 154 commits on branch
`worktree-moss-refactor`, base `9e88009` (moss 0.4.0), and the commits that
closed the loose ends after them (Part 11, "Closed since"), not pushed and not
merged. The four gates are in `pnpm verify` and in `verify.yml`, and pass. Part
9 was checked item by item against the code on 2026-10-11: five of its seven
items were met then, and the sixth is since (the boundary that was read
without a schema is parsed); the lab apps' checks pass at 126 of 133, each of
the seven for a reason outside moss that Part 9 names. Of the 21 defects one
is half fixed by decision (10: the webhook limit is per process) and none is
open; a 22nd was found on a real Postgres and fixed (4.3). A review of the
whole, the same day, found three places where a document said more than the
code did (one owner for what a shell loads, defect 5 for every living shell,
what another process follows after `replaceActions`); Part 11, "After a
review", says what closed each. A second review, the same day, held the
feature seam and the public API against one owner for each table and each
piece of state, and against one way to do a thing; Part 11, "After a second
review", says what it found and what closed each. A third reviewer, the same
day, read the four gates as an adversary and walked round each; Part 11,
"After a review of the gates", says how, what closed each way round, and what
each gate still cannot see. Part 11 is what
moss is now, in numbers, what ran on a real Postgres, and what is left. Not
done here: Midas and the two websites, which are other repositories, and the
release. Next: Part 10.**

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

This part is moss on 2026-10-09, before anything was built. Part 11 has the
same table for moss on 2026-10-11.

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

**What became of each (checked 2026-10-11).** Each number against the commit
that fixed it, read from the log and from the code where it is named. Whether
each fix's test failed first was checked by the phase that wrote it, and not
again here.

| | Now | Where |
|---|---|---|
| 1 | fixed | `2fc4154`: an approval is verified before it is written |
| 2 | fixed | `bb6a2a8`: a bundle lands in one transaction |
| 3 | fixed | `3dec693`: one shell is built for a principal at a time |
| 4 | fixed | `812372e`: a shell is reset one reset at a time, from what it was opened with |
| 5 | fixed, in two steps | `3f3923e`: a living shell holds what its principal holds now. That covered the shells a host keeps, one for each signed-in principal, and only the app's own host was asked. A shell built for one connection (a visitor's; every shell of a page's host) kept what it was built with. Since 2026-10-11 it is every living shell: a host holds each shell it built until it ends (`src/shells/live.ts`, `living`), `adopt` walks those and the builds under way, and a change is asked of every host, the app's and each page's (`src/server/hosts.ts`, `adopt`). Part 11, "After a review". |
| 6 | fixed | `1fbe5a7`: a connection that closed before its session was ready leaves nothing attached |
| 7 | fixed | `6d7d054`: a message the shell throws on is one message |
| 8 | fixed | `d424c3a`: a refused terminal is not sent the error that refused it |
| 9 | fixed | `52ba2d1`: `runtime.anonymousShellMax`, default 1,000, from a measurement |
| 10 | half, and decided to stay so | `bcec37f`: a frame grant is a row, so any process redeems it. The webhook limit is a limit per process, by decision (2026-10-11): 240 calls a minute for each integration, counted in the memory of the process that takes them (`src/integrations/proxy.ts`). With N processes a vendor is let through up to N × 240 a minute, and nothing is lost. One limit across processes needs a store they share and a write for every call; none was built. The constant's comment and `DOCS.md` say what it is, and `test/integrations-hook-limit.test.ts` holds it to that. |
| 11 | fixed | after the build order, which did not name it: a seed that is given and decodes to fewer than 32 bytes throws when the signer is made (`src/integrations/credentials.ts`), which for a server is while it boots. The sentence says the seed's length, never the seed. No seed still generates a key. |
| 12 | fixed | `3f95b94`: `outboundTimeoutMs` (30 s) and `pressMaxBytes` (5 MiB, a number nobody measured) |
| 13 | fixed | `cec2c66`: the dev verifier is not exported, and a verifier of the app's own is said at boot |
| 14 | fixed | `7707fa8`: an invalidation is not undone by the resolve it interrupted |
| 15 | fixed | `7439637`, `e1e4cf3`: a move this process could not follow is tried again, and its own move does not pass over another's. The retry logged a line at every poll; since 2026-10-11 it is said when it first fails, again when what it says changes, and once when it is followed (`src/manifest/generation.ts`). |
| 16 | fixed | `fd2ee02`, in tide: an advisory lock in the claim's transaction |
| 17 | fixed | `98bb60b`, in tide: a wait longer than a timer can hold |
| 18 | fixed | `e6f7c0b`: a reset while connecting leaves one socket |
| 19 | fixed | `edfb856`: every render target is told the connection's status |
| 20 | fixed | `2b7b321`: an id is a name, and a unique index on `integrations.key_hash` |
| 21 | fixed | after the build order, which did not name it: `/dev/as/<who>` answers a request whose socket ends on this machine (`127.0.0.0/8`, `::1`, the IPv4-mapped form) and answers any other `403`, with why (`src/server/vite.ts`). `signInFromNetwork: true` on `mossDev` opens it to other devices. No forwarded-for header is read. |

**Found afterwards, by running on a real Postgres (2026-10-11).** Everything
above ran on PGlite, which has one connection. Part 11 says what was run on a
Postgres with separate connections. It showed one defect the audit had not
read:

| | Where | What | Now |
|---|---|---|---|
| 22 | `src/integrations/operator.ts`, `entries.ts` | Two registrations of one new integration at once are both told it holds no key, both mint one, and the later landing writes its hash over the earlier one's: both are answered a key, and one of the two is dead. 200 rounds from two connections, 200 dead keys. | fixed: the hash is written where the row holds none, in the batch that lands the bundle, and a registration is answered a key only when its own was kept. |

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

**As built (2026-10-11).** Three things differ from the tables above.

- The core is ten modules, not nine. `feature` was added beneath `manifest`:
  it holds what a feature is and the seams it is started with, as types and
  no code, because the manifest names a feature (`NiscApp.features`) and so
  cannot be imported by what says what one is.
- `identity` was built before `manifest`, and `manifest` imports it (who
  somebody is by the assignments is identity's answer). The table of who may
  import whom is `scripts/check-modules.mts`, and moss's `DESIGN.md` ("How the
  code is laid out") carries a copy.
- Tide's hosting did move to tide (`@niscorp/tide/postgres`, and the driver in
  tide's main entry). What moss kept of it is a second feature, `tide`: three
  files that mint a committed write into tide as a fact, on one seam,
  `onWrite`. `@niscorp/tide` is an optional peer of moss.

The terminal side is two modules: `client` imports `protocol`, and `terminal`
imports `client`.

### 5.4 The seams a feature uses

A feature never reaches into a module. It uses these, and if one is missing,
adding it to its owner is the first change, on its own:

- `manifest`: hand over a set of actions and take one back.
- `data`: declare tables, declare entries of its own, hear a write.
- `server`: mount routes behind the authentication every route gets.
- `shells`: wrap the wire a shell calls through.

As built these are the 21 members of `FeatureSeams` (`src/feature/seams.ts`),
each used by one of the two features: twenty by integrations, `onWrite` by
tide. A feature's tables are not a seam: it names them on itself
(`Feature.tables`: their names, and the sequences that make them), because
they exist before anything starts, and because which tables a feature
addresses outside the app's policy has to be readable without running it.
Each feature is handed seams made for it, and the members that reach
something owned (its tables, its set of actions, the documents in its rows)
are bound to that feature and take no name (Part 11, "After a second
review").

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

**As built (2026-10-11).** All four are in `pnpm verify` and in
`.github/workflows/verify.yml`. The branch has not been pushed, so CI has not
run them; they pass here.

| Gate | Built in | What it holds now |
|---|---|---|
| `check:raw-sql` | `bb04ed7`; whatever sends a statement and however it is cased, `5a76069` | Every package but vex and strata. 0 statements with no reason, 6 credential (`moss/identity/sessions.ts`), 7 in tide's own store (`tide/store/postgres/`: 4 in `store.ts`, 3 in `claim.ts`), and one row a migration writes (`moss/data/tables.ts`). |
| `check:modules` | `0f3f059`; a finished module imports nothing flat, `45a5093`; the core imports no feature, `b9979b1`; every way a file names another, `93182f4`; a door names what is behind it, `5c3d49c` | Moss: 14 modules, no cycle, nothing flat in `src/` since `fed4ac1`. It holds two things this part gave to the lint: no import of another module's inner file, and the terminal side importing nothing of moss but `protocol`. |
| `check:api` | `0f3f059`; names asked of the compiler, and members, `5ad1130`; tide, `a88b66c` | Moss: 89 names and 304 members across 16 entry points. Tide: 127 names and 325 members across 4. "Each package's" is not built: the other twelve have no `api.txt`. |
| `pnpm lint` | in `verify` since `0f3f059`; the block for moss's modules, `8ccbd40`; the client under it, `28a78cb`; the terminal, `bbb4fb3`; with types, `0fc23c5`; no written predicate, `83d80e9`; every file and no comment that switches it off, `f0be5d7`; the width, `534c0fb`; tide's store and driver, `9b32289`; tried on every run, `9b7ed95` | For every file under `packages/moss/src`, and tide's `src/store/postgres/` and `src/driver.ts`: no type assertion but `as const`, no `any` that becomes a typed value, no written type predicate, no non-null assertion, no `function` declaration, no `let` or `var` at the top of a file, 100 lines to a function, 400 to a file and 200 characters to a line. |
| `AGENTS.md` | the last phase; the gates as a table of what each fails on and what it cannot see, after the review of them | "Changing a package": 5.2, 5.5 and the gates; `STYLE_GUIDE.md`, "Modules", for what is longer. |

What each gate fails on, in full, and what it cannot see, is the comment at
the top of its script, and Part 11, "After a review of the gates".

Rules 3 and 4 of 5.2 (one owner; narrow inputs) have no gate. They were read
for, phase by phase, and Part 9 says what a reading of the whole finds.

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

**As built.** The go for all of it was one go (2026-10-09). The order moved in
two places: `identity` and `runtime` were built before `manifest`, and `server`
was built with `socket` and `documents`, before tide's hosting left.

| | Commits | What landed |
|---|---|---|
| 0 | `bb04ed7`, `0f3f059`, `8ccbd40` | The gates. |
| 1 | `0b25acc` | The main entry: 135 names to 66. |
| 2 | `b5a5d1a` to `45a5093` (6) | `protocol`; both ends parse. Defects 7, 8. |
| 4 | `e0a2bce` to `176c9e5` (9) | `identity`, and `runtime` with it. Defects 13, 14. |
| 3 | `66e2f81` to `46af1e2` (20) | `manifest`: one verification, one writer, parsed and frozen at hand-over; `replaceActions`, `catalogOf`, `verifyActions`, `verifyApp`. Atrium moved to the set of actions. |
| 5 | `04562cf` to `00a8e0f` (11) | `data`; `server.policyForRoles`. |
| 6 | `4161221` to `9161ce1` (30) | `integrations` as a feature, from `@niscorp/moss/integrations`; the probe (`5185f38`), then every statement a vex entry; one forwarder with a timeout. Defects 1, 2, 12, 20, and the grants of 10. |
| 7 | `da13673` to `2671d8e` (17), `03265b0` to `52ba2d1` (6) | `shells`, then `socket`. Defects 3, 4, 5, then 6, 9. Streaming stayed in `shells` (`src/shells/stream.ts`): the last frame sent is kept per shell and shared by its connections. |
| 8 | `6bf2768` to `af23297` (4), `5e40012` to `333c799` (13) | `documents`; tide's store and driver to tide, the write-fact feature, the generation counter through vex. Defects 15, 16, 17. |
| 9 | `63c8a54` to `5315a0e` (9), and `da13673` to `5e7ae28` in 7 | `server` as the wiring; `FunctionSession` without `runtime` and `policy`, with `answerIntent`. |
| 10 | `a7831db` to `fba90ea` (17) | `client` and `terminal` under the lint; one set of wire slots, one frame. Defects 18, 19. |
| 11 | `ceae73d` to the commit that wrote this | The three documents read against the code; `memoKeyOf` out of the main entry; `AGENTS.md`, "Changing a package"; this file; the changeset as one document. |

Two defects were in no item's list, 11 and 21. Both were fixed after the build
order (4.3).

## 8. Decisions

Taken:

- The public API may break and is refactored (2026-10-09: "yes remove all
  unnecessary exports... refactor the outside api").
- An app editing the manifest it handed over is not supported. The API makes
  it impossible rather than tolerating it (2026-10-09).

- The go, and with it the four below (2026-10-09, the owner: "we'll break
  it... go do the refactor"). Each was open when this file was written, and
  each is a breaking change for an app. The changeset
  (`.changeset/moss-in-modules.md`) carries the approval and says what an app
  writes instead.

1. **`FunctionSession.runtime` goes.** Done (`5e7ae28`), and `policy` went
   with it. The named capability is `session.answerIntent(writers, asked)`
   (`da13673`, `010675e`): lyceum asks there, and no longer builds an engine
   over the session's pool. What a caller's roles may read is
   `server.policyForRoles(session.roles)`.
2. **`devSession` leaves the public API**, and a verifier passed as a function
   is named as such at boot. Done (`cec2c66`). `session: 'dev-open'` is the
   same verifier, and says so.
3. **Tide's DDL split cannot be corrected for migrations that have run.**
   Nothing was corrected: migration 1 of `nisc.moss.tide` is split as it was,
   and the store moved to tide with the sequence unchanged (`7fb8322`): the
   checksum tide's test pins for migration 1 is the one moss's test pinned at
   `9e88009`. A comment over the split says nothing new is split this way
   (`packages/tide/src/store/postgres/tables.ts`, since the store became a
   directory).
4. **Integrations ships from `@niscorp/moss/integrations`** (`b9979b1`) and
   tide's store from tide (`7fb8322`). Lyra and lyceum changed their imports
   in the same commits. Midas did not: it is another repository, and the
   changeset's last part is the list it follows.

Not here: stopping the seeding of `vex_cache`. That belongs to the artifactory.

## 9. Done

- `src/` holds `index.ts` and directories.
- No factory takes `NiscApp` or `NiscRuntime` but `createServer` and `serve`.
- No SQL statement outside the two declared places.
- No boundary without a schema; no type assertion.
- `createServer` builds, wires and mounts, and holds no route body.
- Every gate in Part 6 is in CI and green.
- Lyceum's, relay's, lyra's, atrium's and encore's checks pass.

**Checked 2026-10-11, each against the code.**

1. **`src/` holds `index.ts` and directories. Met.** `packages/moss/src` holds
   `index.ts` and 14 directories, each with an `index.ts`; `check:modules`
   fails on anything else.
2. **No factory takes `NiscApp` or `NiscRuntime` but `createServer` and
   `serve`. Met for every factory; two steps of the wiring are typed on the
   whole of them.** Every `create…` function outside `server` is handed a
   typed object of its own (`DataConfig`, `RunningManifestConfig`,
   `IdentityConfig`, `ShellHostConfig`, `SocketConfig`, `DocumentConfig`,
   `IntegrationsConfig`, `TideFactsConfig`). Inside `server`, the module that
   may hold both, `buildData(app: NiscApp, runtime: NiscRuntime)`
   (`src/server/data.ts:14`) and `buildRunningManifest(app: NiscApp, …)`
   (`src/server/manifest.ts:15`) take the whole manifest and hand on its
   fields; the other steps take a `Pick`. Two functions that are not factories
   take the whole manifest because the whole of it is their subject:
   `defineApp` and `receiveManifest` (`src/manifest/handover.ts:49`), which
   parses and freezes it. `migrateTables` takes four fields of the runtime and
   two of the manifest (`src/data/migrate.ts:160`).
3. **No SQL statement outside the two declared places. Met, with one more
   place, declared.** The two were the credential and tide's store. The six
   credential statements are in `src/identity/sessions.ts`; tide's seven are in
   tide. A third kind is in the gate's ledger as `tables`: the seed row of the
   generation counter, an `INSERT` that is a step of migration 1
   (`src/data/tables.ts:25`). Nothing else: the integration key's hash is
   looked up through vex.
4. **No boundary without a schema; no type assertion. The second is met. The
   first is not, in one place.**
   - No type assertion, no non-null assertion and no `function` declaration in
     148 files, counted from the syntax tree; the lint holds it.
   - Parsed by a schema where it enters: the manifest, a set of actions, a
     socket message on both ends, the snapshot a drawn page carries, an event,
     the integrations' route bodies, their rows, the bundle, a press image's
     type, the assertion's payload, the identity record, a session row, the
     dev token, a sealed sign-in, the counter's row. 19 files import zod and
     hold 33 calls of `parse` or `safeParse`, where there was one file and two.
   - **Not parsed: a message from another process.**
     `src/server/fabric.ts:57–79` switches on `message.kind` and reads
     `principal`, `tag` and `channel` as the type the host's transport gave
     them. 4.1 named this one (`fabric.ts:82`), and no phase took it.
     *Parsed since (2026-10-11):* `FabricMessageSchema`
     (`src/runtime/fabric.ts`) is what the message's type is inferred from,
     and `src/server/fabric.ts` reads what a transport hands over by it. What
     does not parse is dropped, and the first one is logged.
   - Held by hand, not by a schema: the parameters of an upgrade
     (`src/socket/handshake.ts:25`, an integer in a range;
     `src/socket/socket.ts:63`, a regular expression), an integration's error
     body (`src/integrations/fallback-message.ts:34`), vex's own reply over the internal
     wire (`src/server/wire.ts:36`), and the runtime, whose fields are checked
     where each is read (`session` unset, `identityMax` of zero).
     *Since (2026-10-11):* the parameters of an upgrade are read by one schema
     (`UpgradeParametersSchema`, `src/socket/handshake.ts`), and a protocol is
     digits: `Number()` had read `0x2` as 2. An integration's error body is
     read by a schema (`src/integrations/fallback-message.ts`), accepting what the hand
     check accepted. Vex's reply over the internal wire is left as it is: it
     is the server's own surface answering inside the process, and nothing
     from outside reaches that line unparsed. The runtime is left too: it is
     the deployment's own object, typed, and each refusal is said where the
     field is read.
5. **`createServer` builds, wires and mounts, and holds no route body. Met.**
   `src/server/server.ts:33–158`: thirteen numbered steps, each a call to a
   file beside it. The routes are in `src/server/routes.ts` and in the
   features. It spans 126 lines with its comments; it was 1,345.
6. **Every gate in Part 6 is in CI and green. Met here; CI has not run.** The
   four are steps of `verify.yml` and of `pnpm verify`, and pass on this
   branch. The branch is not pushed. What Part 6 asked of `check:api` for
   "each package" held for moss alone. *Since (2026-10-11):* for moss and
   tide; the other twelve packages have no `api.txt`.
7. **Lyceum's, relay's, lyra's, atrium's and encore's checks pass. Not met:
   126 of 133.** Each `src/dev/*-check.ts`, run one at a time on 2026-10-11:
   encore 13 of 13, lyceum 17 of 18, atrium 18 of 19, relay 28 of 32, lyra 50
   of 51. Each of the seven that fail was run again alone, to read why. Three
   need a model's key this machine does not
   have (lyceum `model-check`, relay `architect-check` and
   `architect-edit-check`). Relay's `console-terminal-check` opens
   `apps/lab/relay/dist/console.js`, which no build here makes. Atrium's
   `nisc-check` spawns `node_modules/.bin/nisc` itself, which Windows cannot.
   Relay's `harness-check` fails three assertions of its architect harness, a
   failure `verify.yml` names as older than the workflow. Lyra's
   `scoping-check` fails one: a seeded person has no booking of his own on
   this date. The counts are the ones each phase recorded before this one;
   whether the last two fail for a reason in moss was not traced here. The
   apps' checks are not in CI.

## 10. After this

The artifactory is its own plan. What is decided about it:

- It is a sub-module of moss that every load goes through. It is asked; it is
  not handed around. In the map above it is what `manifest` grows into.
  **Where it will be asked is built (2026-10-11), and no more than that.**
  The running manifest (`src/manifest/running.ts`) is the one owner of the
  four kinds while a server runs:
  - An action, a layout and a fragment reach a shell in one answer,
    `artifactsFor(shell, roles, installed)`: the definitions those roles hold
    with their layout variant in place, the shell's canvases, frame and layout
    store, its fragments, the entries by fingerprint, and the component names.
    A shell host asks it once for each build and once for each adopt, and the
    server's wiring reads none of the four off the app
    (`src/server/hosts.ts`). The variant is put in its place by one function,
    which the closure audit reads through too (`src/manifest/roles.ts`,
    `withVariants`).
  - The entries are held there (`entries()`). What vex replays from is seeded
    with what it hands over (`Data.seed`, from `src/server/manifest.ts`), a
    verification is handed them, and a shell's liveness reads the ones its
    composition answered. Where no server stands (`migrateTables`,
    `verifyApp`), one pure function says what an app's entries are:
    `entriesOf` (`src/manifest/entries.ts`), which the running manifest reads
    too.

  Not built, on purpose: nothing is stored or published, `vex_cache` is still
  seeded, and a replay still resolves its entry in vex's cache. An adopt
  brings a living shell's actions, component names and entries level; its
  frame, layout store and fragments are the ones it was built with, and
  nothing changes those while a server runs.
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

## 11. What moss is now

Measured on 2026-10-11, by one script over `packages/moss/src` and by the
gates. "Lines of code" leaves out blank lines and lines that hold only a
comment, as the lint's two sizes do.

| | 2026-10-09 | 2026-10-11 |
|---|---|---|
| Source files | 43, of which 28 flat in `src/` | 148, of which one at the top of `src/`: `index.ts` |
| Directories | two | 14, each a module with an `index.ts` |
| Lines | 10,554 (5,868 code, 4,017 comment) | 14,878 (7,775 code, 6,140 comment-only) |
| Names exported from the main entry | 135; imported by something outside moss: 64; by nothing: 71 | 49; imported by something in this repository outside moss: 34; by nothing here: 15 |
| Names exported, every entry point | 185 across 14 | 103 across 16 (`api.txt`): main 49, `client` 9, `integrations` 7, `terminal` 6, `node` 5, `terminal/vue` 5, `terminal/react` 4, `tide` 3, `vite` 3, each `/server` 2, `tty` 2, `ink` 2, `dom` 1, `client/node` 1 |
| Functions over the size | ten over 120 lines as written | none over 100 lines of code. The largest is `createWire`, 98 (`client/wire.ts:221`). Five still span more than 120 lines with their comments: `createWire` 141, `createSocket` 134, `buildShell` 129, `createServer` 122, `createShellHost` 122 |
| Files over the size | three | none over 400 lines of code. The largest is `integrations/intake.ts`, 290 (428 lines) |
| Type assertions | about 110 | 0 |
| Files that import zod | one, with two parses | 19, with 33 |
| SQL statements outside vex | 40 that read or write rows | 7 in moss: 6 credential, 1 a migration's seed row. 7 in tide's store, which is tide's now |
| Tests | 43 files, 546 cases | moss: 61 files, 920 tests. Tide, which took the store's and the driver's: 12 files, 232 tests |

The largest module is `integrations`: 20 files and 1,838 lines of code, more
than `server` (867), `data` (784), `manifest` (758) and `shells` (758).

Counted again after the loose ends below were closed, the same day, for the
four rows they moved (the others were not measured again): 149 source files
(one more, `server/transport.ts`); 22 files import zod, with 38 calls of
`parse` or `safeParse`; moss has 64 test files and 987 tests, and tide the 12
and 232 it had. The gates pass as they did: 103 names in `api.txt`, 14 modules,
no statement outside vex without a reason.

Counted once more after the review below, the same day, for the rows it
moved: 151 source files (two more, `manifest/entries.ts` and
`manifest/artifacts.ts`); moss has 66 test files and 1,018 tests. Of the five
functions that span more than 120 lines with their comments, `createServer`
is 126 now and `createShellHost` 130, and none is over 100 lines of code. The
gates pass as they did: 103 names in `api.txt`, 14 modules under the same
table of who may import whom, no statement outside vex without a reason.

**What is left.** None of it stops the artifactory; each is somebody's to
decide.

- **Names that stayed in the main entry and that nothing in this repository
  imports** were decided by the second review, below: of the fifteen, ten
  left, and `Feature`, `FeatureSeams`, `Telemetry`, `TelemetrySpan` and
  `revokeAllFor` stay, each shown in use in `DOCS.md`.
- **The gates list one package, and part of a second.** `check:modules` holds
  moss. `check:api` holds moss and tide. The module block of the lint holds
  moss, and of tide the store and the driver that came out of moss.
  `check:raw-sql` sweeps every package but vex and strata. How a package
  joins is in `AGENTS.md`, "Changing a package"; none was added that this
  refactor did not touch.
- **The repository is not formatted.** `.prettierrc` names a width of 100 and
  nothing enforces it: by `prettier --check`, 119 of moss's 154 source files
  differ from it. The lint holds a line to 200, which is not the same thing.
  Formatting is a decision for the whole repository.
- **The webhook limit is per process** (4.3, 10), and the documents say so.
  Whether a deployment of several processes wants one ceiling is its owner's
  to say; it would be a shared store, and none is built.
- **Midas, nisc-website and moccadroid-website** import moss and are other
  repositories. The changeset's last part, "What an app changes", is what each
  follows.

**Closed since (2026-10-11).** Each was in the list above, or open in 4.3,
when this part was written. Each fix got a test that failed first. The webhook
limit was not changed: it got tests that hold it to what the documents say.

- **`runtime.socketMaxMessageBytes` and `runtime.socketCompression` hold on
  every path.** They reached the transport under `serve` and nowhere else:
  `nisc start` and the dev plugin attach the socket with no options and are
  not handed the runtime. The socket a server hands out carries them now
  (`socket.transport`, filled in `src/server/socket.ts`, the one place that
  reads them), and a transport reads them off the accept it is handed
  (`src/server/transport.ts`), so no host says them. The dev plugin, which
  hears vite's listener before any app has booted and swaps apps on an edit,
  keeps one transport for each booted app and retires it with the app.
- **The fabric's message is parsed** (Part 9, item 4). The schema is the
  source of the type; a message that does not parse is dropped and the first
  one is logged with what was wrong.
- **Defect 11, the signing seed** (4.3). Lyra is the one lab app that passes
  one (`LYRA_SIGNING_SEED`, when it is set); two of its checks set that
  variable to a word, after the app has booted, for lyra's own unsubscribe
  signature, and moss never sees it. Booted with the word in the environment,
  lyra is refused with the sentence; with 32 bytes it boots.
- **Defect 21, the dev sign-in** (4.3). It answers this machine only; one
  option on `mossDev`, `signInFromNetwork`, opens it to other devices.
  `nisc dev` builds the plugin itself and does not pass that option on: an
  app under `nisc dev` that wants the sign-in on a phone has no way to say so
  yet, and no app in this repository gives `dev.signIn` at all.
  A page of another site, open in the developer's browser, asks from this
  machine too. Run in Chrome: sent to the sign-in by such a page, the browser
  came back signed in as whoever the page named; an image, a fetch and a frame
  of the address each had the app mint a session, and left no cookie. A
  request marked `Sec-Fetch-Site: cross-site` is refused now, and the same
  four pages leave the app unasked. A request that names another host (the
  shape of a DNS rebinding) never reached the sign-in: vite's own check of
  the host answers it `403` before moss's middleware runs, as it does for
  `/catalog` and a page; that was run too, under `nisc dev`.
- **Defect 15, the retry that logged at every poll** (4.3): said when it
  first fails, again when what it says changes, and once when it is followed.
- **Defect 10, the webhook limit** (4.3): decided to stay a limit per
  process, and said to be one where it is written and documented.

**After a review (2026-10-11).** Two reviewers held the whole against what the
owner asked for. They found three places where a document said more than the
code did. Each is closed, with tests that stand a shell host, the server's
wiring or a running manifest up and start no database and no server.

- **Only an action had one owner that was asked.** An action reached a shell
  through the running manifest. The frame, the layout store and the fragments
  were read off the shell's manifest by the server's wiring; the variant
  substitution was written twice (`manifest/roles.ts`, `manifest/closure.ts`);
  and the entries had two holders, vex's cache seeded from `app.entries` by
  one step of the wiring and a map the running manifest made from the same
  field. The next thing to decide what an id resolves to would have had four
  modules to change. It has one now: Part 10, "Where it will be asked", says
  what was built. A hosts' test fails against the old wiring on the frame, the
  layout store and the fragments (they were the app's, whatever the running
  manifest answered); the entries a shell reads were already the running
  manifest's, and what was not is what was seeded, which
  `test/server-manifest.test.ts` holds (`expected [] to deeply equal …`:
  nothing was handed over). The order of a boot moved with it: the entries are
  seeded after the boot check, so a manifest that is refused has written no
  row.
- **Defect 5 held for the shells a host keeps, in the app's own host.** The
  changeset, `DOCS.md` and 4.3 said "every living shell". The reviewer ran
  the package's own adopt test against `session(null, null)` and against a
  host that keeps none, with a principal: both kept `extra`
  (`expected ['home','extra'] to deeply equal ['home']`). Those are the tests
  now, with the same failure first, for three kinds of shell that is not kept,
  for builds under way, and for two tabs of one principal. One more was found
  on the way, and it held for kept shells too: a shell a reset was replacing
  when the app changed came back holding what its principal had held before,
  because the shell that still stood adopted and its replacement, built from
  the earlier answer, then took its place. A replacement is a build under way
  now, and its cell adopts when it lands. A host holds every
  shell it built until it ends, and `endShell` (`src/shells/live.ts`) is the
  one place a shell is marked ended and let go. That an ended shell is let go
  is asked of the collector for four ways of ending: with the removal taken
  out, all four fail. What it costs is said in the changeset and held by a
  test: a shell that is not kept is the host's until it ends, so one that
  code opened in process, attached nothing to and dropped is no longer
  collected; it is ended by a detach, as the socket ends one. A change, and a
  principal's reset
  (`invalidateIdentity`), are asked of every host, the app's and each page's.
  Not moved: `deliver` and `nudge` still reach the shell the app's host keeps
  for a principal and no shell of a page's.
- **"Every other process follows" after `replaceActions`.** The pointer
  moves and every process follows it, but a set handed to one process is in
  no other: the reviewer ran two servers on one database, both reached the
  same generation, and the second served the old set. Nothing was built for
  it, because a set every process reads is what Part 10 is. The changeset,
  `DOCS.md`, `DESIGN.md` and the comments on `replaceActions`, `generation`
  and `loadActionsFrom` say what crosses (a process reads again the sets it
  has a loader for, drops what it derived, and its shells adopt), what does
  not (a set with no loader), and what an app that runs several processes
  does today (keeps the set in rows and names how it is read, in a feature of
  its own). Two tests hold the two halves, with two running manifests over
  one pointer. Two servers on one database were not run again here.

The lab apps' checks were run again on the built result, each as its own
process, one at a time: 126 of 133, the same seven failing as in Part 9 (encore
13 of 13, lyceum 17 of 18, atrium 18 of 19, relay 28 of 32, lyra 50 of 51).

**After a second review (2026-10-11).** A reviewer booted a server with a
feature of its own, and read the public API against "one way to do a thing".
Each finding was checked by reading and, where it could be, by running it
against the wiring with no database: every one held. Each fix got a test that
failed first; none of the new tests starts a database or calls `createServer`.

- **The feature seam handed out what rule 3 forbids.** A feature somebody
  else wrote read an app's table by naming it to `ownEntries`, was handed the
  seed the deployment signs with, and wrote the integrations' set of actions;
  every feature held one and the same seams object. Seams are made for each
  feature now (`src/server/features.ts`). A feature names its own tables on
  itself (`Feature.tables.names`); the data module is told them when it is
  built, refuses a table of the core's (`CORE_TABLES`, `src/data/tables.ts`)
  or one two features name, before a table is made, and refuses an entry over
  any other table when it is handed over (`src/data/feature-tables.ts`,
  `own-entries.ts`). `integrations` and `integration_actions` stay in
  `nisc.moss`, byte for byte, and are the integrations feature's in code. The
  signing seed is `createIntegrations({ signingSeed })` and is on neither the
  runtime nor the seams. A set of actions has one writer: it is claimed by
  name in the running manifest (`claim`), a feature's is claimed under the
  feature's name before the feature starts, and `server.replaceActions` and
  `server.verifyActions` throw for it.
- **The core rewrote a feature's rows at every boot.** `upgradeStore` over
  `integration_actions` ran in the data module whether or not the app named
  the feature. It is a seam (`upgradeStore`, bound to the feature's own
  tables) and the integrations feature asks when it starts.
- **A boot that failed left timers running.** A feature that threw in `start`
  left two intervals; so did a page the router refused, because the app's own
  host was made first. `assembleServer` (`src/server/assemble.ts`, steps 4 to
  13 of `createServer`) keeps one list of what was started and runs it on a
  throw; `close` runs the same list.
- **The core read a feature's headers.** The vex routes read `x-tide-cause`
  and `x-tide-depth`. They hand on what the request said, by header name and
  without its credential; the tide feature reads its own two
  (`src/tide/chain.ts`). `data` answers the fingerprints itself and hands out
  no engine.
- **The API kept second ways.** `resolveRoles`, `resolvePolicy` and
  `resolveVariants` are gone (they answered `public` for an app that uses
  `identity`), with eleven more names of three entries and
  `MossServer.catalogForRoles`. The main entry exports 38 names and the
  sixteen entries 89; `DOCS.md` shows every name the main entry, `./node`,
  `./vite`, `./integrations` and `./tide` keep in a code block.
- **Coined names.** `who`, `holds` and `Whoever` in the seam type, `flooredWire`,
  `createPlaces`, and the six `stand…` functions are renamed, with three files,
  in commits that only rename.

**Left by that review, each for a reason.** `MOSS_PATHS` (`src/server/node.ts`)
still names `integrations`: the comment on it says why its three readers
cannot all ask a server instead. Names that read as this codebase's voice and
were outside what the review named stay as they are: `dataOver`, `wireOver`,
`pointerOver`, `wrappedBy`, `WriteLane`, `mintWrites`, `ShellHostConfig.kept`,
`MossServer.nudge` (published in 0.4.0, and the fabric's message kind between
processes has the same name), `storePress` and `pressMaxBytes` (`press` is the
bundle grammar's own field).

Counted after it, for the rows it moved: 154 source files (three more:
`data/feature-tables.ts`, `server/assemble.ts`, `tide/chain.ts`); moss has 68
test files and 1,043 tests; `api.txt` holds 89 names, 38 of them the main
entry's. The gates pass as they did, 14 modules under the same table of who
may import whom, no statement outside vex without a reason.

**After a review of the gates (2026-10-11).** A reviewer read the four gates
as an adversary and showed, on copies outside the tree, that each passed on
code that breaks its rule. Every one was reproduced first, the same way: a
copy of the gates and of moss's source under the system's temp directory, the
walkaround written into the copy, the gate run. Then it was closed, and made a
case the gate runs against itself every time: something small that must fail,
beside a twin that does the same thing by the rules and must pass.

- **`check:modules` read `import` and `export` declarations and literal
  `import()` calls.** Five ways round it, all reproduced: a type taken with
  `import('../data/engine').T` or `typeof import(…)`; the package's own name
  (`@niscorp/moss/integrations` from the core); a file of an extension it did
  not read (`.mts`, `.js`), flat or in a module; the top `index.ts` importing
  a module's inner file; `require`, `createRequire` and `import x =
  require`. Found on the way, of the same kind: a module importing the top of
  `src/` (`from '..'`), which reaches every module through the main entry;
  an alias into the package; a relative path that leaves `src/`; a path
  built while the program runs; `declare module` and `/// <reference>`; a
  declaration file, which was skipped, and which the lint ignores, so it
  is refused now; a link. It reads every way a file
  names another now, a file is `.ts` or `.tsx` or it fails, a name that is
  not relative is a package `package.json` names, and `import()` takes one
  written string. 25 pairs and one link (`93182f4`, `5c3d49c`).
  *Cannot see:* what a door exports from inside its module; code loaded by
  `eval` or by reading a file; whether what a door says of a file is so.
- **`check:api` read the statements of each entry file, and recorded names.**
  `export const { createShellHost } = inner` and `export namespace internals`
  both reported the old 89 names; a member added to `MossServer` moved no
  line; tide, which this refactor gave an entry point, was not listed. The
  names are what the type checker says an entry's module exports, so every
  way of writing an export is a name. What has no name of its own is refused:
  `export *`, a namespace however it is reached, a default export, an enum.
  One level of members is recorded for each exported type, interface and
  `const` object, where the package itself declares the member. Tide's four
  entries are recorded. 17 pairs (`5ad1130`, `a88b66c`).
  *Cannot see:* a signature; a second level of members; what an exported
  function takes when that type is not exported.
- **`check:raw-sql` told a pool by four names and a statement by its
  capitals.** `const conn = runtime.pool; conn.query('select … from
  sessions')` counted as nothing. Fifteen more of the kind were found:
  `execute`, `exec` and `unsafe` on another name, a `sql` tag, a statement
  built with `+` or joined from a list, kept in a variable, given as an
  object's `text` (which was read as tide's store and skipped), in sentence
  case, taken off a pool by destructuring, a table made in lower case. A door
  is now also a name the file made from a pool or wrote a pool's type on,
  and, under any other name, a call that is handed text that reads as SQL.
  A statement not in capitals counts where it is sent. 19 pairs and a
  `.sql` file (`5a76069`). The ledger's numbers did not move.
  *Cannot see, and one of the fifteen is this:* a call under a name that says
  nothing (`handle.query(text)`), sending text its file does not hold.
- **The lint read syntax.** `const row: Row = JSON.parse(text)` is a cast with
  nothing written; so is a type predicate; `export let` was not the `let`
  the selector named; `/* eslint-disable */` worked; `src/index.ts`, a
  `.mts` file and tide's store and driver were held by nothing; and nothing
  held how wide a line is. The block lints with the compiler's types now
  (`no-explicit-any` and the `no-unsafe` family), forbids a written
  predicate, holds every file under moss's `src/` and the two of tide's,
  reads no inline configuration, and holds a line to 200. 31 pairs, and one
  more case (`0fc23c5` to `9b7ed95`).
  *Cannot see:* that a boundary is read by a schema (a value narrowed by hand
  passes, and a type another package claims to answer is believed); state a
  `const` holds at the top of a file; a file the `lint` script is not handed;
  a `.d.ts` file.

What the typed lint found in moss's 154 files, counted by rule: two
`no-unsafe-argument` (Hono types what a route was handed as `any`, and it
was passed on) and one `no-unsafe-assignment` (`Object.getPrototypeOf`). In
tide's eight: one `no-unsafe-call` and one written predicate. No boundary
was found unparsed. Written predicates in `packages/moss/src`, counted from
the syntax tree: two, both replaced. The rule does not tell an honest
predicate from a cast, and does not have to: the compiler infers one from a
body that narrows, and an inferred one is checked.

**The width.** Of moss's 15,930 source lines, 14,604 are at most 80 wide, 620
are 81 to 100, 304 are 101 to 120, 207 are 121 to 140, 101 are 141 to 160, 58
are 161 to 180, 20 are 181 to 200 and 16 were wider, the widest 273. The bound
is 200 and those sixteen were rewrapped. Held to 100 wide instead (prettier
over a copy, then the lint's own count), five functions were over 100 lines:
`createShellHost` 114, `createSocket` 110, `createWire` 109, `dataOver`
117, `createRunningManifest` 107. Each was split, in a commit that only
moves code (`9671b2d` to `b556963`). Measured again the same way, the
largest is `createRunningManifest` at 99, and no file is over 400. As
written, the largest function is 86 lines of code and the largest file 290
(`integrations/intake.ts`).

**Tide's store** was one file of 690 lines, 458 of them code, with a function
of 104, and held by nothing. It is `src/store/postgres/`, six files and a
door, the largest 134 lines of code (`a9503b1`), under the lint with the
driver (`9b32289`).

**What the gates cost.** Timed on this machine, once before and three times
after: `check:modules` 0.8 s, and 0.8 s; `check:api` 0.7 s, and 2.7 s (it
compiles a program for each package); `check:raw-sql` 1.2 s, and 1.1 s;
`pnpm lint` 2.5 s, and 8.6 s (the types, and 3.1 s of trying itself). The
four together took 5.2 s and take 13.2 s.

Counted after it, for the rows it moved: moss has 154 source files, 68 test
files and 1,043 tests, as before; tide has 13 test files and 235 tests (one
file and three tests more, for the store's `where` compiler).

**Run on a real Postgres (2026-10-11).** Everything before this ran on PGlite,
which has one connection. These ran once on PostgreSQL 18.4 (the
`embedded-postgres` package, in a folder outside the repository, on a spare
port), each side of a race on a `pg` pool of its own. The scripts are not in
the repository: no package has a place for a test that needs a server.

- **Tide's Postgres store** (`@niscorp/tide/postgres`, built). Its store
  contract, 21 checks: all pass on empty tables, and again each in a database
  of its own. Defect 16, a serial group claimed by two instances: 1,000 rounds
  of two pools claiming at once, then 500 rounds of four claims from each pool
  at once. Every round, exactly one task of the group was held, the two were
  told as many as were held, and the group was claimable again once that task
  was done. As a control, the same 500 rounds with the transaction taken away
  (each statement on whichever connection was free): two tasks of one group
  were held in 499 of them, so the rounds do see the defect.
- **The generation pointer** (`src/data/pointer.ts`, through
  `src/data/own-entries.ts`, from source). Two movers with a pool each, 2,000
  rounds of read-then-move at once: 2,002 moves were told they landed, each on
  a number of its own, and the counter went from 0 to 2,002; in 1,998 rounds
  both had read the same number, and never did both land from it. Four movers
  on each pool at once, 500 rounds: the same. Two generations
  (`src/manifest/generation.ts`) bumping at once, 500 rounds: 1,000 bumps, the
  counter on by 1,000, nothing logged.
- **The integrations registry** (built, through `createServer`, the operator's
  routes and `migrateTables`). `migrateTables` on an empty database applied
  five migrations (`nisc.moss` 1 to 3, `nisc.vex.cache/1`,
  `nisc.moss.integrations/1`), and nothing on the migrated one. A server with
  `migrations: 'verify'` booted on the migrated database and was refused on an
  empty one. A registration was one transaction on one connection; one whose
  third statement failed left the import before it whole. Two processes
  importing one integration again at once, 200 rounds: what was held was
  always one bundle, whole. An approval by one process was served by the other
  within its poll. **Two processes registering one new integration at once,
  200 rounds, showed defect 22** (4.3): both were answered a key and one was
  dead, every round. After the fix, the same 200 rounds: every key answered
  is the key the row holds, and never two.

