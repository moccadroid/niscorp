# tide — refactor plan

**Status: LARGELY BUILT, 2026-08-13 — and this file is no longer the description
of the engine.** Read [`packages/tide/DESIGN.md`](../../packages/tide/DESIGN.md)
for what tide actually is; it was rewritten to match. This document survives for
Part 2 (the verified defect list, which is how the work was justified) and for
the Part 6 items still open.

What landed, in one pass with the vex write bridge:

- **Poll is gone** — trigger, matcher branch, `pollSources`, cursor state and
  store columns. The host's DAL is the write choke point, so a poll could only
  re-discover late what the bridge already pushed.
- **The beat is gone.** `tick` became `advance` (one committed increment, still
  the thing that makes every check deterministic) and gained `nextDue`; pacing
  moved to `createTideDriver` in moss — wake on ingest, drain to quiescence,
  sleep until the next due instant, plus a janitor that finds nothing when
  nothing is broken.
- **`touches` → `writes`**, `unverifiable` → **blind** edges, and under moss
  `writes` is now *derived* from `mutationEffect` rather than declared.
- **The write lane exists**: vex gained an after-commit `onWrite` observer,
  moss mints identity-stamped write facts from it, and the chain's cause and
  depth survive the trip through the database.

**Still open, from Part 6:** `appendIfAbsent` under vex (vex's `upsert` remains a
non-atomic read-then-branch — `mutations/engine.ts`), and the `SqlClient` vs
`MutationClient` convergence. Both were deferred, neither was decided.

**How to read the rest:** Part 2 is the case for doing anything at all — a list
of verified defects, several confirmed by running the built engine. Part 4 is
the target. Part 5 is the order. Part 6 is what a human has to decide.

Every claim carries a `file:line`. Where a claim was **verified by execution** it says so.
If something is not cited, treat it as unverified opinion and check it.

---

## Part 0 — the honest preamble

This package was built by me, and the review that produced this document only happened
because a reader pushed back five times. Each push surfaced a layer:

1. "27 methods?" → the store port is shaped by nouns, not capabilities
2. "no foreign keys?" → the schema enforces nothing
3. "find the issues" → 25 defects, 7 of them data-loss or permanent stall
4. "do we need all those tables?" → two, not seven
5. "why does tide rely on the database so heavily?" → it doesn't have to

Nothing was found proactively. Assume the same is true of anything in this package that
this document does not explicitly cover.

---

## Part 1 — what tide is, and what is worth keeping

### The three nouns

- **A reflex** is an automation written down as data — trigger, optional selection,
  exactly one effect, a policy (`src/schemas/reflex.schema.ts:38-50`). Not code. It
  parses, it versions, it diffs in review, it can be shown to a non-programmer, and it
  can be previewed against real data before it is armed.
- **A fact** is "something happened" — four kinds (`src/schemas/fact.schema.ts:13`):
  `write` (a row changed), `signal` (a webhook, an inbound message), `manual` (a human
  pressed Run), `firing` (another reflex's run settled — this is what makes chaining
  work). A uniform envelope so one matcher serves four sources.
- **A firing** is one execution of one reflex; a **task** is one unit inside it. If a
  selection returns 40 rows that is 40 tasks, each retrying independently.

### How it runs

1. The host writes automations however it likes, in its own tables.
2. The host compiles them to reflexes and calls `tide.load(reflexes)`.
3. Something happens — a clock reaches an hour, or the host calls `tide.ingest(fact)`.
4. Tide matches it against the loaded reflexes.
5. Each match opens a firing. `UNIQUE(reflexId, cause)` means an occurrence cannot open
   twice. **The idempotency is a database constraint, not code.**
6. If the reflex declares a `select`, tide asks the *host* for rows and writes one task
   per row.
7. Tide hands each task's effect to the host's handler, with retry and timeout.
8. Everything is rows, so "what happened" and "what would happen" are both queries.

### The four ideas that justify the package

These are good, they are why the answer is "fix", not "delete", and **none of them
depends on anything in Part 2**:

1. **An automation is an artifact.** A scheduled TypeScript function that queries a
   database and charges a card would be the most consequential logic in an application
   and the only piece with no schema, no diff, no preview.
