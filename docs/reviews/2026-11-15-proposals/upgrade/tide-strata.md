# Upgrading: tide and strata ("Owner to confirm" fixes)

What an app sees change in `@niscorp/tide` and `@niscorp/strata` from these fixes, and what it does about it. Every item below is marked breaking because an app that works today could see a different result or an error; none of them needs a code change in any app we know of (lab apps in this repo, AnimaApp, anima-finance, mira — checked file by file, listed under each item).

**Tables and grammars.** None of these fixes changes a table or a grammar. `TIDE_SEQUENCE` gets no new migration, so an app that names it in `runtime.tables` (lyceum, with `createTideStore(pool, { migrate: false })`) does **not** need to run `nisc migrate` for this release. The Postgres store's new UUID ids go into the existing `text` id columns. No `strata.lock.json` moves.

---

### tide — a manual fact runs only a reflex of its own identity, and a run fact cannot be ingested
- Before: `tide.ingest({ kind: 'manual', target: 'b.refund', payload: { amount: 99999 }, at }, { as: 'tenant-a' })` ran tenant B's reflex `b.refund` (as tenant B, even when it was disabled) with tenant A's payload. `tide.ingest({ kind: 'run', reflex: 'billing', runId: 'r1', stats: { total: 1, done: 1, failed: 0 }, at }, { as })` was stored and woke that identity's `on: { fact: { run: 'billing' } }` reflexes with whatever stats it carried.
- Now: the manual fact is matched like every other fact — only by a reflex with the same `as` (no `as` reaches only reflexes with none) — so `b.refund` does not run. `fire('b.refund', …)` still runs it, disabled or not, because `fire` mints the fact under the reflex's own `as`. The `run` fact is refused: `ingest` throws `TideError` with code `invalid_fact` ("a run fact is minted by tide when a run settles; it is not ingested").
- Who notices: a host that calls `ingest` itself with `kind: 'manual'` and an `as` other than the target reflex's, or with `kind: 'run'`. Hosts that only use `fire`, or moss's tide feature (it ingests `write` facts stamped with an identity), see nothing.
- What to do: aim a manual fact at a reflex by calling `fire(reflexId, { now, input, by })`, or pass the reflex's own identity as `as`. Never ingest a `run` fact: tide writes it when a run settles.
- Breaking: yes
- Affected apps: none. Lab apps: lyceum and lyra call `fire` and ingest `write` facts with the reflex's identity (`apps/lab/lyra/src/dev/tide-check.ts:181`, `:200`, `:254`, `:255` — all `kind: 'write'`). showroom reads run facts (`apps/showroom/src/modules/tide/pages/chain.tsx:39`) but ingests none. AnimaApp ingests signals under the studio's identity, the same as its reflexes' (`src/server/tide/index.ts:64`, `src/dev/join-check.ts:556`); anima-finance ingests nothing itself; mira uses `driver.fire` (`src/dev/aside-back-check.ts:56`, `src/dev/automation-edit-check.ts:268`, `src/dev/forward-check.ts:202`). No file changes.

### tide — a run whose fan-out failed waits before it is tried again
- Before: a run whose fan-out threw in a host seam (`select` throws `ECONNREFUSED`, a template breaks) stayed `pending` and was tried again on the very next `advance`, oldest first, with the same `limit`. Three such runs and `limit: 3` filled every pass: a healthy reflex's run behind them never fanned out, and the failing `select` was called again on every advance.
- Now: the run still stays `pending`, but is tried again after a wait taken from the reflex's own `policy.retry`: `baseMs` (default 60 000), growing by `backoff` (default exponential) over the first `max` deferrals (default 3) and then staying that long — with the defaults 60 s, 120 s, 240 s, 240 s… While it waits, the runs behind it fan out. In the example: the healthy run settles on its first advance, and the failing `select` is called once per run, not once per run per advance. `max` does not end the run. The waits live in each engine's memory: after a restart a deferred run is tried once at once, then waits again. A run whose reflex a load left out is still skipped on the next advance.
- Who notices: an app whose selection or transform fails for a moment (a database restart) — such a run now fans out on the first advance after its wait, not on the next advance. With the driver's janitor this is a minute later for the default policy. `run.deferred` events fire per attempt, so fewer of them.
- What to do: nothing. A reflex that must retry sooner sets its own `policy: { retry: { baseMs: 5_000 } }`.
- Breaking: yes
- Affected apps: every app with a selection in a reflex sees the later retry, and none has to change. Lab: lyra (`apps/lab/lyra/src/server/tide.ts:229`, selections in `apps/lab/lyra/src/app/reflexes/compose.ts:166`, `:200`, `:239`); lyceum's `select` always throws but its timers have no selection (`apps/lab/lyceum/src/server/timing.ts:161`). AnimaApp (`src/server/tide/index.ts:40`), anima-finance (`src/server/tide/index.ts:23`) and mira (`src/server/automation/engine.ts:54`) build tide through moss's selection seam. No file changes.

