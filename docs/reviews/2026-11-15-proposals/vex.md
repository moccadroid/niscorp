# vex — fix proposals for the open items

**What changed in this revision** (after the independent check in `proposal-check\vex\`):
- P1: the moved-row check now casts the value to its column's type; before, any update setting an integer or uuid match column failed with a 500 (42804), even to the same value. Tested on integer and uuid columns. The options now reach the Hono adapter. `WriteResult.readable` is present only when the answer option is on, so `onWrite` listeners see today's results.
- P2: now needs the owner's yes. The moss tests are written and run.
- P3: the claim that moss and lyceum see no change was wrong about `rowCount`. Hiding `rowCount` is taken out of the proposal and is now an owner decision. Tests added.
- P7: a `null` upsert key now means "insert" only where the database makes the key (the key column has a default). Elsewhere it stays today's 200 `[]`. Before, a key column with no default turned that 200 into a 500 (23502).
- P8: the 400 is narrowed to errors Postgres attributes to a bound `$context` value. The `distinct` refusal is marked not built, with what it must accept.
- P9: says plainly that writes get narrower for a hand-written `write` plus `update: []`.
- P10: the tiered-cache part is now an owner decision, with lyceum's consequences written out.
- P13 and P16 are owner decisions. P14 says when the null-dropping retry could matter.
- Tests added for P3, P4, P9 and P11. The table has a column that says what was built.

Branch read: `review-fix/all-check` (worktree `fix-all-check`). Nothing was changed there.

Every item was re-run on that branch first, with the third review's scripts (`review3\vex\t1–t9`) and `proposals\vex\scripts\alias.mjs`. The checker's repros, run against this prototype, are in `proposals\vex\scripts\check\`.

Prototypes:
- `proposals\vex\packages\vex` is a copy of vex with P1, P2, P3 (listing part), P4, P7 (upsert part), P9, P10 and P11 built in.
- `proposals\vex\packages\moss` is moss resolving `@niscorp/vex` to that copy, with P2's moss change and two new moss tests.

Results:
- vex: 59 files, 733 tests pass.
- moss: 86 files, 1372 tests pass.
- `tsc` is clean on both.
- Every new test was also run against the unchanged source: each one fails there, except the "options off, as today" guards.

"Breaking" means what the owner wrote: an app or caller that works today stops working or gets a different result. Where a proposal changes what an app sees, it says so in a line starting **Owner to confirm:**.

## Table

| # | Item (source) | Proposal | Status | Built in the prototype |
|---|---|---|---|---|
| 1 | An update can move a row out of the caller's access (third review 1) | P1 | needs owner decision (opt-in; the hole stays open by default) | yes, with tests |
| 2 | A write answers whole rows the caller may not read, `RETURNING *` (third review 2) | P1 | needs owner decision (opt-in; the hole stays open by default) | yes, with tests |
| 3 | `engine.execute` ignores an entry's reach; moss `answerIntent` replays wider (VEX-2, third review 3) | P2 | needs owner decision (moss answers fewer rows) | yes, vex and moss tests |
| 4 | Discovery ignores the engine's own policy (third review 4) | P3 | proposal (Owner to confirm) | yes, with tests |
| 5 | Discovery's `rowCount` counts every tenant's rows (third review 4) | P3 | needs owner decision (hiding it changes moss's and relay's discovery) | no, by decision |
| 6 | Express adapter has no `getPolicy` / `getPolicyForReach` (third review 11) | P4 | proposal | yes, with tests |
| 7 | PATCH/DELETE on an unlocked mount check nobody (VEX-3) | P5 | needs owner decision (off switch now, default later) | not prototyped |
| 8 | `sortBy` ranks by a column the entry does not return (second review S1, third review 5) | P6 | needs owner decision (opt-in; stays open by default) | not prototyped |
| 9 | `upsert` with `id: null` writes nothing and answers 200 (second review S2, third review 6) | P7 | proposal (Owner to confirm) | yes, with tests |
| 10 | Any write that matched no row answers 200 `[]` (third review 6, general form) | P7 | proposal (docs only: this is the documented result) | not prototyped (docs) |
| 11 | A scope value of `null` passes `requireScope`; a write stamps NULL (second review S2) | P7 | proposal (warning now; refusing it is a later approved break) | not prototyped |
| 12 | A wrongly typed context value is a 500 with Postgres's message; the log prints bound scope values; `sortBy` on a `distinct` entry is a 500 (third review 7) | P8 | proposal (log part non-breaking; Owner to confirm the status) | not prototyped |
| 13 | `mergeScopePolicies` drops `public` and `write` (and `deny`, harmless) (VEX-7, third review 9) | P9 | proposal (Owner to confirm) | yes, with tests |
| 14 | `mergeScopePolicies` keeps the first role on equal rule counts; drops `default: 'allow'` (VEX-7) | P9 | needs owner decision (a true union needs a new policy form) | no |
| 15 | The replay "last used" stamp writes back the whole entry it read (VEX-10) | P10 | proposal (Owner to confirm, one narrow case) | yes, with tests |
| 16 | Tiered cache has no `entries()`; a stamp writes a stale L1 entry to the shared L2 (second review S3) | P10 | stamp: proposal (built with item 15); listing: needs owner decision (lyceum changes) | stamp yes; listing yes, with a test |
| 17 | `exists` inside a `case` inside an aggregate is refused when compiling, with a misleading message (second review S3, third review 8) | P11 | proposal | yes, with tests |
| 18 | Adapter `schema:` only changes introspection; queries name tables bare (VEX-5) | P12 | proposal (new opt-in option) | not prototyped |
| 19 | Mutations never use the adapter's `schema` option (VEX-5 note) | P12 | proposal | not prototyped |
| 20 | A string like `"example.com"` is always read as a column; no literal form (VEX-11) | P13 | needs owner decision (new grammar form) | not prototyped |
| 21 | The entity scan treats a dotted literal as a table name (VEX-11 note) | P13 | needs owner decision (same) | not prototyped |
| 22 | Null for an optional key is refused (`"intent": null`, nested `"dir": null` in the agent's answer) (VEX-12) | P14 | proposal (one part stays open) | not prototyped |
| 23 | A request missing context answers `result: []` even for an object-shaped entry (second review S3) | P15 | needs owner decision (the fix is breaking) | not prototyped (docs) |
| 24 | Five separate walkers over the filter tree (third review 10) | P16 | needs owner decision (they treat `exists`/`optional` differently today) | not prototyped |
| 25 | Dead compiler branch for joining a subquery source (second review C) | P17 | proposal | not prototyped |
| 26 | DESIGN decision 1 still has a dated history paragraph | P18 | proposal (docs) | not prototyped |
| 27 | A subquery whose `as` equals a generated alias (`t1`) was dropped (second review S3) | — | **already fixed** (see below) | — |
| 28 | `exists` in an aggregate's case (third review 8) | P11 | duplicate of 17 | — |
| 29 | `sortBy` (third review 5) | P6 | duplicate of 8 | — |
| 30 | merge drops `{public:true}` (third review 9) | P9 | duplicate of 13 | — |

Row 27, already fixed: `from: ['tasks', { as: 't1', query: … }]` now compiles to `FROM tasks AS t2 CROSS JOIN (…) AS t1` and returns both columns. `resolve` adds every subquery `as` to the taken names before it generates aliases (`engine/resolver.ts:403-406`).

**Counts**
- Rows: 30 table rows, 26 distinct problems.
- Proposals: 18.
- Already fixed: 1.
- Need an owner decision: 10 — P1, P2, P3 (`rowCount`), P5, P6, P9 (union), P10 (tiered listing), P13, P15, P16.
- Further "Owner to confirm" lines: 5 — P3 (listing), P7, P8, P9, P10 (stamp).

---

## P1 — A write stays inside the caller's rules (opt-in)

**Problem.** The write path applies the caller's `match` rules only to which rows a statement may touch. It never applies them to the rows the statement leaves behind or answers with. That causes two holes:
- **A row can be moved out.** Policy `tasks.update: [{ match: 'project_id', in: 'projectIds' }]`; entry `tasks/move` sets `project_id` from context. A caller with `projectIds: ['pA']` sends `{ id: 't1', projectId: 'pB' }` → 200, and t1 is now in pB (`t1.mjs`). The same works with `tenant_id`: a caller can push their own row into another tenant. `onConflict.set` has the same gap.
- **A write answers rows the caller may not read.** Read rule `owner_id = me`, update rule `tenant_id = mine`. Renaming someone else's task answers the whole row, including `owner_id: 'u2'` and `salary: 900` (`t6.mjs`).

**Why it cannot be the default.** Both are documented behaviour, and an app relies on each:
- DOCS ("Mutations") say a write answers `<affected row>` and executes `with RETURNING *`. lyceum's `login/redeem` is a `delete` whose returned row names who signs in. The `gatekeeper` role runs it with `login_links.write.delete` and no `login_links.read`. Filtering the answer by read rules would answer `[]` and break sign-in.
- Moving a row out of one's own rules is how "hand this task to a colleague" works under `update: [{ match: 'owner_id', to: 'userId' }]` with `set: { owner_id: … }`. Refusing every move breaks that.

**Design.** Two booleans on the mutation config, both off by default:
- `checkMovedRows: true`
  - Applies to an `update`, and to an insert's `onConflict` update, that writes a column one of the caller's update `match` rules names. The new value must match that rule too.
  - It is compiled into the same statement: `WHERE <their where> AND (<the SET expression's SQL>)::<the column's type> = ANY($scope)`, or `= $scope` for a single value.
  - The SET expression's own text and parameters are reused. The cast is to the introspected column type (`integer`, `uuid`, …), the same type text `insertEach` already uses. Without the cast, Postgres reads the shared parameter as text and SET refuses it.
  - A row that would leave the caller's rules is not written, and the answer is `[]`, as for a row outside the rules today.
- `answerReadableRows: true`
  - An `update`, a `delete`, and an insert with `onConflict … set` answer only the rows the caller's read rules show.
  - It is compiled as one extra returned column, `RETURNING *, (<read rules>) AS "vex:readable"`, which vex strips.
  - A read rule whose scope value the host left out hides the row; it does not refuse the write.
  - A plain insert answers the row it created, as today: nothing in it came from anyone else.
  - `WriteResult` gets an optional `readable` (the rows the read rules show), present only on a statement compiled with this option. `rows`, `onWrite`, `$returned` and `tablesChangedBy` keep every written row.

Where the options go:
- `executeWrites` reads them from `MutationContext`.
- The handler's `mutations` config takes them.
- The Hono adapter's `mutations` type takes them and passes them on (until now it rebuilt `mutations` as `{ client, policy, onWrite }` and would have dropped them).
- The Express adapter takes them through the handler's type.

With both off, statement text, parameters and returned rows are exactly today's. The check confirmed this for insert, upsert, delete, batch and `$lookup`; moss's test that compares statement text passes.

**What changes for a working app.** Nothing until it sets an option.
- moss mounts its routes through the Hono adapter with `mutations: { client, onWrite }`. To opt in, moss would pass the options itself. That is not proposed here.
- What stays open: an app that does not opt in keeps both holes. A later approved break could turn `checkMovedRows` on by default.

**Owner to confirm** (only if the owner wants the default changed now): moving a row out of one's own `match` rules is never legitimate. Example it would break: handing a task over by setting `owner_id` under an `owner_id = me` update rule.

**Test** (`test/mutations/write-guard.test.ts`, 10 cases):
- With both options on:
  - `{ id: 't1', projectId: 'pB' }` under `projectIds: ['pA']` → 200 `[]`, and t1 stays in pA.
  - The same under `['pA', 'pB']` → the moved row.
  - The same move through `onConflict` → `[]`.
  - The desk rename of t2 → `[]`, while t2's title did change.
  - The caller's own t1 → the full row.
  - A read rule with no scope value → `[]`, not a 500.
  - An open policy → the full row, as today.
- Through the Hono adapter, on a table with an `integer` and a `uuid` match column:
  - An integer moved to an allowed value → the moved row; to a value the rule does not allow → `[]`.
  - A uuid set to its own value → the row; to another team → `[]`.
  - Options off → the row, and `onWrite` sees `{ table, op, rows }` with no `readable`.
- The checker's `p1on.mjs` against this prototype: "uuid team same" succeeds; moves outside the rules come back empty.

**Size.** About 95 src lines:
- `mutations/engine.ts`: about +80 / −22
- handler: +4
- Hono adapter: +6
- Express: nothing beyond P4

Tests: about 140 lines. **New mechanism: yes** — two public options on the mutation config, and an optional `readable` field on the exported `WriteResult` type (additive).

---

## P2 — `engine.execute` serves an entry's reach

**Problem.** Seeded entry `tasks/mine` declares `reach: 'personal'`.
- moss `answerIntent` replays it through `engine.execute` with the caller's merged widest policy, and gets both rows of the tenant (`mine`, `theirs`).
- `handleQuery` gets only `mine` (`t8.mjs`).

DESIGN ("Reach is the caller's, not the table's") says an entry's reach narrows the read whoever asks. DOCS line 885 says `engine.execute` does not read it. Root cause: reach is enforced only in the handler.

**Design.**
- One optional field on `ExecuteOptions`: `policyForReach?: (reach) => ScopePolicy | undefined | Promise<…>`. It is the same shape the handler already takes.
- When a replayed entry declares a reach:
  - with `policyForReach`, the run uses the policy it returns; `undefined` throws `scope_denied`;
  - without it, the run uses the policy it was handed, as today, and logs one `console.warn` per fingerprint saying the entry was served without its reach.
- The handler already narrows before calling the engine. It passes `policyForReach: () => <the policy it narrowed to>`, so the engine neither asks twice nor warns.
- moss:
  - `AnswerIntent`'s caller gets an optional `policyAtReach`.
  - `data.ts` passes `(reach) => policies.atReach(who, reach)`.
  - That is 2 lines of `src`, plus the type.

**What changes for a working app.**
- vex alone: nothing — a new optional field and a warning.
- **Needs the owner's yes:** with moss's change, `answerIntent` replaying an entry that declares a reach answers fewer rows, or refuses when the principal's roles have no such reach. That is what `/api/vex` already answers the same principal. No lab app replays a reach entry through `answerIntent` today (checked).
- An app calling `engine.execute` itself keeps today's rows until it passes `policyForReach`; the warning names the entry.

**Tests.**
- vex, `test/engine/engine-reach.test.ts`:
  - The merged policy plus `policyForReach` → `[{ title: 'mine' }]`.
  - `() => undefined` → `scope_denied`.
  - Without it → both rows, and one warning for two replays.
  - Through `handleQuery` → `mine`, and no warning.
- moss, written and run:
  - `test/data-intents.test.ts`, "a replay of an entry that declares a reach": `notes/mine` asks `policyAtReach('personal')` and is refused when that policy reads nothing.
  - `test/data.test.ts`, "answers a replay of an entry that declares a reach at that reach": `data.answerIntent(…, { fingerprint: 'notes/mine' }, who('reader'))` → `scope_denied`, because the reader has no `personal` reach, while `notes/all` still answers.
  - Both fail with today's moss source.

**Size.**
- vex: about 35 src lines (`types.ts` +4, `runtime.ts` +30, handler +2); test about 50 lines.
- moss: 3 src lines; tests about 30 lines.

**New mechanism: no** — it is the handler's existing option, on the engine.

---

## P3 — Discovery lists under the engine's policy

**Problem.** Take `createQueryEngine({ scope: denyPolicy })` with a handler that passes no policy: Express always does this, and Hono does when it has no `getPolicy`. Then `GET` lists the denied `secrets` table with every column, plus every fingerprint with its intent, context and write effect (`t3.mjs`). Root cause: `handleDiscovery` filters only by the handler's `scopePolicy` and cannot see the engine's own.

Separately, each listed table's `rowCount` is the whole table's count across tenants, even under a per-request policy.

**Design (listing).**
- `QueryEngine` gets an optional read-only `scopePolicy`: the policy given to `createQueryEngine`.
- `handleDiscovery` lists under `config.scopePolicy ?? engine.scopePolicy`, the policy a query on that endpoint would run under.

**What changes for a working app (listing).** **Owner to confirm:** an endpoint whose engine has a policy and whose handler has none stops listing tables and entries that policy refuses to run anyway.
- moss passes a policy on every discovery call (its routes' `getPolicy`, `fingerprintsFor`, its own entries), so moss's listing does not change.
- Adding an optional member to the exported `QueryEngine` type is additive: a hand-written engine double still type-checks.

**`rowCount` — needs owner decision, not proposed as a change.** Showing `rowCount` only where the caller may read every row would change moss's `GET /api/vex` (lyceum) and relay's dev discovery: every table read under a row rule would lose its count. The non-breaking step is a DOCS line saying the count is the whole table's, whoever's rows. Hiding it is a later approved break, or an opt-in if the owner prefers.

**Test** (`test/handler/discovery-engine-policy.test.ts`, first three cases):
- An engine with a tenant policy and a handler with none → discovery lists `tasks` and only `tasks/mine`, not `secrets` or `secrets/all`.
- An engine with no policy → both tables and both entries, as today.
- Hono without `getPolicy` → `tasks` only.

**Size.** About 6 src lines (`types.ts`, `runtime.ts`, `handler.ts`); test about 50 lines. **New mechanism: no.**

---

## P4 — The Express adapter takes the per-request policy hooks

**Problem.** `VexExpressConfig` has no `getPolicy` or `getPolicyForReach`.
- Every entry with a reach answers 500 there ("this handler has no policyForReach").
- Discovery there is unfiltered.
- DOCS line 885 names Express among the paths that enforce reach.

**Design.**
- Add `getPolicy(req)`, `getPolicyForReach(req, reach)` and `onExecute` to `VexExpressConfig`.
- They are built the way the Hono adapter builds its request config: the request's policy governs reads, discovery and writes, and `mutations.policy` applies when `getPolicy` answers `undefined`.
- PATCH and DELETE keep the operator config, as in Hono.

**What changes for a working app.** Nothing: these are three new optional fields. The DOCS sentence "It has no per-request policy hook" goes.

**Test** (same file, last two cases):
- Express with `getPolicy` → `GET` lists `tasks` only.
- With `getPolicyForReach` → `tasks/mine` answers 200 `[{ title: 'mine' }]`, where today it answers 500.

**Size.** About 20 src lines; test about 30 lines; DOCS about 5 lines. **New mechanism: no** (it brings Express level with Hono).

---

## P5 — An unlocked endpoint can turn fingerprint management off *(not prototyped)*

**Problem.** On an unlocked mount, `PATCH` and `DELETE` check nobody. Any caller can unprotect a seeded entry, delete it, or generate over it. Fingerprints are global, so the locked endpoints then replay the changed entry, and a regenerated entry has lost its reach. README recommends exactly such an endpoint for agents and users, and documents that it checks nobody.

**Design.**
- One boolean, `manageFingerprints`, on `VexHandlerConfig`, `VexHonoConfig` and `VexExpressConfig`.
- `false` answers `PATCH` and `DELETE` with 403 `locked` ("fingerprint management is off on this endpoint"), exactly as a locked endpoint does today.
- Left unset, it behaves as today, and the first `PATCH` or `DELETE` such a handler answers logs one `console.warn` naming the option.
- README's recommended agent endpoint sets `manageFingerprints: false`.

**What changes for a working app.** Nothing but one warning line.
- What stays open: an app that does not set it keeps today's open management.
- Making `false` the default is a later approved break. It would refuse a request that works today: an admin console unprotecting an entry through its agent endpoint.

**Test.** On an unlocked Hono mount:
- With `manageFingerprints: false`: `PATCH { fingerprint: <seeded>, protected: false }` → 403 `locked`, and the entry stays protected.
- Without the option: 200, as today, plus one warning.

**Size.** About 15 src lines; test about 30 lines; docs about 8 lines. **New mechanism: yes** — one public option on three configs.

---

## P6 — `sortBy` restricted to returned columns (opt-in) *(not prototyped)*

**Problem.** A locked replay of an entry that returns `tasks.title`, sent with `context: { sortBy: 'tasks.salary', sortDir: 'desc' }`, comes back ranked by salary — a column the entry does not return (`t3.mjs`).

**Why it cannot be the default.**
- DOCS define `sortBy` as an `entity.field` that is schema-validated: any column of the entry's tables.
- relay sorts its deals table by `sortBy: 'deals.created_at'` by default. Sorting a list by a column it does not show is ordinary.
- Vex's access rules are per table and per row. A column the entry's author did not select is not something a rule denies.

**Design.**
- One engine option, `config.sortByColumns: 'any' | 'returned'`, default `'any'` (today's behaviour).
- With `'returned'`, `applySortContext` accepts only a selected field path, a compute name or an aggregate name.
- Anything else is refused with `invalid_request` (`sortBy "tasks.salary" is not a column this entry returns`).

**What changes for a working app.** Nothing until it sets the option. What stays open: an app that does not opt in can still have a hidden column's order read through `sortBy`. DOCS gain one sentence saying so.

**Test.** On an engine with `sortByColumns: 'returned'`:
- `tasks/names` with `sortBy: 'tasks.salary'` → 400.
- With `sortBy: 'tasks.title'` → sorted rows.
- The same replay on an engine without the option → today's rows.

**Size.** About 15 src lines; test about 25 lines. **New mechanism: yes** — one public engine option.

---

## P7 — `null` counted as a value on the write path

**Problem.** Two presence checks on the write path test `=== undefined` only.
- **`upsert` sugar.** `{ id: null, title: 'x' }` becomes `UPDATE … WHERE id = NULL`: nothing is written, and the answer is 200 `[]` (`t1.mjs`).
  - DOCS say an upsert inserts "when the key is absent or an empty string". `null` is neither, so this is the documented branch.
  - It is the wrong branch for a JSON client that sends `null` to mean "new".
- **`requireScope`.** A host scope value of `null` passes. A write whose rule stamps that key writes NULL: a row owned by nobody. The comment beside the call says this case is meant to be refused. On a read, and in a write's WHERE, a null scope value matches no row, which is harmless.

The general form (third review 6) is documented, not a defect. An upsert whose update branch matches no row (a client-chosen new id, another tenant's id), or an `insert … onConflict` on another tenant's row, answers 200 `[]`. DOCS call that the result of a write that matched nothing ("an UPDATE the scope narrowed to nothing carries zero rows"). Telling "no such row" apart from "not yours" would reveal another tenant's ids.

**Design.**
- **`upsert`.** A `null` key means "insert" where the database makes the key: the key column has a default in the introspected schema (`gen_random_uuid()`, a sequence, …).
  - On a key with no default, `null` stays today's update of no row.
  - Inserting there would fail with a not-null violation, turning today's 200 `[]` into a 500 (23502). The check showed that with `p7.mjs`.
  - Built: one condition in the `upsert` sugar, which now also receives the introspected schema.
- **`requireScope`** *(not prototyped)*. `executeWrites` logs one `console.warn` per scope key when a rule would stamp `null` from it, for example: "scope key userId is null: this write stamps NULL into tasks.owner_id". Refusing it is a later approved break.
- **DOCS**, Mutations: "a write that matched no row answers `[]`; check the length."

**What changes for a working app.**
- **Owner to confirm:** on a table whose key column has a default, `upsert` with `key: null` inserts a row, where today it writes nothing and answers `[]`. An app relying on "a null id writes nothing" is not plausible; an app sending null for "new" is broken today. Tables whose key has no default answer exactly as today.
- The null-scope part changes nothing but a log line. What stays open: a NULL stamp is still written. Example that refusing it would break: an anonymous feedback table whose insert rule stamps `user_id` from a `userId` the host sets to `null` for visitors.

**Test** (`write-guard.test.ts`, the upsert case):
- With no default on `tasks.id`: `{ id: null, title: 'kept' }` → 200 `[]`.
- After `SET DEFAULT gen_random_uuid()` and a fresh introspection: `{ id: null, title: 'new' }` → the inserted row.
- `p7.mjs` against this prototype → 200 `[]`, as today.

**Size.** About 12 src lines (the warning about 8 of them, not built); test about 25 lines; docs about 4 lines. **New mechanism: no.**

---

## P8 — A caller's wrongly typed value: the log and the status *(not prototyped)*

**Problem.**
- `{ ids: 't1' }` on an `in` list, or `{ min: 'abc' }` on an integer column → 500 `{ error: '22P02', message: 'malformed array literal…' }`.
- The server log prints the whole driver error, including the SQL and every bound parameter — the caller's scope values among them.
- `sortBy` on a `distinct` entry → 500 `42P10` (`t7.mjs`).

**Design.**
- **The log.** The handler's line for an unhandled error prints the error's code, message and SQL text, never its bound parameters (`handler.ts:456`).
- **The status.** 400 only for an error Postgres attributes to a value the caller sent:
  - Postgres reports a value that does not fit its column with the context `unnamed portal parameter $N = '…'` (the `where` field). PGlite shows this in `t7.mjs`; it comes from Postgres's bind step.
  - When that `$N` is a `$context` slot of the compiled statement, the engine throws `invalid_request` naming the context key, with the SQLSTATE in `details`. The handler answers that with 400.
  - Everything else stays a 500 as today, including errors the caller did not cause: division by zero inside an entry's compute, numeric overflow in an aggregate, a bad stored value.
  - Not done: checking context values against the derived signature before running. Postgres accepts `'42'` for an integer, and a JavaScript type check would refuse it — a request that works today.
  - Not verified against node-postgres on a real Postgres here; only PGlite was available.
- **`distinct` with an unselected sort column — not built.** It stays a 500 for now. A resolve-time refusal must accept a compute or aggregate name, and a selected column under an alias (`{ field: 'tasks.title', as: 't' }` sorted by `tasks.title`). Otherwise it would refuse queries that run today. It would be decided on resolved columns, not on path text.

**What changes for a working app.**
- The log line: nothing an app sees.
- **Owner to confirm:** a request that fails today because its own context value does not fit keeps failing, with 400 `invalid_request` instead of 500 `22P02`. A client that branches on that 500 or that code would see the difference.

**Test.**
- `tasks/byIds` with `{ ids: 't1' }` → 400 `invalid_request` naming `ids`, and the captured log has no `params`.
- An entry computing `1 / { $context: 'n' }` with `n: 0` → still 500 (division by zero).

**Size.** About 25 src lines; test about 30 lines. **New mechanism: no.**

---

## P9 — `mergeScopePolicies` carries `public` and `write`

**Problem.**
- `mergeScopePolicies([{ default: 'deny', entities: { countries: { public: true } } }])` → `{ entities: {} }`: a hand-built public table is denied (`t9.mjs`).
- An entity's `write` umbrella is dropped the same way.
  - With `{ write: [tenant match], update: [] }`, today's merge gives `update: []`: updates across tenants, which the input policy itself refuses.
  - With `write` alone it gives no write phase at all.
- Separately: two roles whose rule sets have the same number of matches are not combined (the first one wins), and a `default: 'allow'` policy is dropped.

**Design.**
- Before choosing per phase, each listed entity is read as the phases it grants:
  - `public` grants all four phases with no rule.
  - `write` is spread onto insert, update and delete (matches only, for delete), as `createScopePolicy` already does.
  - `deny` grants nothing, so another role's grant stands. That is today's behaviour, and correct for a union.
- For what `createScopePolicy` produces — the only input moss gives it — the output is identical. moss's tests pass on the prototype.
- Equal-count rule sets and `default: 'allow'`: no change, and DOCS say so.
  - Combining two different rule sets (rows matching A or B) cannot be written in today's policy. It needs a form for alternatives: a new policy-grammar mechanism that every reader of a policy outside vex would have to learn.
  - A `default: 'allow'` policy merged with a deny-default one cannot be written per phase either: a phase that one role denies and no role grants would come out allowed.
  - Both stay as they are, failing closed.

**What changes for a working app.** **Owner to confirm:** a merged policy built from hand-written policies changes in two directions.
- **Wider:** a `public` table, and the phases of a `write`-only entity, are granted where today they are refused.
- **Narrower:** an entity written `{ write: [tenant match], update: [] }` merges to `update: [tenant match]`, where today it merges to `update: []`. An update across tenants that works through today's merge would match no row. The policy given to the merge already refused it, so today's merged answer was wider than any role permits (`p9.mjs`).
- Nothing changes for policies made by `createScopePolicy`.

**Needs owner decision:** whether to add an "any of these rule sets" form so that equal-count roles combine.

**Test** (`test/scope/merge-phases.test.ts`, 4 cases):
- `public` → all four phases with no rule.
- `{ read: [], write: [tenant], update: [] }` → insert, update and delete all carry the tenant match.
- A `deny` plus another role's `read: []` → `read: []`.
- Two `createScopePolicy` roles → exactly today's merge.
- The first two fail today.

**Size.** About 20 src lines (`scope/grants.ts`); test about 30 lines. **New mechanism: no** (the union part would be one).

---

## P10 — The "last used" stamp writes only `lastUsedAt`; the tiered cache's listing

**Problem.**
- **The stamp.** A replay reads an entry and, when a stamp is due, writes `{ ...entry, lastUsedAt }` back. A `PATCH` (unprotect) or a reseed that lands between the read and the stamp is undone.
- **The tiered cache stamp.** It stamps through `set`, which writes L1's copy to the shared L2. A process with an old L1 copy overwrites what another process wrote.
- **The tiered cache listing.** It has no `entries()`, so discovery lists no fingerprint and reports `protection: none`.

**Design (stamp) — proposal.**
- `CacheBackend` gets an optional `touch(key, lastUsedAt)`:
  - Memory updates the stored entry's `lastUsedAt` only.
  - Postgres runs `UPDATE … SET last_used_at = $2 WHERE key = $1`.
  - Tiered calls L1's `touch` and then L2's, when both levels have one.
- The engine and the handler call `touch` when the cache has it, and `set` as today when it does not (one helper, `touchEntry`).
- **Owner to confirm:** a host that wraps a built-in cache by spreading it and overriding `set` to watch writes no longer sees the "last used" stamps there; they go through the inherited `touch`. Every other write still goes through `set`. One vex test counted stamps that way and now counts `touch` as well.

**Listing — needs owner decision.** Adding `entries()` to the tiered cache (from L2, the level every process shares) is built and tested. It changes a reference app:
- Both lyceum runtimes, `postgres-runtime.ts` and `runtime.ts`, use the tiered cache, so moss's `fingerprintsFor` (discovery underneath) answers `[]` there today. With `entries()` it lists every entry the caller's policy reaches.
  - Through `replayable`, generated actions and fragments, and published defaults, whose endpoint replays a shipped entry, are then kept and shown instead of being left out (`artifactory/generated.ts:48`, `artifactory/running.ts`, `server/server.ts:153`).
  - `/api/integrations/contract` lists those fingerprints.
  - `GET /api/vex` lists fingerprints, and `protection` goes from `none` to `all` or `some`.
- Each call reads the whole Postgres cache table: discovery and every `fingerprintsFor`.
- L2 writes are fire-and-forget, so an entry set a moment ago can be missing from the list.

The non-breaking alternative is to leave the tiered cache without `entries()` and say in DOCS that discovery over it lists nothing.

**Test** (`test/cache/touch-race.test.ts`; both fail today):
- A cache whose `get` lets another writer unprotect the entry before the stamp → after the replay the entry stays unprotected and has a `lastUsedAt`.
- A tiered cache with a seeded L2 and lazy warm-up → discovery lists `notes/all` with `protection: 'all'`. This one belongs to the listing decision.

**Size.** About 35 src lines (types +2, memory +5, postgres +4, tiered +16, util +4, engine and handler 1 line each); tests about 45 lines. **New mechanism: yes** — an optional method on the public `CacheBackend` type. A custom backend need not implement it.

---

## P11 — `exists` inside an aggregate's `case`

**Problem.** `aggregate: { n: { sum: { case: { when: [{ condition: { exists: { from: ['secrets'] } } … }] } } } }` passes the schema, then the compiler refuses it: "An `exists` filter was not resolved. It must appear in a query's own filter." The message is misleading: the same `case` works in `compute`. It fails closed.

Root cause: `resolveAggregatePaths` calls `resolveComputePaths` without the `exists` collector and the shared alias counter.

**Design.** Pass both through (`engine/resolver.ts`, 4 lines). The `exists` then joins the query's collected `exists` nodes, so the scope check and the row rules reach it like any other.

**What changes for a working app.** Nothing: a query refused today is answered.

**Test** (`test/engine/aggregate-exists.test.ts`):
- Under a tenant rule on `secrets`, tenant A's `sum(case when exists(secrets where val = 'b-secret'))` → `[{ n: 0 }]`, and the SQL carries `s1.tenant_id = $1` inside the `EXISTS`. This fails today.
- With `secrets` absent from the policy → `scope_denied`.

**Size.** 4 src lines; test about 35 lines. **New mechanism: no.**

---

## P12 — Tables named with the adapter's schema (opt-in) *(not prototyped)*

**Problem.** `createPostgresAdapter({ pool, schema: 'app' })` introspects `app`, but reads and writes name tables bare (`FROM tasks`), so the app must also set `search_path`. Mutations never see the option at all.

**Why it cannot be the default.**
- An app may introspect one schema and set `search_path` per connection: a schema per tenant, read through a template schema. It gets other rows if vex starts writing `app.tasks`.
- Carrying the schema inside `entity.table` would change the schema fingerprint and make every cached entry stale.

**Design.**
- One adapter option, `qualifyTables: true`.
- With it, introspection writes the schema name on the introspected schema as `DatabaseSchema.namespace`. The field is optional and left out of the schema fingerprint, so cached entries stay fresh.
- The adapter's compiler writes every table as `"app".tasks`: FROM, JOIN, CROSS JOIN and `exists`.
- The mutation compiler, which already receives the introspected schema, does the same for INSERT, UPDATE, DELETE and `$lookup`.
- The name has one source: the adapter's option.

**What changes for a working app.** Nothing without the option. `DatabaseSchemaSchema` gains an optional field; that is additive, and parsing an old schema object still succeeds.

**Test.** PGlite with `CREATE SCHEMA app`, `app.tasks`, and no `search_path`:
- With `qualifyTables`, a read and an insert succeed.
- Without it, they fail as today ("relation does not exist").

**Size.** About 30 src lines; test about 40 lines. **New mechanism: yes** — one public adapter option and one optional schema field.

---

## P13 — A literal form for text that looks like a column *(not prototyped; needs owner decision)*

**Problem.** `{ eq: ['tasks.domain', 'example.com'] }` is refused. Any string shaped `word.word` is read as a column, and the entity scan then reports `example` as a table not listed in `from`. The workaround today is to pass the text as `$context`.

**Design.**
- One value form, `{ $value: 'example.com' }`: text always written as a quoted literal, never read as a column.
- It joins `FieldOrValueSchema` as one more strict object, with a `.describe()` saying when to use it.
- The compiler quotes it like any literal. Every walker already ignores an object that is not `$context` or `$scope`, so the entity scan stops seeing a table in it.

**What it changes.** Queries that work today are unchanged, but three published things change:
- **The exported `FieldOrValue` union gets a member.** Code outside vex that switches over every member with an exhaustive check would need a case. There is none in the repository; loom walks `QuerySchema` and must be checked against the new member.
- **The DSL JSON Schema** that discovery serves (`dsl`) and `getDslSchema()` returns gains the form.
- **The query agent's prompt** embeds that schema, so the model is offered the form. Per STYLE_GUIDE, that description edit is reviewed by a subagent before it lands.

**Needs owner decision:** a new grammar form, or keep `$context` as the only way.

**Test.** A seeded entry with `{ eq: ['tasks.title', { $value: 'secrets.val' }] }` → the rows whose title is that text, no `invalid_dsl`, and `discoverEntities` does not contain `secrets`.

**Size.** About 15 src lines; test about 25 lines. **New mechanism: yes** (a grammar form).

---

## P14 — `null` for an optional key *(not prototyped)*

**Problem.**
- `engine.execute({ fingerprint, intent: null })` → `invalid_request` (confirmed); the handler answers 400.
- The query agent's `testQuery` drops only top-level nulls, so a nested `"dir": null` is refused there.
- The agent's final answer is refused by cortex's output check against `QuerySchema`, and the model is asked again.
- Wrapping the exported schemas in a preprocess changes their types (it broke loom's walker), so the schemas stay as they are.

**Design.**
- **`engine.execute` and `handleQuery`.** A top-level `intent` or `fingerprint` that is `null` is removed before the request is parsed. `context` is never touched: a null context value means something (P7, optional keys).
- **`testQuery`.** Parse the query as sent. Only if that fails, try once more with every object key whose value is `null` removed (array elements are left alone: `null` is a literal there). If that parses, run it; if not, report the errors of the query as sent.
  - When dropping could remove a null that means something: in the query grammar a `null` object value can mean something only as a literal in `case.when[].then` or `case.else`. Both keys are required, so a query that loses one no longer parses. The retry then reports the original errors, and the query stays refused as today.
  - So the retry never changes what an accepted query means. Its one cost: a query with both a stray null optional key and a null `then` or `else` stays refused.
- **The agent's final answer** stays as it is: cortex refuses it and the model is asked again. Changing that is cortex's output check, in another package.

**What changes for a working app.** Nothing: only requests and test queries refused today are accepted. What stays open: the final-answer retry.

**Test.**
- `engine.execute({ fingerprint: 'tasks/one', intent: null, context: { id: 't1' } })` → the row.
- `testQuery({ from: ['tasks'], fields: ['tasks.title'], sort: [{ field: 'tasks.title', dir: null }] })` → rows, no errors.

**Size.** About 12 src lines; test about 20 lines. **New mechanism: no.**

---

## P15 — Missing context on an object-shaped entry *(not prototyped; docs)*

**Problem.** Take a seeded entry with `shape: { title: '' }`.
- With its context key missing, it answers `result: []` and `meta.missingContext`.
- With the key present and no row, it answers `null` (confirmed).

**Position.**
- The consistent answer, `null`, is breaking: an app reading `result.title` on that response gets `undefined` today and would throw on `null`.
- Proposed now: DOCS state that a request missing context answers `[]` with `meta.missingContext`, whatever the entry's shape.
- Answering `null` for an object shape is a later approved break.

**What changes for a working app.** Nothing.

**Needs owner decision:** whether to schedule the break.

**Test** (for the break only): that entry with `context: {}` → `result: null`, `meta.missingContext: ['id']`.

**Size.** About 3 DOCS lines. **New mechanism: no.**

---

## P16 — One walk over the filter tree *(not prototyped; needs owner decision)*

**Problem.** Five functions each walk the filter grammar by hand:
- `scope/discover.ts` (tables)
- `resolver.collectFilterPaths` (paths)
- `mutations/engine.filterColumns` (write columns)
- `engine/optional.ts` (optional keys)
- `mutations/signature.walkFilter` / `deepScan` (context keys)

Each new operator means five edits.

**Why it is a decision and not a tidy-up.** The five treat `exists` and `optional` differently today, on purpose:
- discovery adds an `exists` body's tables and refuses an `optional`;
- the resolver builds an `exists` as its own level;
- the mutation walker skips both, because the compiler refuses them in a write;
- `optional.ts` walks only `and`/`or`/`not`/`optional`;
- the signature walks generically.

A shared walk must leave each of those choices with its caller. Getting one wrong is a security bug, because a walker that misses a node misses a table, as discovery's own comment says.

**Design.** One internal function next to the grammar (`schemas/`), `filterParts(filter)`. For each node it names the field positions, the value positions, the child filters, and the `exists`/`optional` body. Each of the five keeps its own decision about what to do with a part, `exists` and `optional` included, and drops only its own traversal.
- One commit that moves code and changes no behaviour, with the whole suite as the proof.
- Plus a test that every `Filter` variant is visited.

**What changes for a working app.** Nothing.

**Needs owner decision:** whether the saving (one place per new operator) is worth touching the scope walker.

**Size.** About −150 / +70 src lines (estimate); test about 30 lines. **New mechanism: no** (the function is internal, not exported).

---

## P17 — Delete the dead join branch *(not prototyped)*

**Problem.** `compile.ts` handles a join whose source is a subquery. But the resolver builds joins only between table sources (`resolve`, `entitySources`); subquery sources are always cross-joined.

**Design.** Delete the `joinSource.subquery !== undefined` branch (3 lines).

**What changes for a working app.** Nothing.

**Test.** The existing suite.

**Size.** −3 lines. **New mechanism: no.**

---

## P18 — DESIGN decision 1 without its dated history *(not prototyped; docs)*

**Problem.** DESIGN.md, "Key design decisions" 1, still has the paragraph beginning "It was not, until 2026-09-24…": the history of a fixed defect.

**Design.** Remove that paragraph. The decision's current rule (the three ways text reaches a statement) stays. A docs-only package change carries a patch changeset.

**What changes for a working app.** Nothing.

**Size.** About −10 lines of DESIGN.md. **New mechanism: no.**