2. **There is no step language.** A reflex is one arrow. Multi-step is a *chain* — an
   effect produces a fact, another reflex fires on it — so every joint between steps is
   a committed row and a crash between steps loses nothing. This refusal is why tide is
   not a workflow interpreter with in-memory execution state.
3. **Idempotency precedes the effect.** The task row is written before the handler runs;
   there is no path to the effect that skips it.
4. **Dry-run cannot be opted out of.** `preview()` runs the real pipeline and stubs
   exactly one function (`src/engine/preview.ts:93-99`), so there is no `if (dryRun)`
   branch for anyone to get wrong.

### Where lyra fits (and why that is correct)

Lyra stores automations as rows — `automations(studio_id, moment, effect, run_at, days,
subject, body, enabled)` — and compiles them to reflexes in
`apps/lab/lyra/src/app/reflexes/compose.ts`, loading via `reloadReflexes()` in
`apps/lab/lyra/src/server/boot.ts:24-33`.

**That split is right.** The row carries tenancy, wording and schedule — lyra's domain.
Tide receives a compiled, host-blind reflex with no `studio_id` and no sentences. If
tide stored automations it would need tenancy, a UI and opinions about what a studio is,
and it would stop being an engine.

The bug is narrower: because lyra owns `enabled`, tide's own `arm`/`disarm` is a
**second copy of the same fact** — see defect #3.

---

## Part 2 — verified defects

Severity: **DL** data loss / permanent stall · **WA** silent wrong answer · **DG** degraded.

### Tier 1

| # | Sev | Defect | Evidence |
|---|-----|--------|----------|
| 1 | DL | **`retry()` is a no-op.** `claimTasks` only considers tasks whose firing is `fanned`; a failed task settles its firing; `reopenTask` does not rewind the firing. The task sits `pending` forever. This is the only documented exit from `failed`. **Verified by execution.** | `store/memory.ts:196`, `store/postgres.ts:471`, `tide.ts:173`, `DOCS.md:236` |
| 2 | DL | **A `claimed` task is never reclaimed.** No lease, no expiry, no reaper. Die between the effect (`execute.ts:88`) and the record (`:115`) → firing never settles → never drains → fan-in stalls → an `overlap:'skip'` reflex is blocked forever. | `engine/execute.ts:88,115`, `store/postgres.ts:471` |
| 3 | DL | **Arming is in-memory, and re-arming floods.** `setEnabled` mutates only the loaded map; `materializeClocks` freezes the watermark while disarmed. Disarm 8 days, restart → 8 occurrences materialised, **8 real effects executed**. **Verified by execution.** | `tide.ts:179-186,227-228`, `engine/materialize.ts:29,72`, contradicts `DESIGN.md:301` |
| 4 | DL | **`releaseParked` is a no-op ping-pong.** Release clears `parked` but not `depth`; the matcher re-parks on the next tick. **Verified.** | `engine/match.ts:120-125`, `tide.ts:239`, `DOCS.md:275` |
| 5 | DL | **One fact counted twice.** `tide_delivery` has no PK and `completeFact` is not atomic with the deliveries; any throw mid-loop re-delivers everything next tick. Verified: a window's firing carried `factIds: ["fact_1","fact_1"]`. **Verified.** | `engine/match.ts:137-184`, `store/postgres.ts:70-76` |
| 6 | DL | **A transient fan-out error destroys a firing permanently.** Any throw → `state:'skipped'`; `createFiring` is idempotent so the occurrence can never re-materialise; not `settled` so fan-in waits forever. Contrast `pollSources`, which correctly leaves its watermark put. | `engine/fanout.ts:84-91` vs `engine/materialize.ts:121` |
| 7 | DL | **Facts due before `load()` completes are eaten.** `completeFact` runs unconditionally even with zero reflexes loaded; the never-retro-fire rule then makes them unreachable. | `engine/match.ts:184,92` |

### Tier 2