### tide — the memory store claims serial tasks first, as the Postgres store does
- Before: `createMemoryStore().claim` took rows strictly in `order`, so with limit 1, a task of a parallel reflex ordered first and a task of an `order: 'serial'` reflex second, it claimed the parallel one; the Postgres store claimed the serial one.
- Now: the memory store takes the groups named in `onePer.only` (the serial reflexes) first, one row each, then fills the rest of the limit with the other rows — both stores claim the serial task.
- Who notices: a host's tests on `createMemoryStore()` that use `order: 'serial'` and hit the claim limit (default 100 tasks per advance). Nothing changes when the limit does not bite. A host's own store implementation should do the same (DOCS, "The store contract", `claim`).
- What to do: nothing, unless a test asserted the old claim order; then it asserts what the Postgres store already did.
- Breaking: yes
- Affected apps: none. The memory store is used by the showroom (`apps/showroom/src/modules/tide/world/*.ts`, no `order: 'serial'`) and AnimaApp's `src/dev/join-check.ts:544` (no `order: 'serial'`).

### tide — daylight-saving times resolve as documented in +12/+13 zones
- Before: in Pacific/Auckland, Antarctica/McMurdo and Pacific/Chatham, a clock at a time inside a transition hour resolved wrongly: a daily 02:00 on the spring-forward day (2026-09-27) fired at 01:00, before the asked time; in the repeated hour in autumn (2026-04-05, 02:30) it took the second occurrence.
- Now: 02:00 on 2026-09-27 fires at 03:00 (shifted past the gap, as in every other zone), and 02:30 on 2026-04-05 takes the first occurrence. Occurrence keys (`2026-09-27`) do not change, so no run is opened twice or lost. Measured over every IANA zone, 2025–2027: only those three zones move, on two days a year.
- Who notices: an app with a clock reflex in one of those three zones at a time inside the transition hour.
- What to do: nothing.
- Breaking: yes
- Affected apps: none use those zones. lyra's clock check uses Pacific/Kiritimati and Pacific/Niue (`apps/lab/lyra/src/dev/clock-check.ts:9`, `:10`), which have no transitions.

