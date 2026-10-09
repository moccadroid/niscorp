# Moss: the audit, and the refactor that follows from it

**Status: Audit done (2026-10-09), refactor proposed. Nothing is built and no
phase has a go. Decided: the public API may break and is to be refactored; an
app editing the manifest it handed over is not kept working. Open: Part 8.
Branch `worktree-moss-refactor`, base `9e88009` (moss 0.4.0).**

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
| SQL statements outside vex | 39 that read or write rows (server 18, integrations 6, sessions 6, tide 6, generation 3), beside the DDL |
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

1. **"Reads are vex, writes are vex."** 39 statements go straight to the pool.
   Two kinds have a reason: the credential lookups (a session token hash, an
   integration key hash), which run before a principal exists, and tide's own
   store. The 24 on the integration tables and the 3 on the generation counter
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

## 5. Modules

A module is a directory under `src/` with an `index.ts`. The rules:

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

The modules, in dependency order (each may import those above it):

| Module | Owns | Comes from |
|---|---|---|
| `telemetry` | spans | `telemetry.ts` |
| `storage` | moss's table sequences, `migrateTables`, the grammar upgrader | `migrate.ts`, `grammar.ts`, the sequence in `integrations.ts` |
| `protocol` | what server and terminal both speak: message schemas, version numbers, close codes, the token offer, the delta codec | types and constants in `socket.ts`, `delta.ts`, the copy in `client/index.ts` |
| `manifest` | the manifest's types and schema, the running manifest (single writer), verification | `app.ts`, `closure.ts`, `server.ts` 292–333 and 1445–1514, the checks inside `runIntake` |
| `identity` | session verification, the credential store, the cookie and its seal, the identity cache | `sessions.ts`, `session-cookie.ts`, `identity.ts`, the dev verifier in `runtime.ts`, `server.ts` 403–478 |
| `authorization` | the charter applied to a set of roles: catalog, layout variants, data policy, and their memo | `principal.ts`, `server.ts` 480–533 |
| `data` | the vex engine, its routes, `executeAs`, the write lanes, reactive followers | `data.ts`, `follow.ts`, `server.ts` 376–401 and 633–714 |
| `cluster` | the generation pointer, the fabric | `generation.ts`, `fabric.ts` |
| `automation` | tide's store and driver, the write-to-fact bridge | `tide.ts`, `driver.ts` |
| `integrations` | the bundle schema, intake, the registry, its routes, the forwarder, assertion signing, the contract | `integrations.ts`, `assert.ts`, `server.ts` 716–1328, `shells.ts` 119–152 |
| `shells` | the shell host: lifecycle, build, snapshot, liveness | `shells.ts`, `liveness.ts` |
| `documents` | drawn documents, pages, export | `document.ts`, `pages.ts` |
| `socket` | the WebSocket endpoint | `createSocket` in `socket.ts` |
| `server` | the composition root, authentication, the runtime type | the rest of `server.ts`, `runtime.ts` |
| `node`, `vite` | the Node transport and static site; the dev plugin | `node.ts`, `vite.ts` |
| `client`, `terminal` | the wire client and the targets; they import `protocol` and nothing else of moss | as today, deduplicated |

## 6. Gates

All of these join `pnpm verify` and CI. A rule that is only written down is the
failure this audit found.

- **`pnpm lint`**, which runs nowhere today. For each module, from the commit
  that creates it: no type assertion but `as const`, no non-null assertion, no
  `function` declaration, the two size limits, no import of another module's
  inner file, and for `client/` and `terminal/` no import of moss but
  `protocol`.
- **`check:modules`**, a repo script like `check:fact-door`. The dependency
  table has no cycle and matches the imports. Nothing sits flat in `src/`
  except the files not yet moved, which the script lists; the list may only
  get shorter.
- **`check:sql`**. Every SQL statement in a package's source is counted per
  file against a number in the script. A new statement fails until the number
  is changed in a diff somebody reads. Moss's target: the credential lookups
  and tide's store, nothing else.
- **`check:api`**. Each package's exported names, per entry point, are a
  committed file. An export that is not in the file fails.
- **`AGENTS.md`** gets a part for changing a package: the seven rules above,
  and "a change that needs the inner files of two modules is a design error;
  stop and say so".

The numbers the counting gates start from are today's (39 statements, 135
names, 28 flat files, about 110 assertions). They may go down, never up.

## 7. Build order

Each phase is its own go and lands alone. A commit moves code or changes
behaviour, never both. Every defect in 4.3 gets a failing test first.

0. **The gates**, counting from today's numbers.
1. **Cut the public API**: the 71 names nobody imports.
2. **`protocol`**: one set of message schemas, parsed on both sides; the client
   stops importing the server. Fixes 7, 8.
3. **`manifest`**: the manifest is parsed and frozen when it is handed over, so
   an edit to it throws; one verification used by boot, refresh and intake; a
   single writer. Atrium moves to the method that replaces a set of actions.
4. **`identity`**. Fixes 13, 14.
5. **`authorization`**: the resolvers in one form, with their memo.
6. **`data`**: the engine, the routes, `executeAs`, the write lanes.
7. **`integrations`**. First a probe: every one of its statements as a vex
   entry, run by a private engine that no route serves. Vex's write grammar
   has insert with conflict, upsert, update, delete, one insert per item of a
   list, and batches in one transaction, which covers the shapes in the
   registration route; this is read, not tried. Then one forwarder for frame,
   webhook, proxy and outbound call, with a timeout. Fixes 1, 2, 10, 12, 20.
8. **`shells`**: the narrow interface, the split, and defects 3, 4, 5.
9. **`socket`, `documents`, `automation`, `cluster`, `storage`, `telemetry`**.
   Fixes 6, 9, 15, 16, 17.
10. **`server`** as the composition root; `FunctionSession` stops carrying the
    runtime.
11. **`client` and `terminal`**: one set of wire slots, one frame tree, a
    status every target is told. Fixes 18, 19.
12. **The documents**: `DESIGN.md` and `README.md` say what the code does; the
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