| # | Sev | Defect | Evidence |
|---|-----|--------|----------|
| 8 | WA | **The 4-way fact union is unenforced end to end.** No `superRefine`, no CHECK. `ingest({kind:'write'})` with no entity is stored, matches nothing, is marked delivered, and vanishes. `ctx.emit` is not validated at all, so a handler can emit `kind:'manual'` and fire a **disarmed** reflex. **Verified.** | `schemas/fact.schema.ts:15-46`, `engine/execute.ts:75-77`, `engine/match.ts:88` |
| 9 | WA | **Postgres `claimTasks` applies LIMIT before the serial filter** → a serial reflex with 5,000 due tasks starves every other reflex. Memory is right, Postgres is wrong. | `store/postgres.ts:468-476` vs `store/memory.ts:193-207`, `types.ts:232-237` |
| 10 | WA | **`preview` and the matcher disagree on truthiness.** Preview rejects only `false/null/undefined`; the engine also rejects `0`, `''`, `[]`. Preview reports a fire that will not happen — the exact bug preview exists to catch. **Verified.** | `engine/preview.ts:69` vs `engine/runtime.ts:60-65` |
| 11 | WA | **A missing firing resets the chain-depth ceiling** to 0, defeating the runtime cycle backstop in exactly the swept/long-running case it exists for. | `engine/execute.ts:100` |
| 12 | DG | **`listFacts` returns opposite ends** in the two stores (newest 200 vs oldest 200). Same for `listTasks`. | `store/postgres.ts:342` vs `store/memory.ts:107-113` |
| 13 | WA | **Dedupe has different lifetimes.** Memory keeps an unbounded Set forever; Postgres's unique index is freed by `sweep`, so a replayed webhook after the retention horizon re-fires. | `store/memory.ts:52,66-71` vs `store/postgres.ts:67,669` |
| 14 | WA | **Poll cursor uses strict `>`** — rows tied on a non-unique cursor (`updated_at` at ms resolution) are lost silently and permanently. | `engine/materialize.ts:98-103,133-134` |
| 15 | WA | **A corrupt poll watermark silently re-baselines**, dropping every row since the last good poll with no log line. | `engine/materialize.ts:82-94,140` |
| 16 | WA | **A throwing coalesce key merges unrelated groups** into the `''` window — a per-customer digest can contain another tenant's rows. | `engine/match.ts:157-161` |
| 17 | DG | **Every attempt records `started_at = task.createdAt`** — all retry latency measurements are wrong. | `store/postgres.ts:518`, `store/memory.ts:224` |
| 18 | WA | **Occurrences past the per-tick cap are dropped while the watermark jumps to `now`** — unreachable forever, no row saying they existed. | `engine/materialize.ts:17,43,72` |

### Tier 3 — schema and integrity