### tide — the reflex agent sends back a draft whose one-shot date does not exist
- Before: `createReflexAgent(…)` accepted a draft `{ on: { clock: { at: '2026-02-30T10:00', tz } } }` (unless its reasoning also wrote the date beside a weekday); saved, it fires on 2 March.
- Now: such a draft goes back to the model in the same run with "The clock's date 2026-02-30 is not a date. Look the date up in COMING DAYS or CALENDAR.", and the model corrects it — one more model call for such a draft. The same for a month or day out of range (`2026-13-45`).
- Who notices: an app that runs the reflex agent with clock triggers offered; it now gets a draft with a real date (or the run ends with the agent's own retry error if the model never corrects it).
- What to do: nothing.
- Breaking: yes
- Affected apps: lyceum (`apps/lab/lyceum/src/server/timing.ts:85`, triggers `clock` and `timer`) and mira (`src/server/automation/tools.ts:85`, `DRAFT_CHOICE` in `src/server/automation/offered.ts:10`, triggers `clock` and `timer`) see the extra correction round for such drafts. No file changes.

### tide — the Postgres store mints UUID ids
- Before: new `fact`, `run` and `task` rows got ids like `fact_mwi60d3d_1` (the time and a per-process counter). Two processes on one database could mint the same id in the same millisecond; the second write failed with `duplicate key value violates unique constraint "tide_fact_pkey"`, and under moss that write fact was lost.
- Now: new rows get a UUID (`3f0c8a52-…`). Rows already written keep their ids; the columns are `text`, nothing migrates. Causes (`task:<id>`, `run:<id>`) work as before. The memory store keeps `fact_1`-style ids.
- Who notices: code that sorts or parses tide's ids by their old shape.
- What to do: nothing, unless such code exists; order by `createdAt` / `at` instead.
- Breaking: yes
- Affected apps: none parse or sort tide ids (searched the lab apps, AnimaApp, anima-finance, mira for `fact_`, `run_`, `task_` and id ordering).

### strata — a stamp entry that is no number is refused; rows strata cannot read are named
- Before: `upgrader.upgrade(doc, { kind, stamp: { 'acme.kit': 'v0' } })` returned the document **unmigrated** with the stamp `{ 'acme.kit': 1 }`, which the caller stored as current. `upgradeStore` skipped a row whose stamp was `{"acme.kit":"five"}` without a word, and a stamp column of type `text` read as "no stamp", so every migration ran again over documents already through them (`v: 5` where `3` was right). `upgradeStore` loaded every row's document under the lock.
- Now: an entry for a grammar the upgrader was given is read with `Number` (digits in a string and `null` read as before); one that reads as no number makes `upgrade` and `behind` throw `StrataError` `INVALID_SEQUENCE` ("The stamp's entry for acme.kit is \"v0\": not a number of migrations."). `upgradeStore` does not throw for such rows: it leaves them as they are and lists them in a new optional `unread` field on its report — `{ total: 2, upgraded: 1, applied: { 'acme.forms/1': 1 }, unread: ['id="e"'] }` — and goes on. The same for a stamp that is neither null nor a JSON object (a `text` column) and for a row whose key the driver does not hand back exactly as stored (a `timestamptz` with microseconds, which today's update by key also missed). `unread` is present only when there is one, so every report that is equal today stays equal. `upgradeStore` now reads only keys and stamps under the lock and each behind row's document by its key; a store whose rows are all current loads no document.
- Who notices: under moss, an integration bundle whose stamp has such an entry is refused at intake (it was accepted, unmigrated, as current), and an action stored with such an entry is refused with a sentence instead of served without its migrations. moss discards `upgradeStore`'s report, so `unread` is silent for moss apps (logging it at boot is decision 50). A host that calls `upgradeStore` itself and compares the whole report sees `unread` only when such rows exist.
- What to do: nothing for stamps strata wrote — they are always numbers. A host that stores stamps in a `text` column changes it to `jsonb` (an appended migration in its own sequence) so its rows are read again.
- Breaking: yes
- Affected apps: none. Every stamp the lab apps, AnimaApp, anima-finance and mira store is written by strata through moss into moss's own jsonb columns; none of them calls `upgradeStore` or `upgrade` itself (the showroom's strata pages call `upgrade` with numeric stamps: `apps/showroom/src/modules/strata/pages/intro.tsx:57`, `time-machine.tsx:116`, `everywhere.tsx:46`). No file changes.

### strata — `strata upgrade` believes and removes only its own files; `verify` believes the lock
- Before: `strata upgrade` with a `workDir` the host named (`workDir: '.'`) replaced a `REPORT.md` or `plan.json` already there, and `verify` later deleted it, whoever wrote it. `verify` took `from` and the untouched artifacts from `plan.json`, so editing it to `from: { 'acme.forms': 2 }` and moving the artifact to `untouched` passed and moved the lock to 2 with the source never migrated. `verify` compared the grammars as JSON text, so passing them in another order refused a valid plan. Two ids that clean to one file name (`a/b`, `a_b`) shared one expected file; the second overwrote the first.
- Now: in a `workDir` the host named, a `REPORT.md` is strata's only when it begins with `# strata upgrade` (a byte-order mark aside), a `plan.json` only when it has a plan's shape; given one that is not, `upgrade` exits 1 with "REPORT.md is not one strata wrote — it is left as it is. Move it, or give strata a workDir of its own.", and nothing removes it. In the default `.strata/upgrade` its files are replaced as before. `verify` refuses a plan whose `from` is not the committed `strata.lock.json` ("the plan was made from acme.forms 2, but strata.lock.json records acme.forms 0 — plan again"). Stamps are compared grammar by grammar. The second id that cleans to one name gets `a_b~2.json`.
- Who notices: an app that runs `strata upgrade` with a `workDir` holding files of its own with those names; anyone who edits `plan.json` by hand.
- What to do: give strata a work folder of its own (or the default), and re-run `strata upgrade` instead of editing `plan.json`.
- Breaking: yes
- Affected apps: none. The lab apps' sources are checked with the default work folder (`pnpm check:sources` passes); AnimaApp (`src/dev/strata.ts:12`) and anima-finance (`src/dev/strata.ts:13`) call `runSourceUpgrade` without a `workDir`. No file changes.
