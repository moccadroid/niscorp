# Fix proposals — tide and strata (against review-fix/all-check)

**What changed in this revision** (after an independent check; its scripts are in `scratchpad\proposal-check\tide-strata\`):
- P-T5 rethought: the claim size goes back to `limit`; instead each task's lease starts again as its effect starts, and only if the claim is still this engine's, using a clock the host passes to `advance` (the driver passes its own). The checker's real-time two-engine run (`break2`) now runs each task once; the earlier "claim fewer tasks" form lost throughput and still ran a task twice.
- P-T3's catch-up after a restart is now an opt-in `load(…, { resume: true })`; the default stays as today and goes to the owner. The boot-order wait and the one-at-a-time loads stay as fixes.
- P-T4 uses the smaller fix: parse as today, keep the string itself only where parsing fails. No probe; no value changes except for values that throw today.
- P-S1 no longer throws on a key that does not come back exactly as stored (a timestamptz with microseconds): that row is named and left, as nothing was written to it today either. Labelled: moss discards the report, so `unread` is silent under moss; stored documents with a non-number entry are now refused where they are read.
- P-S3's check on files strata did not write applies only to a work folder the host chose, and ignores a byte-order mark.
- P-T2 no longer uses `notIn` (`STORE_CONTRACT` never checks that a store supports it); its retry timing is labelled.
- P-T8's agent half labelled (not prototyped; sends back drafts accepted today). P-T1's graph part labelled: it assumes a write carries its writer's identity, and today's check over-reports but never misses, so relaxing it goes to the owner.
- Tests: tide 272 existing + 20 new pass; strata 111 existing + 12 new pass except the one existing test P-S3 changes on purpose.


Checked against `C:\Users\manxx\Development\niscorp\.claude\worktrees\fix-all-check` (built dist, PGlite), changing nothing there. Every claim below was run, not only read: the third review's repro scripts were rerun against the built packages, and each proposal with code was prototyped on a copy in `scratchpad\proposals\tide-strata\` with tests that fail on today's code and pass on the prototype.

- tide copy: `tide-strata\tide` — the existing 272 tests and 20 new ones (`test\proposals.test.ts`) all pass; `tsc` clean. Diff: `tide-strata\tide-prototype.diff`.
- strata copy: `tide-strata\strata` — the existing 111 tests pass except one whose expectation the work-directory proposal changes on purpose (P-S3); 12 new tests (`test\proposals.test.ts`) pass; `tsc` clean. Diff: `tide-strata\strata-prototype.diff`.
- Unmodified sources kept beside them (`tide-src-original`, `strata-src-original`).

**What no proposal does:** none appends a migration to `TIDE_SEQUENCE` or any sequence, adds a column, adds a field to the `TideStore` interface, or adds a check to `STORE_CONTRACT`. Appending any migration to `TIDE_SEQUENCE` would stop a moss app that names it in `runtime.tables` (lyceum, with `migrate: false`) from booting until `nisc migrate` runs, because a boot checks that nothing is pending. Where a real fix needs one of those, the item is marked "needs owner decision" and the proposal says what ships without it and what stays open.

**Owner's standing rules.** Ids: P-T9 moves the ids the Postgres store mints to UUIDs (new rows only). `created_at`: no proposal adds a table or a kind of row; `tide_run` and `tide_work` carry `created_at` already; `tide_fact` carries the caller's `at` and no `created_at`, which no proposal changes (adding one is a migration).

## Items → proposals

| # | Item (source) | Proposal | Status |
|---|---|---|---|
| 1 | TIDE-4: failed fan-outs at the head of the queue block every other run's fan-out | P-T2 | proposal (Owner to confirm) |
| 2 | TIDE-5: memory store claims strictly in order, Postgres takes serial groups first; contract does not catch it | P-T6 | proposal |
| 3 | TIDE-8 / R3 tide 6: ids are time + per-process counter, two processes collide | P-T9 | proposal (Owner to confirm) |
| 4 | TIDE-9 / R3 tide 9b: `duplicate_unit` also used for "selection exceeded maxFanOut" | P-T10 | already handled — the code never reaches a host; one DOCS sentence |
| 5 | A claim takes up to `limit` tasks under one lease and runs them one after another | P-T5 | proposal (new optional `advance` field) |
| 6 | `sweep`'s separate `tasks` horizon; DESIGN says separate horizons were removed | P-T10 | docs only — DOCS is right, DESIGN is stale; checked that it re-runs nothing |
| 7 | `tide_fact_due` index is on `at`; the delayed-fact read filters on `not_before` | P-T12 | needs owner decision |
| 8 | STRATA-2: embedding paths have no version | P-S6 | needs owner decision (workaround already in README) |
| 9 | STRATA-4: a stamp entry that is not a number reads as current | P-S1 | proposal (Owner to confirm) |
| 10 | STRATA-5: `INVALID_SEQUENCE` used for six unrelated errors | P-S5 | needs owner decision (docs now) |
| 11 | exported `verifySourceUpgrade` checks no schema | — | already fixed: README says "`verifySourceUpgrade` compares JSON only; `runSourceUpgrade` checks the schemas as well"; it is synchronous and a Standard Schema check can be asynchronous, so a schema option cannot be added without changing its return type |
| 12 | strata tests leave temp folders | P-S7 | proposal (tests only) |
| 13 | R2 S1 / R3 tide 1: a `manual` fact skips the identity check | P-T1 | proposal (Owner to confirm) |
| 14 | R2 S1: the same door lets anyone ingest a `run` settlement fact inside a tenant | P-T1 | proposal (Owner to confirm) |
| 15 | R2 S2: the dedupe key leaves out `as` | P-T1 | docs now; needs owner decision for the index |
| 16 | R2 S2: the cycle check links reflexes of different identities | P-T1 | needs owner decision (prototyped) |
| 17 | R2 S3: `effectProblem` checks a templated input as literals | P-T11 | needs owner decision |
| 18 | R2 S3: a one-shot clock accepts a date that does not exist | P-T8 | proposal (agent half: Owner to confirm) |
| 19 | R2 S3: strata checksum drops `--` lines inside a string literal | P-S4 | docs now; needs owner decision for the real fix |
| 20 | R2 S3: `prepare([null])` throws TypeError | P-S2 | proposal |
| 21 | R2 C: `upgradeStore` locks and loads every row in one transaction | P-S1 | proposal (loads only stamps; the lock stays) |
| 22 | R2 C: `verify` compares stamps by key order | P-S3 | proposal |
| 23 | R2 C / R3 strata 4: two ids that clean to one name share one expected file | P-S3 | proposal |
| 24 | R2 S3 (suspected): a stamp column that is not jsonb reads as `{}` | P-S1 | confirmed real — it re-applies every migration; proposal |
| 25 | R3 tide 2: catch-up after downtime never applies; a one-shot timer due during a restart never fires | P-T3 | needs owner decision (opt-in `resume` ready; the default is the owner's) |
| 26 | R3 tide 3: `fromColumn` JSON.parses jsonb the driver already parsed | P-T4 | proposal |
| 27 | R3 tide 4: batch longer than the lease is reclaimed, every effect runs twice | P-T5 | proposal (same as #5) |
| 28 | R3 tide 5: `fanOut` skips a pending run when nothing is loaded yet | P-T3 | proposal |
| 29 | R3 tide 7: two overlapping `load` calls finish out of order | P-T3 | proposal |
| 30 | R3 tide 8: the ±12 h offset probe misses transitions in +12/+13 zones | P-T7 | proposal (Owner to confirm) |
| 31 | R3 tide 9a: DESIGN says "first valid instant after", code shifts by the gap | P-T10 | docs only |
| 32 | R3 strata 1: `upgrade` overwrites and deletes a `REPORT.md` / `plan.json` it did not write | P-S3 | proposal (Owner to confirm; host-chosen folder only) |
| 33 | R3 strata 2: `verify` takes `from` from plan.json, not the lock | P-S3 | proposal (Owner to confirm) |
| 34 | R3 strata 3: stamp entry not a number (same as #9) | P-S1 | proposal |
| 35 | R3 strata 5: README silent on CREATE INDEX CONCURRENTLY; renamed sequence id reruns migration 1 without `complete` | P-S6 | docs only (the second is already in README) |

Counts: 35 item rows, 19 proposal sections (P-T1 to P-T12, P-S1 to P-S7). By row: 21 proposal (9 of them carry an "Owner to confirm" line), 1 tests only, 8 needs owner decision (3 of them ship a docs change now; 2 have a prototype ready — the cycle check and the restart catch-up), 3 docs only, 2 already fixed or already handled (#4, #11). Nothing was found already fixed in code: every repro still reproduces on review-fix/all-check.

---

## P-T1 The identity fence at every door

**Problem.** Identity equality is the documented rule "at every door" (DOCS: "a fact is only ever offered to reflexes running under the SAME identity"), but four places compare without it. Example: `ingest({ kind: 'manual', target: 'b.refund', payload: { amount: 99999 } }, { as: 'tenant-a' })` ran tenant B's disabled refund reflex as tenant B with A's payload (`d-manual.mjs`, still reproduces).

**Confirmed on fix-all-check.**
- Manual fact: `d-manual.mjs` prints `[{ reflex: 'b.refund', actor: 'tenant-b', input: { amount: 99999 } }]`. Cause: `match.ts` returns on `fact.kind === 'manual'` before `fact.as !== reflex.as`.
- Run fact: `ingest({ kind: 'run', reflex, runId, stats }, { as })` is accepted and wakes that tenant's `on: { fact: { run } }` reflexes with whatever stats the body carried.
- Dedupe: tenant A and tenant B each ingest `{ kind: 'signal', name: 'stripe', dedupeKey: 'evt_1' }` → A stored, B dropped as a duplicate (`UNIQUE_BY.fact` and the `tide_fact_dedupe` index have no `as`).
- Cycle: A's `orders → invoices` and B's `invoices → orders` are refused as one unguarded cycle (`graph.ts` keys watchers by entity alone), though neither identity's facts can reach the other's reflex.

**Design.**
1. `match.ts`: compare identity first, then let a manual fact skip `enabled` and arming as it does now. `fire()` already passes the reflex's own `as`, so firing by hand keeps working on a disabled reflex — arming gates triggers, not people, as DESIGN decides.
2. `ingest`: refuse `kind: 'run'` with `invalid_fact` ("a run fact is minted by tide when a run settles; it is not ingested"). The settler writes run facts through `admitFact` directly, so tide's own path is untouched. Manual facts stay ingestible (tide's own tests ingest one), now inside one identity only.
3. `graph.ts`: a write edge joins reflexes of the same identity only (watchers keyed by identity and entity); a run edge likewise; a reflex watching the run of a reflex under another identity gets a load warning ("its run facts never reach it"), not a refusal.
4. Dedupe: DOCS gains one sentence under `ingest`: a `dedupeKey` is unique per kind, entity and name across the whole ledger, not per identity; a host whose keys are unique only within a tenant puts the tenant in the key. The code fix is to add `as` to `UNIQUE_BY.fact` and to the index — that changes an exported constant a host store implements and needs a migration that drops and recreates `tide_fact_dedupe`, which a verify-mode boot refuses until migrated. **Needs owner decision**; what stays open until then: two tenants sharing a key value lose the second fact, announced as `fact.deduped`.

**What changes for apps and hosts.** moss's tide feature ingests only `write` facts, stamped with an identity → nothing. lyceum and lyra (`fire`, write facts) → nothing. tide's own suite → all 272 tests pass.
- Owner to confirm: a host that ingests a `manual` fact with no `as` aimed at a reflex that has an `as` (or with another identity's `as`) no longer runs it. That is the cross-tenant hole; no legitimate app can rely on it.
- Owner to confirm: `ingest` of a `kind: 'run'` fact now throws `invalid_fact`. No app in the repo does it; a host that did would be forging a settlement.
- **Graph part: needs owner decision.** It assumes a write carries the identity of the reflex whose effect wrote it — which under moss is decided by the app's `identity` callback on the write's scope, not by tide. If an app's callback maps a reflex's own writes to another identity, today's check (which links every watcher of an entity) still sees that loop; the prototype would not. Today's check over-reports (refuses some loads that could never loop) but never misses a loop. Relaxing it trades a refused load for a missed loop in such an app, so it is the owner's call; the prototype is ready (`graph.ts`, 7 lines), and if accepted, `graph().edges` and `LoadReport.cycles` stop listing edges between identities.

**Test (fails today).** (a) The `d-manual` scenario: the effect never runs; `fire('b.refund')` still runs it. (b) `ingest({ kind: 'run', … })` rejects with `invalid_fact`. (c) The two-tenant orders/invoices load answers `loaded: 2, cycles: []`. All in-process, no timing.

**Size.** src about 12 lines (match 2, ingest 1, graph 7, plus warning); tests about 45; DOCS/DESIGN about 6 lines; one patch changeset. **New mechanism: no.**

---

## P-T2 A run whose fan-out failed waits its turn

**Problem.** A fan-out that fails with anything but a `TideError` (a database down, a broken template) leaves the run `pending`, and the next advance reads pending runs oldest first with the same `limit`, so 100 such runs fill every page. Example: three runs of a reflex whose selection throws `ECONNREFUSED`, `limit: 3` → a healthy reflex's run behind them never fans out, on any number of advances; the failing selection is called again on every advance.

**Confirmed.** New test fails today: the healthy run stays `pending`.

**Design.** Each engine keeps, in memory, the runs it deferred and when each may be tried again. The pending read asks for `limit` plus the number of runs still waiting, oldest first, and passes over the waiting ones in code — so it uses only `where`, `order` and `limit`, which every store passes `STORE_CONTRACT` on. (The first version used `notIn`, which no contract check exercises: a host store that does not implement it would have broken.) The wait reuses the reflex's own `policy.retry` numbers (`baseMs`, `backoff`), growing over the first `retry.max` deferrals and then staying at that length — no new number. A run that fans out or is skipped is dropped from the memory. Also: with no reflex loaded, fan-out does nothing at all, as matching already does (P-T3 explains why).
Why memory is right here: what is kept is only pacing. After a restart each deferred run is tried once at once and then waits again — one extra attempt, nothing lost. Two engines each keep their own; each tries a run at most once per its wait. The run itself stays `pending`, past its due time, visible to a query, as DESIGN wants.
`retry.max` does not end the run: DESIGN keeps a deferred run until its seam or its reflex is fixed (skipping it loses the occurrence for good, the defect DESIGN records). That is a decision, not a gap.

**What changes for apps and hosts.** A deferred run is retried after a wait instead of on every advance, and runs behind it fan out. `run.deferred` events still fire per attempt (fewer of them). No option, no column, no store field, no new store feature.
- Owner to confirm: a run deferred by a short outage fans out later than today. With the default policy (`baseMs` 60 000, exponential, `max` 3) a run deferred by a 5-second outage fans out on the first advance after 60 s, not on the next advance; repeated deferrals wait 120 s, then 240 s. A reflex can shorten this with its own `retry.baseMs`.

**Test (fails today).** Three runs of a reflex whose `select` throws, then a healthy run; `advance({ limit: 3 })` five times → the healthy run is `settled`, and the failing `select` was called 3 times (once per run), not once per run per advance. Restart: a second engine on the same store tries each deferred run once on its first advance — the honest restart test, since only the store crosses between the two.

**Size.** src about 16 lines (fan-out 14, the engine's map 2); test about 25. **New mechanism: yes, small and internal** — a per-engine map of deferred runs; no public surface.

---

## P-T3 What the engine keeps in memory is not history

One root cause for three items: the engine treats its in-memory loaded set as a record of the past.

**Problems.**
1. Catch-up after downtime never applies. `load` moves the clock watermark up to `at` for every reflex "entering the set", and "entering" means "not in this process's memory", so after a restart every reflex enters. Example (`a-restart.mjs`): a daily 03:00 reflex, down 3–5 March, rebooted with `load(…, { at: Date.now() })` as README and lyceum do → no runs, no skipped rows; `catchUp: 'run'`, the default, never applies to real downtime. A one-shot timer due 09:05 during a restart from 09:03 to 09:07 never fires, and `nextDue` is `undefined`.
2. `fanOut` skips a pending run whose reflex is "no longer loaded" even when nothing is loaded yet (`e-boot.mjs`): the driver advances on an ingest before `load` has finished at boot → `billing.monthly 2026-04: skipped: reflex is no longer loaded`, nobody charged.
3. Two overlapping `load` calls finish out of order (`h-load.mjs`): loads of `[x,y,z]` then `[x,z]` leave `[x,y,z]` loaded — a deleted reflex is loaded again. lyceum calls `reload` on boot and on every save.

**Confirmed.** All three repros reproduce on fix-all-check.

**Design — fixes (2 and 3).**
- `fanOut` does nothing while no reflex is loaded — the matcher's existing rule ("with ZERO reflexes loaded the pass does nothing at all"), applied to the next stage.
- Loads run one at a time: each `load` call waits for the one before it (a promise chain inside `createTide`), so the set swapped in last is the set passed last.

**Design — catch-up after a restart (1): an opt-in, the default to the owner.** Making catch-up the default changes what every host does after every restart, so it is an additive `load` option: `load(reflexes, { at, resume: true })`. With it, the re-baseline applies only to a reflex this engine has loaded before and that was missing from its previous load; a reflex this engine has never loaded keeps the watermark the store has, and its `catchUp` policy applies to the downtime. Without it, `load` behaves exactly as today. A host passes `resume: true` on the load it makes when its process starts.
Owner decision — the default. What turning catch-up on (by option or by default) does, measured:
- After any restart, missed clock occurrences run as each reflex's `catchUp` says: down 4 days with `overlap: 'allow'` → every missed day runs; with the defaults (`overlap: 'skip'`) → the oldest runs and the rest are recorded as skipped; today → none, and no row says so.
- A one-shot timer due during a restart fires when the process is back (for lyceum: a talk timer fires late instead of never).
- A reflex removed from the load, then a restart, then loaded again with the same id gets its whole absence handled as downtime (9 runs in the checker's scenario with `overlap: 'allow'`). The new process cannot tell that from downtime; closing it needs a durable per-reflex record (a column).
- A host that makes a fresh engine per request and loads it each time never fires clocks today; with `resume: true` on every such load it would start to. That is why the option belongs on the load a process makes when it starts, and why it is not proposed as the default.

**What changes for apps and hosts.** Fixes: a host calling `load` twice at once gets them applied in call order (the second resolves after the first); an advance before the first load no longer skips pending runs. No signature changes except the new optional `resume` field on `load`'s options (and on the `Tide` type). Without `resume`, nothing else changes.

**Test (fails today).** (a) Two engines on one memory store: the first runs 1–2 March and stops; the second loads at 6 March 12:00 with `resume: true` → days 1–6 all ran; the same without `resume` → days 1–2 only (today's behaviour, kept). Two engines over one store is an honest restart: only the store crosses. (b) The one-shot timer fires once with `resume: true`. (c) The `e-boot` scenario through `createTideDriver` charges `s1`. (d) Overlapping loads leave `[x, z]`. Plus a guard that passes today and must keep passing: a reflex removed and brought back in one engine does not get its absence.

**Size.** src about 18 lines (`tide.ts` 16, fan-out 2); tests about 85. **New mechanism: yes** — a new optional `load` option (`resume`), plus internal state (the ids this engine has loaded, a load queue).

---

## P-T4 JSON values that cannot be parsed again are read as they are

**Problem.** `fromColumn` JSON.parses a jsonb value when it is a string, but pg and PGlite parse jsonb themselves, so a string value is the value. Example (`b-json.mjs`): a signal with `payload: 'hello'` makes `ingest`, every `advance` (all tenants) and `ledger.facts()` throw `Unexpected token 'h'`; an effect returning `'msg_8812'` throws mid-batch, leaves the rest of the batch claimed until the lease ends, and `ledger.tasks()` throws for good.

**Confirmed.** Both repros reproduce; the new test fails today with the same SyntaxError.

**Design.** Parse a string as today; where parsing fails, keep the string itself. 8 lines in `rows.ts`, no probe, no state. (The first version asked the pool how it returns jsonb and stopped parsing strings on parsing drivers; the check showed that changes values hosts may rely on — see below — so it is dropped.)

**What changes for apps and hosts.** Only values that throw today: a string that is not JSON text (`'hello'`, `'msg_8812'`) now reads back as itself instead of throwing. Every value that reads today reads the same: on a parsing driver, a string that is JSON text still comes back parsed (`'{"a":1}'` → `{ a: 1 }`, `'123'` → `123`, `'true'` → `true`, `'null'` → `null`), which a host that ingests a raw webhook body as text relies on. What stays open: that reading is lossy (`'123'` written, `123` read), as today; making it exact changes those values, so it would be an owner decision.

**Test (fails today).** On PGlite: a string payload `'hello'` reaches the effect as `'hello'`; a string output reads back from `ledger.tasks()`; `'123'` and `'{"a":1}'` read back as `123` and `{ a: 1 }`, as today. The same scenario on a PGlite pool with the jsonb type parser switched off (text mode) reads the same as today.

**Size.** src about 9 lines (`rows.ts`); tests about 45. **New mechanism: no.**

---

## P-T5 An effect starts only while its claim is still this engine's

**Problem.** One claim takes up to `limit` (100) tasks, leased from the advance's `now`, and runs them one after another after fan-out; a late task can start after its lease has run out, another engine claims it again, and both run it. Example (`c-lease.mjs`): 5 tasks, A's first effect slow, B advancing after the lease → 10 effect calls for 5 tasks. The checker's real-time run (`break2`: lease 1 s, timeout 300 ms, a 400 ms selection in the same advance) shows it with real clocks too.

**Confirmed.** `c-lease.mjs` prints `A:1@1 … A:5@1 B:1@2 … B:5@2`; the real-time scenario runs 10 effects for 6 units on today's code.

**Why the first form was dropped.** Claiming only `ceil(lease / longest timeout) − 1` tasks cost throughput everywhere (one 200 s reflex dropped every claim to 1: 1000 quick tasks took 1001 advances instead of 11), broke the DOCS promise that `limit` bounds claims per pass, charged single-engine hosts for nothing, and still ran a task twice, because the lease starts at the advance's `now` and fan-out runs first.

**Design.** Tide reads no clock, so it cannot know how much real time a batch has taken — the host can. `advance` gains an optional `clock: () => number`; `createTideDriver` passes its own `now`. With a clock, just before each task's effect the engine renews that task's lease — `cas(task, { token: this claim's, attempt }, { claimedUntil: clock() + leaseMs })` — and runs the effect only if that write lands. If another engine has taken the task back since, its token differs, the write is refused, and this engine leaves the task to it. Once renewed, the effect is cut off at `timeoutMs`, which load already warns must be shorter than `leaseMs`, so no other engine can take the task while it runs. `limit` stays 100; nothing else changes.
What the guarantee rests on: the engines' clocks agree to within `leaseMs − timeoutMs` (the same assumption the lease already makes), and the host passes a clock (the driver does). A host that calls `advance` itself without `clock` keeps today's behaviour.

**What changes for apps and hosts.** Driver-run hosts (moss apps, lyceum, lyra): one extra write per task (the renewal) and no double runs; throughput unchanged. Hosts calling `advance` directly: nothing, unless they pass `clock`. `AdvanceOptions` gains an optional field (additive). `TideStore` and `STORE_CONTRACT` unchanged — the renewal is an ordinary `cas` on the token, the same fence `record` already uses.

**Test (fails today, passes on the prototype).** (a) Deterministic, two engines on one memory store: A claims five tasks at `t0`, its clock reads `t0 + 250 s` when its first effect starts (a slow fan-out), the first effect waits on a gate; B advances at `t0 + 300 001` → B takes tasks 2–5 back and runs them, not task 1 (renewed); A, released, finds 2–5 no longer its own → each unit ran once (today: `1,1,2,2,3,3,4,4,5,5`). (b) The checker's real-time scenario with `clock: Date.now`: 6 effects for 6 units (today 10); run five times, stable. The memory store is used because PGlite has one connection: two engines on it would take turns and prove nothing; the integration check is two Node processes on one real Postgres.

**Size.** src about 12 lines (`execute.ts` 6, `advance.ts` 2, `driver.ts` 1); tests about 50; DOCS a paragraph under `advance` and `leaseMs`. **New mechanism: yes, small** — one optional `advance` field, and one renewal write per task when it is given.

---

## P-T6 A serial group is claimed first in every store

**Problem.** The memory store (the reference implementation) claims rows strictly in order, so a busy reflex outside `onePer.only` can take the whole limit before a serial reflex's row is reached; the Postgres store takes serial groups first. Example: limit 1, a parallel task ordered first and a serial task second → memory takes the parallel one, Postgres the serial one.

**Confirmed.** The same claim on both stores in the new test: memory answers `['parallel']`, Postgres `['serial']`.

**Design.** Align the memory store with Postgres: the restricted groups first, one row each, in the order `only` names them, then the other rows in order up to the limit, returned sorted by `order`. No new contract check: a check would fail a host's own store that passes today (the trap that failed the first round). DOCS gains one sentence under `claim`: a store should take the groups in `only` first, as both of tide's stores do.

**What changes for apps and hosts.** Owner to confirm: a host's tests on the memory store that use `order: 'serial'` and hit the claim limit see serial tasks claimed earlier, as they already are on Postgres. Nothing changes when the limit does not bite.

**Test (fails today).** The limit-1 claim above, run against the memory store and PGlite, answers `['serial']` on both; `STORE_CONTRACT` still has its 21 checks.

**Size.** src about 21 lines changed in `memory.ts`; test about 25. **New mechanism: no.**

---

## P-T7 A time a transition erases or repeats resolves the same way in every zone

**Problem.** `zonedToUtc` probes the offset 12 h either side of the guess; in zones at +12/+13 the transition lies just outside that, so the two probes agree and the wrong candidate wins. Example (`g-dst.mjs`): Pacific/Auckland and Pacific/Chatham daily 02:00, 02:30, 03:00 on 2026-09-27 fire an hour early (01:00).

**Confirmed.** `g-dst.mjs` reports 5 early occurrences.

**Design.** Probe a day either side instead of half a day: the instant sought is within 14 h of the guess (no zone is further from UTC), so a transition near it lies between the probes. Two lines.
Measured over every IANA zone (418), every 15 minutes, every day within two days of a transition, 2025–2027 (374 400 instants; script `tide-strata\dstcompare.test.ts.txt`): 90 instants change, all in Pacific/Auckland, Antarctica/McMurdo and Pacific/Chatham. 45 were before the asked time (spring forward) and are now after the gap; 45 are the repeated hour in autumn, where today picks the second occurrence and the change picks the first, as DESIGN and DOCS say. Early instants: 45 before, 0 after. Nothing else in any zone moves.

**What changes for apps and hosts.** Owner to confirm: in those three zones, a clock at a time inside the transition hour fires at the documented instant on two days a year — an hour later in spring (no longer before the asked time), an hour earlier in autumn (the first of the two). Occurrence keys do not change, so no run is minted twice or lost.

**Test (fails today).** Auckland daily 02:00, 2026-09-27 → fires at 03:00 local, key `2026-09-27`.

**Size.** src 4 lines (`occurrence.ts`); test about 10. **New mechanism: no.**

---

## P-T8 A one-shot clock on a date that does not exist

**Problem.** `{ clock: { at: '2026-02-30T10:00', tz } }` parses, loads silently and fires on 2 March 10:00.

**Confirmed.** `occurrencesBetween` answers `2026-03-02T09:00Z` for it.

**Design.** Refusing it at the schema would refuse input accepted today. Instead: (1) `load` adds a warning — `feb: clock.at names 2026-02-30, which does not exist — it fires on 2026-03-02` — in `LoadReport.warnings`, which exists for exactly this; (2) the reflex agent's `validate` sends back a draft whose one-shot date does not exist, as it already does for such a date in its reasoning (`dates.ts` already has the check: `dayOf` answers `undefined`). The month and day ranges the regex lets through (`2026-13-45`) get the same warning.

**What changes for apps and hosts.** Nothing loads or fires differently; a warning appears where there was none.
- Owner to confirm (agent half, not prototyped): the reflex agent now sends back a draft whose one-shot date does not exist, which it accepts today, and the model corrects it in the same run (one more model call for such a draft). It cannot be what the person meant, but it is a change in what the agent answers.

**Test (fails today).** Loading the 30 February reflex answers `loaded: 1` and a warning naming 2026-02-30 and 2026-03-02.

**Size.** src about 14 lines in `tide.ts` (prototyped) and about 6 in the agent (not prototyped); tests about 15. **New mechanism: no.**

---

## P-T9 Ids the Postgres store mints are UUIDs

**Problem.** `mintId` is `<table>_<ms in base 36>_<per-process counter>`: two processes minting in the same millisecond with the same counter collide. Example (`f-ids.mjs`): two store instances in separate module copies on one database → the second ingest throws `duplicate key value violates unique constraint "tide_fact_pkey"`; moss's feature only logs it, so that write fact is lost.

**Confirmed.** `f-ids.mjs` reproduces the throw.

**Design.** `crypto.randomUUID()` for new rows (WebCrypto global, as strata already uses). The memory store keeps `fact_1`-style ids: it is one process, and hosts' tests may read them.

**What changes for apps and hosts.** Owner to confirm: ids of new `fact`, `run` and `task` rows change from `fact_mwi60d3d_1` to a UUID. DOCS gives no format ("the store mints the id"); tide parses ids only after the `task:`/`run:` prefix in a cause, which a UUID keeps working. Existing rows keep their ids (text columns, no migration). This is also the owner's standing rule for ids. A host that sorted or parsed ids by their old shape would see the change.

**Test (fails today).** An id the Postgres store mints matches the UUID pattern. The two-process case is the `f-ids.mjs` script (two module instances, one PGlite) — a script, not a package test, because one test file shares one module instance.

**Size.** src 3 lines; test about 7. **New mechanism: no.**

---

## P-T10 Tide documents that disagree with the code (docs only)

1. **`sweep`'s `tasks` horizon (item 6).** DOCS already says "`tasks` the tasks settled before its horizon, whatever their run"; DESIGN's sentence that independent horizons were removed is stale. Checked on the prototype: a run with one task done and one retrying, the done one swept → the retrying one completes, the run settles at 2/2, and no effect ran twice (a run never fans out a second time, and `retry()` needs the task it reopens). DESIGN: replace the sentence with what `tasks` does and that it removes the record of a unit's output, never causes a second run. Owner may want `tasks` marked `@deprecated` in `Retention` (lyra uses it); that would be a separate yes.
2. **Erased local time (item 31).** Code shifts by the length of the gap (Vienna 02:30 → 03:30), as Temporal's `'compatible'`, and DOCS says so ("shifts past the gap … Temporal's `disambiguation: 'compatible'`"). DESIGN line 602 says "first valid instant after" (03:00). Change DESIGN to the code: changing the code would move firing instants that apps see today.
3. **`duplicate_unit` for maxFanOut (item 4).** The error is thrown inside fan-out and caught there; it reaches a host only as text (the run's note "fan-out refused: selection exceeded maxFanOut (N)", `preview`'s `reason`). No host can branch on the code. DOCS' error table already lists both causes; add "never thrown to a caller — a fan-out refusal skips the run with this message as its note".
4. **Dedupe per identity** — the DOCS sentence in P-T1.

**Size.** About 10 lines across DESIGN/DOCS; one changeset. **New mechanism: no.**

---

## P-T11 The reflex agent and templated effect inputs — needs owner decision

**Problem.** `effectProblem` checks `effect.input` against the effect's schema as written, so a draft input `{ to: { $ref: '$.row.email' } }` is refused against `z.string()`. Confirmed: "to: Invalid input: expected string, received object".

**Why not a plain fix.** Tide never interprets templates — they belong to the `transform` seam (DESIGN: tide "does not get to be smarter than nova about other packages' languages"), so tide cannot tell a template from a value. The model is also never told what `$` contains; it is shown each effect's literal schema. And lyceum uses `effectProblem` in `armable`/`proposable` as a guard that a stored timer names a real slide id: loosening it would weaken that protection.

**Proposal for the owner.** Leave `effectProblem` and the agent's default as they are. If templated drafts are wanted, it is a new capability: an opt-in on `createReflexAgent` and `effectProblem` (a predicate that says which values are templates, supplied by the host that owns the transform language, plus the host's own description of `$` as a producer); issues at a template's path are then not counted. Cost: a new public option, and a model that now writes in the transform language. Not prototyped.

---

## P-T12 The delayed-fact read has no index — needs owner decision

**Problem.** Matching reads due delayed facts with `notBefore <= now`, ordered by `at`; the only partial index is `tide_fact_due (at)`. With many undelivered facts delayed into the future, the read walks past all of them. (Confirmed by reading the index and the queries; this is speed, not correctness.)

**Why not now.** The fix is an index (`ON tide_fact (not_before) WHERE delivered_at IS NULL AND parked IS NULL AND not_before IS NOT NULL`). The code works the same without it, but appending it to `TIDE_SEQUENCE` makes every moss app that names `TIDE_SEQUENCE` in `runtime.tables` refuse to boot (pending migration, verify mode) until `nisc migrate` runs. Proposal: no code now; put the index in the first change that must touch `TIDE_SEQUENCE` for another reason, with the owner's yes, so hosts migrate once.

---

## P-S1 A stamp is read as numbers, or the row is named and left alone

One root cause: a stamp entry is read leniently, so what is not a number reads as "current" or as "no stamp".

**Problems.**
- `upgrader.upgrade(doc, { stamp: { 'acme.kit': 'v0' } })` returns the document **unmigrated** with the stamp `{ 'acme.kit': 1 }` — the caller stores it as current (`stamp.mjs`).
- `upgradeStore` reads `{"acme.kit":"five"}` as `NaN`, compares it as neither behind nor ahead, and skips the row silently (`pg.mjs`: total 5, upgraded 3, row `e` untouched, nothing said).
- A stamp column of type `text` comes back as a string, is read as `{}`, and every migration runs again: a document at 2 of 3 had migrations 1, 2 and 3 applied (`v: 5` instead of `3`). The reviewer's suspicion is real.
- `upgradeStore` selects every row's document `FOR UPDATE` into memory at once (item 21).

**Design.**
1. `documents.ts`: one reading of an entry — `Number(entry)`, exactly what the comparisons did before (digits, `null`, `true` read the same as today). An entry that reads as `NaN` throws `StrataError('INVALID_SEQUENCE', "The stamp's entry for acme.kit is \"v0\": not a number of migrations.")` — the code the lock already uses for a bad entry. Entries for grammars the upgrader was not given are kept unread, as today.
2. `upgradeStore`: a row whose stamp is neither null nor a JSON object, or whose entry for a given grammar is `NaN`, is left as it is and named in a new optional `unread` list on `StoreReport` (present only when non-empty, so every report that is equal today stays equal); the pass goes on. It does not throw: refusing would stop a moss boot that works today.
3. `upgradeStore` locks every row as today (that lock is the "whole or not at all" guarantee) but reads only keys and stamps with the lock, then reads each behind row's document by key, one at a time. A store whose rows are all current loads no document. A key whose value does not come back from the driver exactly as stored (a timestamptz with microseconds — the checker's `lossykey.mjs`) finds no row: that row is named in `unread` and left, as nothing was written to it today either (today's update by the same key matches nothing, and the report says `upgraded: 1`). Reading by row position (`ctid`) was considered and dropped: a store that is a view has none, and a boot that works today would stop. What stays open: a pass over many behind rows still runs in one transaction, as documented.

**What changes for apps and hosts.**
- Owner to confirm: `upgrade()` now throws `INVALID_SEQUENCE` for a stamp entry that is not a number, where today it answered the document unmigrated and stamped current. Under moss that means: an integration bundle whose stamp has such an entry is refused at intake (today accepted, unmigrated, and stored as current), and an action stored with such an entry is no longer served (moss's `artifactory` read paths call `upgrade`) — that one document is refused with a sentence instead of served without its migrations.
- Owner to confirm: moss's `data.upgradeStore` throws the report away, so `unread` is silent for moss apps; surfacing it (a log line at boot) is a moss change and so the owner's decision. Without it, a moss app's unreadable rows are left as they are (as with jsonb today) or no longer re-migrated (text column), with nothing said.
- The report for a row with a key that does not survive the trip changes from `upgraded: 1` (nothing written) to that row named in `unread`; the data written is the same (nothing).
- `upgradeStore`: same writes for every readable row; rows it cannot read are reported instead of silently skipped (jsonb) or re-migrated (text). `total` is still every row of the table.
- One query per behind row more than today (the document read), none for current rows.

**Test (fails today).** `upgrade` with `'v0'` throws `INVALID_SEQUENCE`; a missing entry, `'1'`, `null` and a null stamp still upgrade as today. On PGlite: a timestamptz key with microseconds → no throw, nothing written, the row in `unread`; a store with a `"five"` row → `{ total: 2, upgraded: 1, …, unread: ['id="e"'] }` and the row unchanged; a text stamp column → the row named in `unread` and its document unchanged (today: three migrations re-applied); an all-current store answers exactly today's report.

**Size.** src about 35 lines (`documents.ts` 9, `postgres/index.ts` 26); tests about 65; README two sentences (`unread`, the stamp entry rule). **New mechanism: one optional report field** (`unread`) — additive.

---

## P-S2 `prepare` refuses what is not a sequence with its own code

**Problem.** `prepare([null])` throws `TypeError: Cannot read properties of null (reading 'id')` instead of `INVALID_SEQUENCE`. Confirmed.

**Design.** Read `id` only from an object before building the message (2 lines).

**What changes.** An error that was a TypeError is now the documented `StrataError`; nothing that parses changes.

**Test (fails today).** `prepare([null])` rejects with code `INVALID_SEQUENCE`. **Size.** 2 lines src, 3 test. **New mechanism: no.**

---

## P-S3 The work directory: strata believes and removes only what it wrote

One root cause: strata trusts files in its work directory as its own and as the truth of the plan.

**Problems.**
1. `upgrade` overwrites, and `verify` later deletes, a `REPORT.md` or `plan.json` in `workDir` whoever wrote them; README says any directory, the project's included, is safe. Example: `workDir: '.'` in a project with its own `REPORT.md` → replaced, then deleted.
2. `verify` takes `from`, `documents` and `untouched` from `plan.json`. Example (`proj2`): edit `plan.json` to `from: { 'acme.kit': 2 }`, move the artifact to `untouched` → verify passes and the lock moves to 2 with the source never migrated.
3. `verify` compares the plan's grammars with `JSON.stringify`, so passing the grammars in another order refuses a valid plan.
4. Ids `a/b` and `a_b` clean to one expected file; the second overwrites the first and REPORT.md points both at it (misleading; verify still uses plan.json's values, so no false pass).

**Design.**
1. In a work folder the host chose (`workDir` given), a `REPORT.md` is strata's when it starts with `# strata upgrade` (a leading byte-order mark ignored); a `plan.json` when it parses in the plan's shape (`from`, `to`, `documents`, `untouched`). In the default `.strata/upgrade`, which is strata's own, nothing changes: its files are replaced as today, even after an editor re-saved the report with a byte-order mark. In a chosen folder, `upgrade` refuses, with "`REPORT.md` is not one strata wrote — it is left as it is. Move it, or give strata a workDir of its own.", and exits 1; removal skips such files.
2. `verify` refuses unless the plan's `from` equals the committed lock (and its `to` the installed grammars), and so checks untouched artifacts from the lock. What stays open: the `expected` JSON inside `plan.json` is still believed — the original documents are gone once edited, so nothing else can say what they should become. With `schemas` given, a forged expected still has to pass the current schema.
3. Stamps compared as maps (same ids, same numbers), not as text.
4. Expected file names unique per plan: a second id that cleans to the same name gets `~2`, in the plan's sorted order, recomputed the same way when removing.

**What changes for apps and hosts.** Default `workDir` (`.strata/upgrade`): nothing for 1 (its files are replaced as today); 2, 3 and 4 apply.
- Owner to confirm: with a `workDir` that already has a `REPORT.md` or `plan.json` strata did not write, `upgrade` now refuses (exit 1) instead of replacing it. One existing strata test expects exit 0 for a `plan.json` it planted in the project (`{ documents: [...] }`) and would change to expect exit 1 (its point — nothing outside `expected/` removed — is still met).
- Owner to confirm: `verify` refuses a plan made from a lock other than the committed one ("plan again"), where today it moved the lock from the plan's word.

**Test (fails today).** (a) Project `REPORT.md` with `workDir: '.'` → upgrade exits 1, file unchanged. (Passes today and after: in the default folder, strata's own report re-saved with a byte-order mark is replaced and upgrade exits 0.) (b) `plan.json` edited as in `proj2` → verify exits 1, lock stays 0. (c) Grammars given in another order between upgrade and verify → verify passes. (d) Ids `a/b` and `a_b` → two different expected files, both present.

**Size.** src about 55 lines added, 16 removed in `node/index.ts`; tests about 60; README two sentences. **New mechanism: no** (checks on files strata already writes).

---

## P-S4 The checksum and `--` lines inside a string literal — docs now, needs owner decision

**Problem.** The checksum drops every line that starts with `--`, even inside a string literal, so an edit there is not caught as `EDITED`. Confirmed: a seed whose text has `--- old line` and one with `-- a completely different line` checksum the same.

**Why not a code fix.** Any change to how a checksum is computed changes the checksum of every applied migration that has such a line (a seed carrying markdown with `---` rules is plausible), and every database that ran it would refuse to boot (`EDITED`). Storing a second-style checksum only where the two readings differ needs a SQL lexer for literals and makes an older strata reading such a row refuse — a mixed fleet would stop booting.

**Ship now.** README, under "An applied migration is history": "A line that begins with `--` is not part of the checksum even inside a string literal or a dollar-quoted body; an edit to such a line is not caught. Keep such text out of a line's start, or in its own migration." What stays open: such edits pass. The real fix waits for the owner's decision on a checksum version in the ledger.

---

## P-S5 `INVALID_SEQUENCE` for six conditions — needs owner decision, docs now

**Problem.** One code for: a sequence that does not parse, two sequences with one id, a ledger table or schema name that is not a plain identifier, a store with no key columns, a lock that is not a lock, two artifacts with one identity (and, with P-S1, a stamp entry that is not a number). Renaming breaks apps that test the code; adding codes widens the exported `StrataErrorCode` union, which breaks a host's exhaustive `switch` at type level.

**Ship now.** README gains a short error table naming each condition under `INVALID_SEQUENCE`; the message already says which. Splitting the code waits for the owner.

---

## P-S6 strata README gaps (docs only)

- Not every statement can run in a transaction: `CREATE INDEX CONCURRENTLY` (and the like) always fails as `STEP_FAILED` ("cannot run inside a transaction block"), because a run is one transaction. Confirmed with `pg.mjs`. One sentence under "A run is one transaction".
- The renamed-sequence case is already in README ("Given `complete: true`, a ledger sequence nobody names is refused — a renamed sequence would otherwise run its first migration again"); `pg.mjs` confirms it (default → `STEP_FAILED` "relation already exists"; `complete: true` → `UNKNOWN_SEQUENCE`). Nothing to add.
- STRATA-2 (embedding paths have no version): README already documents the workaround (keep the old path beside the new). The real fix — a kind's embeddings declared "from migration n on" — is a new public option on the grammar; needs owner decision.
- `upgradeStore`'s row: "reads every row's key and stamp under one lock, and a behind row's document one at a time" (with P-S1).

**Size.** About 6 README lines. **New mechanism: no.**

---

## P-S7 strata's tests leave their temp folders

**Problem.** `test/upgrade.test.ts` makes a folder per case with `mkdtempSync` (`strata-upgrade-`, `strata-outside-`) and never removes it. (tide's tests remove theirs in the global teardown.)

**Design.** The `app()` helper records each folder; an `afterAll` removes them with `rmSync(…, { recursive: true, force: true })`; the same for `strata-outside-` and the new tests' folders.

**What changes.** Nothing outside the test suite. **Test.** After the suite, no `strata-upgrade-*` folder from the run remains in the OS temp folder. **Size.** About 8 test lines. **New mechanism: no.**

---

## The three proposals with the most risk

1. **P-T5 (renew the lease as each effect starts).** It is the one that changes how engines share work: one extra write per task for every driver-run host, a new optional `advance` field, and a guarantee that rests on the engines' clocks agreeing to within `leaseMs − timeoutMs`. Two-engine behaviour is shown on the memory store with real time; PGlite cannot show it, and the real check is two processes on one Postgres.
2. **P-S1 (stamps read as numbers).** It turns a silent wrong answer into a refusal on moss's read and intake paths (an integration bundle or a stored action with a non-number stamp entry), and under moss the new `unread` report is thrown away unless moss changes.
3. **P-T1 (identity fence).** It refuses input accepted today (`ingest` of a `run` fact; a manual fact across identities). Its graph part, which would let some loads refused today through, is put to the owner, and the dedupe part stays open until the owner decides on an index change.

P-T3's catch-up, the highest-risk change in the first version, is now opt-in; making it the default is the owner's decision.