| # | Defect | Evidence |
|---|--------|----------|
| 19 | **No foreign keys anywhere.** Independent retention horizons mean any subset can orphan. Worst: sweeping tasks destroys the `UNIQUE(reflex_id, cause, unit)` entry that *is* the "this unit already ran" record — a restore then re-charges the invoice. | `store/postgres.ts:659-671`, DDL `:44-152` |
| 20 | **`commitFanout` sets `total` from the input array, not rows inserted.** Any `ON CONFLICT DO NOTHING` swallow leaves `total` permanently unreachable → the firing never settles, never drains, blocks its reflex forever. | `store/postgres.ts:437-459` |
| 21 | **State/kind/outcome are bare `text` with no CHECK**, read back with blind casts. A firing with state `'sttled'` is constructible; that task is never claimed and its firing hangs. For contrast, lyra's own `memberships.status` **has** a CHECK. | `store/postgres.ts:198,218,237,168` |
| 22 | **`fact_ids jsonb`** — never queried, unbounded, rewritten whole on every append (quadratic into a TOASTed row), not deduped (which is how #5 double-counts). | DDL `:85,147`, `store/postgres.ts:639` |
| 23 | **Missing indexes.** `claimClosedWindows` full-scans **every tick**; `sweep` full-scans the three largest tables; `tide_task(firing_id)`, `tide_fact(at)`, `tide_firing(created_at)` all unindexed. | `store/postgres.ts:645,666-669,587,343,420` |
| 24 | **Three transactional methods skip `await ready`** → `42P01 undefined_table` inside a transaction on a real pool, which #6 then converts into a permanently skipped firing. `ready`'s rejection has no handler → unhandled rejection, process-fatal on Node ≥15. | `store/postgres.ts:431,465,507` vs `:250,260-263` |
| 25 | **The Postgres store has zero tests and has never been instantiated in this repo.** Its own header claims "held to the same tests"; `memory.ts:24-27` warns this exact failure mode. Every divergence above is invisible to CI. | `store/postgres.ts:19-21`, `test/*` |

### The root cause

Seven design nouns — fact, delivery, firing, task, attempt, window, watermark — each got
a table, each table got accessors, and the port grew to **27 methods**
(`src/types.ts:252-302`). A vocabulary was turned into a schema without asking what the
guarantees need. Everything above is downstream of that.

Secondary: **the coalesce feature is used by nothing.** No app in this repo sets
`policy.coalesce`; its only driver is one test (`test/engine.test.ts:529`). It costs two
port methods, one table, one exactly-once promise, and a `DELETE … RETURNING` on every
tick.

---

## Part 3 — how vex factors in

### What vex actually is (corrected)

Vex is the **data layer**, not a query surface: adapters, introspection, cache (three
backends), the scope engine and policy compiler, seeding, the **mutation pipeline**, and
the HTTP handler (`packages/vex/src/index.ts:1-100`). Moss's `NiscRuntime` carries both
`pool: PgPool` and `db: MutationClient` (`packages/moss/src/runtime.ts:11-15`).

### The blocker, and it is one method

**No vex adapter implements `transaction`.**

- `PgPool` is `{ query }` only — `vex/src/adapters/postgres/introspect.ts:15-20`
- `createPglitePool` returns exactly `{ query }` — `vex/src/adapters/pglite/index.ts:31-33`
- `MutationClient.transaction` is **optional** and has one call site in the whole repo —
  `vex/src/mutations/engine.ts:199`

**This is a live vex bug independent of tide:** `mutations/engine.ts:194-199` throws
`'Batch mutations require a transactional client.'` when `transaction` is undefined, so
**any batch mutation in lyra throws today**. Verify whether a seeded batch exists before
assuming it is latent.

### Mapping the five primitives onto vex

| primitive | vex | note |
|---|---|---|
| `transact` | `MutationClient.transaction` | exists as a type; **no adapter implements it** |
| `claim` | expressible **today** — `UPDATE … SET state='claimed', token=$1 WHERE id=$2 AND state='pending' RETURNING *`; update + `and` filter + forced `RETURNING *` | `vex/src/mutations/schema.ts:36`, `engine.ts:134` |
| `cas` | same shape as `claim` | — |
| `query` | ordinary vex read entries | this is what makes the ledger scopeable |
| `appendIfAbsent` | **NOT expressible.** Vex has no conflict clause; its `upsert` is a JS read-then-branch (`mutations/engine.ts:145-151`) and is **not atomic** — itself arguably a vex bug | needs a decision, see Part 6 |

### Correcting two things I asserted earlier without evidence

- **"A vex-backed store would be chattier and slower."** False. 22 of 27 methods are a
  single statement in the hand-written store; `commitFanout` already loops one INSERT per
  task (`postgres.ts:438-453`); `claimTasks` is `1 + K`. A vex version is the same count.
  The only extra cost is a handful of read-then-write pairs where the grammar lacks
  column arithmetic.
- **"Tide needs SQL primitives."** False as stated. `store/memory.ts` implements the
  identical interface with **zero** locking primitives. The engine's correctness rests on
  optimistic fencing (`memory.ts:215` == `postgres.ts:513`); `SKIP LOCKED` is a
  throughput optimisation and the code says so (`postgres.ts:30-31,466-467`).

### Where a vex-backed store belongs

**In moss, not tide.** `DESIGN.md:714`: *"The moss integration lives in moss, not here —
tide must never import a host."* Tide has zero dependencies (`package.json` has no
`dependencies` block) and that is deliberate. Storage is the seam moss does **not**
currently fill — `README.md:86` lists select, transform, effects, identity and omits it.
That omission is the whole gap.

Caveat: tide's tables land in `public` with bare identifiers and no `search_path`
setting, and vex introspects `information_schema.tables` with **no filter**
(`vex/src/adapters/postgres/introspect.ts:99-105`), so they enter moss's grant universe
as ~28 strings (`moss/src/data.ts:28-29`). Vex has an `entities` whitelist
(`introspect.ts:386-391`) that **moss does not set**. Set it.

---

## Part 4 — target design

### Two tables

Test each of the seven against the guarantees:

- **`tide_reflex`** — reflexes come from the host's config every boot; the only state
  worth persisting was `enabled`, and **lyra already owns that column**. Duplicating it
  is defect #3. **Cut.**
- **`tide_fact`** — a matched fact immediately becomes a firing; an unmatched one is
  worth nothing; a *delayed* fact is a firing with a future `due_at`. **Collapses into
  the run table.** Dedupe improves as a side effect: today's unique index is
  `(kind, name, dedupe_key)` and **ignores `entity`**.
- **`tide_delivery`** — "which reflexes did this fact wake" becomes
  `WHERE cause = 'fact:X'`. A join table for a relationship that is now a column. **Cut.**
- **`tide_attempt`** — correctness needs the count and the last error, both on the work
  row. Per-attempt history is the host's log. **Cut.**
- **`tide_window`** — coalesce, re-expressed as a delayed run (below). **Cut.**
- **`tide_watermark`** — the last materialised occurrence is `MAX(cause)` over that
  reflex's runs. **Derived, not stored. Cut.**
- **`tide_firing` / `tide_task`** — the set and its members. Both real: the set carries
  atomic fan-out, completion counting for fan-in, and `overlap:'skip'`. **Keep, renamed.**

```sql
CREATE TABLE tide_run (
  id         text PRIMARY KEY,
  reflex_id  text NOT NULL,
  cause      text NOT NULL,   -- 'occurrence:2026-08-11' | 'fact:…' | 'run:…' | 'manual:…'
  state      text NOT NULL CHECK (state IN ('pending','fanned','settled','skipped','parked')),
  depth      int  NOT NULL DEFAULT 0,
  due_at     timestamptz NOT NULL,   -- a DELAYED fact is simply a future due_at
  payload    jsonb,                  -- what woke it, if anything
  total      int  NOT NULL DEFAULT 0,
  done       int  NOT NULL DEFAULT 0,
  failed     int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  settled_at timestamptz,
  drained    boolean NOT NULL DEFAULT false,
  note       text,
  UNIQUE (reflex_id, cause)          -- THE idempotency, one constraint, every trigger kind
);
CREATE INDEX ON tide_run (state, due_at);
CREATE INDEX ON tide_run (reflex_id, created_at DESC);

CREATE TABLE tide_work (
  id            text PRIMARY KEY,
  run_id        text NOT NULL REFERENCES tide_run(id) ON DELETE CASCADE,
  unit          text NOT NULL,
  env           jsonb NOT NULL,
  state         text NOT NULL CHECK (state IN ('pending','claimed','retrying','done','failed')),
  attempt       int  NOT NULL DEFAULT 0,
  token         text,
  claimed_until timestamptz,          -- THE LEASE. expiry is reclaim. kills defect #2
  not_before    timestamptz NOT NULL,
  error         text,
  created_at    timestamptz NOT NULL,
  settled_at    timestamptz,
  UNIQUE (run_id, unit)              -- the other idempotency
);
CREATE INDEX ON tide_work (state, not_before, claimed_until);
CREATE INDEX ON tide_work (run_id);
```

**Every README claim survives:** idempotency before the effect (row written first,
`UNIQUE(run_id, unit)`); DST-proof occurrences (`cause` is the calendar key, uniqueness
does the rest); retry (`attempt` + `not_before`); transactional fan-out (insert work +
update run, one transaction); fenced attempts (`token` + `claimed_until`); fan-in (a
settled run opens a run with `cause = 'run:<id>'`); dry-run (touches nothing); queryable
ledger (two readable tables); deterministic tests.

### Five primitives

```ts
export type TideStore = {
  transact:       <T>(fn: (tx: TideStore) => Promise<T>) => Promise<T>;
  appendIfAbsent: (table: 'run' | 'work', row: Row) => Promise<Row | undefined>;
  claim:          (spec: ClaimSpec) => Promise<readonly Row[]>;
  cas:            (table, id, expect: Partial<Row>, set: Partial<Row>) => Promise<boolean>;
  query:          (spec: QuerySpec) => Promise<readonly Row[]>;
};
```

Three of the seven exactly-once promises are the **same operation on three tables** —
`claimTasks`, `drainSettled`, `claimClosedWindows` are all `claim`. Two more
(`insertFact`, `createFiring`) are `appendIfAbsent`.

Rename `TideStoreLike` → **`TideStore`**. `DESIGN.md:564` already calls it that; the
`Like` suffix is an unresolved decision left in a name with no comment explaining it.

The **nine ledger reads** (`listFacts`, `listFirings`, `listTasks`, `listAttempts`,
`releaseFact`, `reopenTask`, `sweep`, plus the read-only halves of `getFact`/`getTask`)
are **never called by the engine** — only through `tide.ts:230-242`. They leave the port
entirely: under moss they are vex entries, standalone they are the host's own queries.

### Coalesce, re-expressed

Delete `appendCoalesce`, `claimClosedWindows`, `tide_window`, and the branch at
`match.ts:154-164`. A window becomes: the first fact of a group mints a **delayed run**
at `now + windowMs` with `cause = 'coalesce:<key>:<windowStart>'`; the other N−1 collide
on `UNIQUE(reflex_id, cause)` and are refused; when it fires, the reflex `select`s what
changed. Uses only mechanisms that already exist, and is consistent with the design's own
"the database is the interpreter".

---

## Part 5 — implementation plan

### Phase 0 — engine bugs, no schema change

Independent of everything else; these lose real work today.

1. **#1 `retry()`** — `reopenTask` must also rewind its run from `settled` to `fanned`
   and decrement `failed`, in one transaction. Add a test that a reopened task is
   actually claimed on the next tick.
2. **#6 fan-out catch** — `engine/fanout.ts:84-91` must distinguish "the selection failed"
   (leave the firing `pending`, retry next tick, like `pollSources` does) from "the
   reflex is malformed" (skip). A transient error must never consume an occurrence.
3. **#10 preview truthiness** — `preview.ts:69` must use the engine's `isTruthy`
   (`runtime.ts:60-65`). One import.
4. **#7 facts eaten before load** — `match.ts:184` must not `completeFact` when zero
   reflexes are loaded.
5. **#8 fact union** — add `superRefine` to `FactInputSchema`, and validate `ctx.emit`
   the same way (`execute.ts:75`).
6. **#17 attempt timing** — stamp `started_at` at attempt start, not `task.createdAt`.

**Gate:** the suite passes; new tests for 1, 6, 10.

### Phase 1 — the port

7. Rename `TideStoreLike` → `TideStore` (`types.ts:252`).
8. Define the five primitives. Keep the old port alongside temporarily.
9. **Rewrite `store/memory.ts` against the five primitives** — ~380 lines → ~120. This
   is the reference implementation and the contract's definition.
10. Move the engine's ~30 call sites to the primitives. **Engine logic does not change** —
    only how it phrases persistence. `engine/occurrence.ts`, the schemas, retry/timeout
    policy and preview are untouched.
11. Delete the old 27-method port and the nine ledger reads from it; re-expose the ledger
    reads on `tide.ts` as `query` calls.

**Gate:** every existing test passes unchanged against the new memory store.

### Phase 2 — two tables

12. Collapse fact → run (delayed fact = future `due_at`), delivery → `cause`,
    watermark → derived, attempt → count + last error on work.
13. Delete coalesce; re-express as a delayed run; delete `tide_window`.
14. **Delete `store/postgres.ts` outright.** 700 lines, no tests, never instantiated.
    Do not port it — Phase 4 rewrites it if it is wanted at all.

**Gate:** the engine runs entirely on two in-memory tables. Defects #2, #5, #8, #13,
#15, #19, #20, #21, #22, #23 die structurally.

### Phase 3 — contract tests

15. Parameterise `test/engine.test.ts` over a store factory. Run every existing test
    against every store. `memory.ts:24-27` claims this exists; make it true.
16. Add tests for each Tier-1 defect so they cannot regress.

### Phase 4 — persistence, only if wanted (see Part 6)

17. **Fix vex first:** `createPglitePool` gains `transaction` via PGlite's
    `db.transaction`; `PgPool` widens to `{ query, transaction? }`. This is a vex bug fix
    on its own merits — it un-breaks vex's batch mutations.
18. Decide `appendIfAbsent` (Part 6).
19. Write `createVexStore(runtime)` **in moss**, not tide. Five functions.
20. Moss sets vex's `entities` whitelist so two engine tables do not become grant strings.
21. Lyra: `store: createVexStore(runtime)`. The ledger becomes ordinary vex reads;
    `mine()` and the `fn:`-that-reads exception in
    `apps/lab/lyra/src/server/functions/automations.ts` are deleted.
22. Persist the host's identity (`reflex.as`) on the run so the ledger is tenant-scopeable
    by an ordinary behavior. Today it is written nowhere.

### Known non-tide follow-ups found during the review

- `apps/lab/lyra/src/server/functions/automations.ts:118-122` renders **"0 done" always** —
  `Firing` has no `stats` field (`tide/src/types.ts:35-53`) though the columns exist.
- Lyra's `arm`/`disarm` should write `automations.enabled` and reload, not call tide's
  in-memory switch.
- Verify whether any seeded lyra mutation is a batch; if so it throws today (Part 3).

---

## Part 6 — decisions a human must make

1. **Does a half-finished run need to survive a process restart?**
   If **no**: stop after Phase 3. Tide keeps two tables in memory, `store/postgres.ts` is
   gone, and there is no SQL anywhere in the package. For a studio sending seven emails a
   day this is arguable and it makes the package dramatically smaller.
   If **yes**: Phase 4.

2. **`appendIfAbsent` under vex.** Vex cannot express `ON CONFLICT`, and its `upsert`
   sugar is a JS read-then-branch that is **not atomic** (`mutations/engine.ts:145-151`).
   Options: (a) add `onConflict: 'ignore'` to vex's mutation schema — small, and it fixes
   a real vex race; (b) rely on the unique constraint and catch the violation;
   (c) use the raw pool for this one primitive. **(a) is recommended** — the vex bug is
   worth fixing regardless.

3. **`SqlClient` vs `MutationClient`.** Two names for one shape, differing in three
   details (required vs optional `transaction`, recursive vs non-recursive `tx`,
   `readonly unknown[]` vs `unknown[]`). Converge, or keep a shim per host? Tide's
   zero-dependency stance is deliberate and load-bearing; a shim in moss is the
   conservative answer.

4. **Does anything want coalesce?** Nothing in this repo does. Deleting it is assumed
   above. If a digest use case is real, it comes back as a delayed run, not a table.

5. **Sequencing against product work.** Phases 0–3 touch no application behaviour and
   lyra's checks should pass throughout. They get harder once anything else depends on
   the current port.

---

## Appendix — file map

```
packages/tide/src/
  tide.ts                 public API: load, ingest, tick, fire, retry, arm, ledger
  types.ts                ledger rows, seam types, the 27-method port (:252-302)
  schemas/
    reflex.schema.ts      the artifact (:38-50)
    fact.schema.ts        the 4-kind union (:13) — needs a superRefine
    trigger.schema.ts     clock | write | signal | firing | poll | manual (:97-104)
    policy.schema.ts      retry, timeout, overlap, catchUp, order, coalesce
  engine/
    match.ts              fact → firing; `when`; coalesce branch; delivery
    materialize.ts        clock occurrences + poll sources
    fanout.ts             selection → tasks
    execute.ts            claim → run effect → record; chain emits
    preview.ts            dry run
    occurrence.ts         calendar identity — KEEP, unaffected
  store/
    memory.ts             reference implementation (:19 calls it "TideStore")
    postgres.ts           700 lines, 0 tests, never instantiated — DELETE
```

**Untouched by this refactor:** `engine/occurrence.ts`, all of `schemas/` except the fact
union, retry/timeout/overlap policy, `preview`'s stub-one-function design, and the
reflex-as-artifact model. That is the part worth keeping, and it is most of the package's
actual value.
