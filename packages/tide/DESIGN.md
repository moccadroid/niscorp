# Tide — Design Document

> **Status: built, and once reviewed hard.** The engine, the store contract and the
> grammar are implemented and tested; see [DOCS.md](./DOCS.md) for the API. This is the
> design answer to [`automation-requirements.md`](../../docs/archive/automation-requirements.md),
> which stays authoritative on *what must be true*; this says *how*. Where the two
> disagree, one of them has rotted — report it, don't guess.
>
> A section marked **⟲** records something this package got wrong and what replaced it.
> They are kept because the wrong version was plausible, and a reader who does not know
> why it was wrong will propose it again.

## Purpose

Every nisc package answers one question: vex answers *what*, nova answers *how it
looks*, charter answers *who may*, prism answers *into what shape*, cortex *thinks*.
Nobody answers **when**. Tide is the answer: a host-blind automation engine in which
work initiated by the clock, by a change, by an external event, or by a person is
declared as data, executed as one named effect, and accounted for in a durable ledger.

**One sentence:** a reflex turns the clock and the fact into one named effect, through
a durable ledger — and everything in between is rows.

The thesis, inherited from the stack and load-bearing here: **an automation is an
artifact.** It parses a schema, it is stored as a row, it diffs in review, it can be
shown to a non-technical operator, and it can be previewed against real data before it
is armed. A scheduled TypeScript function that queries a database and charges a card
would be the most consequential logic in an application and the only piece with none
of those properties. Tide exists so that piece never has to be written.

---

## Core principles

1. **An automation is an artifact.** The unit of authorship is the **reflex** — a
   trigger, an optional selection, and exactly one effect, as validated JSON. If a
   proposed feature cannot be expressed as data, it goes in an effect handler (code,
   at the seam built for code) or it doesn't go in.

2. **There is no run body.** Tide has no step language, no workflow interpreter, and
   no in-memory execution state that matters. A reflex is a straight arc from stimulus
   to one response — no deliberation between. A multi-step flow is a *chain*: an
   effect completes by producing a fact (directly, or — under a host like moss — by
   writing a row that becomes one), and other reflexes fire on that fact. The database
   is the interpreter. Every joint between steps is a committed row, which is why a
   crash between steps loses nothing and why every intermediate state is named,
   durable, and visible. Checkpointing is not a feature; it is the shape.

3. **Two sources of change, and only two: the clock and the fact.** A calendar trigger
   is the clock. A data change is a fact, PUSHED by the host that saw its own write —
   under moss, the vex bridge: every committed statement arrives as a fact with the
   rows it returned, stamped with the identity of the tenant whose write it was. A
   webhook is somebody else's write, arriving as a fact over HTTP; an external source
   with no write choke point enters through an importer that ingests write facts at
   the door. A person pressing "run now" fires a reflex by hand. There is no poll —
   see ⟲ under **The machine**.

4. **Deterministic core, injected everything.** Tide contains no SQL dialect, no
   expression evaluator, no HTTP client, no identity model, and no timer. Storage,
   selection, transformation, effects, and identity are five seams the host fills.
   With stubs, the entire engine runs in memory under a fake clock — which is not a
   testing convenience but the design: a headless check advances time and asserts on
   rows, with no sleeping and no mocks of tide itself.

5. **Identity-blind.** Tide never learns what a principal is. Every reflex names an
   `as`; the host resolves it to whatever authority means there (under moss: a
   charter-resolved, engine-enforced `ActorContext`) and tide threads it through to
   effects untouched. It is also *written down* on every run, so a host can scope its
   own ledger by it without tide knowing what it scoped. The same blindness charter
   has toward universes, tide has toward identity — and for the same reason:
   enforcement belongs to the governed target, never to the middleman.

6. **The wall clock is never read.** The only time tide knows is the `now` handed to
   `advance({ now })` and the `at` stamped on ingested facts. The DRIVER owns waking:
   it advances to quiescence on every ingest (a chain advances one committed hop per
   call, so the driver loops until nothing moves), and between ingests it sleeps until
   the instant `nextDue(now)` names — a clock occurrence, a retry backoff, a lease
   lapse, a delayed fact. Tide tells the driver when it wants waking; the driver owns
   the timer. A slow janitor beat recovers what a crashed process left behind — it is
   how work is FOUND, never how work moves. A dev check is its own driver, handing
   `advance` a fake `now` and asserting on rows.

7. **One effect per reflex, and effects are opaque named calls.** The effect
   vocabulary is deliberately open — "send an email" cannot be a closed grammar,
   because it reaches an outside service — but the *shape* of the seam is closed: a
   registered handler with a name, an input the reflex shapes as data, an optional
   preview, and `writes` metadata for the flow graph — under moss DERIVED from the
   vex mutation behind the effect, never declared. The definition stays declarative;
   the doing stays code; the boundary stays one function wide.

8. **A table needs a guarantee, not a name.** Seven design nouns each got a table
   once; six of them were vocabulary. The test a new table has to pass is not "is this
   a real concept" — fact, delivery, firing, task, attempt, window and watermark were
   all real concepts — but "what does the schema *promise* that nothing else can".
   Four survive it. See **The ledger**.

---

## Vocabulary

The working set, one line each. Terms are defined in depth where they operate.

| Term | Meaning |
|---|---|
| **reflex** | the artifact: trigger + optional selection + one effect + policy — a tenant's reflex is the tenant's own row, with its own id |
| **trigger** | the reflex's `on` clause: `clock` \| `fact` \| `manual` |
| **occurrence** | one slot of a clock trigger, keyed by local calendar fields (`2026-03`) |
| **fact** | the intake contract — "something happened": a write, a signal, a manual poke, a settled run |
| **run** | one activation of one reflex: cause, version, identity, selection, fan-out, outcome |
| **task** | one unit of effect work inside a run; the idempotency grain |
| **attempt** | one execution try of a task, fenced by a token — a *count and a last error*, not a table |
| **lease** | how long a claim is good for; expiry is the reclaim |
| **unit** | what a task acts on: one selected row (`each`), the whole result (`batch`), or the trigger itself |
| **effect** | the named call a reflex makes; reference in data, handler in the registry |
| **template** | a transform-config slot inside a reflex (`effect.input`, `when`, selection query) |
| **`$`** | the closed environment templates evaluate against |
| **cause** | the provenance pointer on every run and emitted fact; composes into causality chains |
| **settle** | reach a final state (`done` or `failed`) — deliberately not "complete": a run with failures has settled |
| **drain** | announce a settled run as a fact, exactly once — the fan-in step |
| **chain** | reflexes linked through facts — informal, derived, deliberately **not** an artifact |
| **graph** | the static structure (watches × writes × run subscriptions), verified at load |
| **ledger** | the collective rows: facts, runs, tasks — host-readable data |
| **fire / retry / preview** | the human verbs: activate now, re-attempt a failed task, dry-run |
| **advance / nextDue / ingest / load** | the driver-facing verbs: one committed increment, the next instant worth waking for, accept a fact, accept artifacts |

**⟲ Naming.** This package called a run a **firing** for its first version, to avoid
colliding with moss's `RunRecord`. The collision it created instead was worse and
internal: `firing` was simultaneously a row type, a trigger kind (`fact: { firing }`)
and a fact kind, so `on: { fact: { firing: 'x' } }` read as a puzzle and every sentence
about one had to say which. One word, three jobs. It is **run** now, and the trigger is
`fact: { run: 'x' }`. The fact kind for external events stays **`signal`** —
conventional, and colliding with `@niscorp/signal` only in prose, never in an API.
There is deliberately no word for "workflow"; the closest thing, *chain*, is defined so
it can't become one.

---

## The grammar

Everything below is a Zod schema; everything a schema validates is plain JSON.

### Reflex

```jsonc
{
  "id": "billing.charge-due",
  "intent": "Charge every subscription due this month.",     // one factual sentence — mandatory, like a vex entry
  "on": { "clock": { "every": "month", "on": 1, "at": "03:00", "tz": "Europe/Vienna" } },  // THIS tenant's timezone — the row is theirs
  "as": "automation.billing@studio_42",                       // opaque to tide; the host resolves it, and tide records it
  "params": { "graceDays": 3 },                               // authored knobs, visible to templates as $.params

  "select": {                                                 // OPTIONAL — omitted = the trigger itself is the unit
    "query": { /* opaque — handed to the `select` seam verbatim, after template evaluation */ },
    "mode": "each",                                           // 'each' → one task per row; 'batch' → one task, all rows
    "unitKey": "subscription_id"                              // the row field that keys a unit task ('each' mode only)
  },

  "when": { /* transform predicate over $ — FACT triggers only (schema-enforced); prefer `select` where a query can filter */ },

  "effect": {
    "name": "payments.charge",                                // a registered effect
    "input": { /* template — evaluated per unit */ }
  },

  "policy": {
    "retry": { "max": 4, "backoff": "exponential", "baseMs": 60000 },
    "timeoutMs": 30000,
    "overlap": "skip",                                        // 'skip' | 'allow' — may a run start while the last is unsettled?
    "catchUp": "run",                                         // 'run' | 'skip' | 'latest' — after downtime
    "order": "any"                                            // 'any' | 'serial' — serial = one in-flight task at a time
  },

  "enabled": true                                             // the HOST's switch, read here; tide keeps no copy
}
```

The template environment `$` is small and closed:

```
$ = { params,                       // the reflex's own knobs
      occurrence?,                  // clock runs: { key, at }
      fact?, facts?,                // fact runs: the fact, or the batch in `at` order
      row?, rows?,                  // per-unit: the selected row (each) or all rows (batch)
      now }                         // the advance's LOGICAL now — never a wall-clock read
```

A manual run (via `fire()`) gets `$.fact = { kind: 'manual', payload: <input> }` —
templates see a fact like any other, and a template that requires `$.occurrence` on a
manually-fired clock reflex fails loudly at preview, which is where authoring errors
belong.

**Truthiness is one predicate.** `false`, `null`, `undefined`, `0`, `''` and `[]` are
falsy, in the matcher and in `preview` alike, because they import the same function.
**⟲** They did not, once: preview rejected only `false/null/undefined`, so a `when`
returning an empty list previewed as *this will fire* and then didn't. A dry run that
disagrees with the engine is worse than no dry run, because it is trusted.

### Tenancy — a reflex is a tenant's row

Tide has **no tenant concept**, because the stack already solved multi-tenancy one
layer down and everything above inherits it. A reflex is tenant data, like a theme:
studio 42's billing reflex is studio 42's row — its own id, its tz, its params, its
`as`. Tide requires ids to be unique and runs the rows it is given; how a host mints
them is the host's business.

The boundary needs nothing from tide, because it is **vex's, engine-side, already
built**: a reflex's selections and writes execute under its own tenant principal's
compiled scope policy — the same wall that holds for humans. A reflex physically
cannot see or touch another tenant's rows, so tenants cannot influence each other
through tide any more than through a screen. Even the stray case fails safe: a reflex
woken by another tenant's write runs its selection under its *own* policy, sees zero
rows, and does nothing — the ordinary outcome, again.

**The ledger is scopeable for the same reason, and it needs one column to be.** A run
records the `as` its reflex declared. Tide does not know what it means; a host scopes
on it — under moss, an ordinary scope rule matching `tide_run.as_who` to a value
derived from the principal. **⟲** Before that column existed, the host's alternative
was to read the whole ledger and filter it in application code on a prefix convention
in the reflex id: the one tenant boundary in the reference app *not* enforced by the
engine, and one rename away from being silently wrong.

What tide deliberately does **not** parse: the `select.query` blob and the template
configs. The first belongs to the `select` seam (under moss: a vex
`{ fingerprint, context }` replay; under plain Node: perhaps `{ sql, params }`); the
second to the `transform` seam (under any nisc host: Prism). Tide stores them, diffs
them, hashes them into the reflex version — and hands them over verbatim. Nova does
exactly this with Prism endpoint configs; tide does not get to be smarter than nova
about other packages' languages. The honest cost: tide cannot validate a template at
load — a typo'd `$ref` surfaces at preview or execution, recorded on the task.

### Trigger

Three kinds (and two more fact flavours). Structured on purpose — a reflex is shown to the operator it affects, and
`{ every: 'month', on: 1, at: '03:00' }` is reviewable by the person it bills where
`0 3 1 * *` is a shibboleth.

```jsonc
{ "clock": { "every": "day" | "week" | "month" | "year", "on"?: 1..31 | "mon".."sun" | "MM-DD",
             "at": "HH:MM", "tz": "IANA name" } }                   // the owning tenant's tz — the row is theirs
{ "clock": { "at": "2026-09-14T09:00", "tz": "IANA name" } }        // one-shot
{ "fact":  { "entity": "charge_attempts", "op"?: "insert" } }       // pushed changes, optionally one op
{ "fact":  { "signal": "stripe" } }                                 // pushed external events
{ "fact":  { "run": "billing.charge-due" } }                        // a settled run — fan-in and dependencies
{ "manual": {} }                                                    // fired only by hand
```

Any reflex — whatever its trigger — may additionally be fired by hand through
`fire(reflexId, input?)`, **including a disarmed one**: arming gates *triggers*, not
people, and testing before arming is half of what `fire` is for; the ledger records
`manual:<who>` either way. A `manual` trigger just means *only* by hand. And `fire`
is sugar over `ingest`: it mints a `manual` fact aimed at one reflex — `at` supplied
by the caller, like every fact — so even the human verb enters through the one intake
and reads no clock.

### Fact — the public intake contract

The fact is tide's whole ingestion surface. Anything that can produce this shape can
drive tide; nothing else about the producer is tide's business.

```jsonc
{
  "kind": "write" | "signal" | "manual" | "run",
  "entity"?: "charge_attempts",          // write facts: what changed  (REQUIRED for a write)
  "op"?: "insert" | "update" | "delete",
  "row"?: { /* the row, as returned by the write */ },
  "name"?: "stripe",                     // signal facts: which intake  (REQUIRED for a signal)
  "payload"?: { /* validated at the host's boundary before it gets here */ },
  "reflex"?: "billing.charge-due",       // run facts: whose run settled (minted by tide)
  "runId"?: "…",
  "occurrence"?: "2026-03",              // run facts: the calendar key, when the clock was the cause
  "stats"?: { "total": 500, "done": 488, "failed": 12 },
  "target"?: "billing.charge-due",       // manual facts: the one reflex it is aimed at
  "at": 1755600000000,                   // supplied by the caller — tide reads no clocks
  "notBefore"?: 1755859200000,           // a delayed fact: timers as data
  "dedupeKey"?: "evt_92xk…",             // provider event ids; duplicates drop silently
  "cause"?: "task:…"                     // set by tide when an effect emits — the causality chain
}
```

**The union is enforced, and ⟲ it was not.** Each kind requires the fields that make it
addressable and refuses the fields belonging to the others. `{ kind: 'write' }` with no
entity used to parse, store, match nothing, get marked delivered, and vanish — a
producer with no way to learn its fact was never going to wake anything. An
unenforced union is worse than none, because it is documented.

`notBefore` earns its place twice: "retry the decline in three days" and "remind them
in an hour" are both delayed facts sitting in the ledger — visible, queryable rows
surviving restarts, not `setTimeout`s hiding in a process. And a delayed fact needs no
cancel API: the reflex it wakes re-checks reality through its selection, and **zero
rows is an ordinary outcome** — the guard is a query at fire time, not state to clean
up. Reality is the cancellation token.

Because the fact is durable *before* it is interpreted, a delayed fact meets the
reflexes loaded on the day it comes due, not the ones loaded when it arrived. That is
the point of the intake being a row: see **The ledger**.

**Ops are distinct stimuli, and intent is a row.** `op` rides every write fact —
"only on create" is `on: { fact: { entity: '…', op: 'insert' } }`, and things that
happen exactly once ride inserts naturally when the domain models intent as rows: a
receipt doesn't follow "invoices where status = paid" (a *state*, which every later
address edit still satisfies) — it follows a **payment**, inserted once, the moment
it happens. Where a domain does hang state on a wide row, the guard is the
**selection**: don't ask "is the row in state X" — ask "is there work left to do"
(*paid invoices without a receipt*). The chain records its own progress because
effects write outcomes, and zero rows is the ordinary outcome doing its job.

**Run facts are the fan-in mechanism, and they cost nothing.** Tide is the
bookkeeper of its own fan-out: the run knows it minted 500 tasks, tasks settle one
by one, and when the last settles, tide mints a `run` fact with the stats. "Send
one digest when the batch is done" is an ordinary reflex on that fact — no barrier
primitive, no "am I last?" logic in handlers. The same fact is the dependency
mechanism ("run B after A succeeds" = `on: { fact: { run: 'A' } }` with a `when` on
`$.fact.stats.failed`). A zero-task run settles immediately and mints its fact with
`total: 0`; a digest that shouldn't fire on empty runs says so in `when`.

---

## The machine

```
advance({ now, limit })              — ONE committed increment; the driver's verb
   │
   ├─ 1 MATERIALIZE   clock triggers → due runs, keyed by LOCAL calendar fields
   │                  (idempotent on the key; catch-up applied: run late / skip / latest;
   │                  skipped occurrences leave run rows saying so. A DISARMED reflex
   │                  materializes nothing AND keeps its watermark moving — see ⟲ below)
   ├─ 2 MATCH         undelivered, due facts × fact reflexes → `when` filters (a `when`
   │                  that THROWS is a recorded non-match, never a crashed advance and
   │                  never a silent one) → runs. Matching is per (fact, reflex); one
   │                  fact can wake five — but never across identities (see the leak
   │                  doctrine). A reflex matches only facts at or after its arming.
   │                  With ZERO reflexes loaded the pass does nothing at all, rather
   │                  than marking the backlog delivered against nobody.
   ├─ 3 FAN OUT       pending runs → unit tasks, committed IN ONE TRANSACTION with the
   │                  run's move to `fanned`. A write fact CARRIES its row: with no
   │                  selection declared, that row IS the unit (re-selecting would ask
   │                  a question the fact already answers); a declared selection is
   │                  ENRICHMENT, re-run under the reflex's own principal — the guard
   │                  that re-checks reality. Duplicate unitKey refuses the run
   │                  loudly; a transient seam failure DEFERS it.
   ├─ 4 CLAIM         due tasks and lapsed leases, in one statement — exactly-once,
   │                  `order: 'serial'` honoured inside the claim, `attempt`
   │                  incremented as part of it, one fencing token per claim
   ├─ 5 EXECUTE       transform(effect.input, $) → effects[name].run(input, ctx),
   │                  raced against timeoutMs
   └─ 6 RECORD        done / retry-scheduled / failed, token-checked; buffered emits
                      committed in the same transaction; the run's counters updated;
                      settled runs drained into their run fact, exactly once
```

Every stage is a pure function over `(reflexes, ledger, now)` plus the injected seams.
A chain advances one hop per call — which is why the driver drains to quiescence on
every wake, bounded by the chain-depth ceiling rather than by anybody's patience. Two
instances advancing concurrently are safe by construction: run inserts are idempotent
on `(reflexId, cause)`, task claims are exactly-once through the store contract, and a
non-monotonic `now` (clock skew between hosts) merely delays work — it cannot
duplicate it.

**⟲ There was a poll trigger, and there was a beat.** Polls existed for hosts with no
write choke point: run a selection on an interval, diff a cursor, mint write facts for
the delta. In this stack the DAL is the choke point — every application write becomes
a fact at the vex bridge the instant it commits — so a poll could only re-discover
what was already pushed, one interval late; and the interval itself (`setInterval`
calling the old `tick`) was both a latency floor and a throughput ceiling: a chain
advanced one hop per minute, and a 100-task limit on a 60-second beat capped the
whole system at 144k tasks a day with morning-long backlogs. Both are gone. The
committed step survives as `advance` — it is what makes every check deterministic —
and the pacing moved to the host's driver: wake on ingest, drain to quiescence, sleep
until `nextDue`. The poll's hardest-won lesson (a non-unique cursor loses ties; a
minted delta must not cross tenants) lives on in the identity fence, which outlived
the trigger that taught it.

### The ledger

**Four tables, and only two of them grow with events.** Each is here because it carries
a guarantee nothing else can:

| | the guarantee |
|---|---|
| **`fact`** | durable *before* anything interprets it — so `ingest` is one atomic write, matching is retryable in the advance, and a delayed fact meets the reflexes of the day it fires |
| **`run`** | `UNIQUE(reflexId, cause)` — *the* idempotency, one constraint serving all four trigger kinds; plus atomic fan-out, the completion counting fan-in reads, and `overlap: 'skip'` |
| **`task`** | `UNIQUE(runId, unit)`, written before the effect; the lease; the retry counter |
| **`state`** | where a reflex has got to: arming baseline, clock through-line. One row per reflex — bounded by how many exist, never by what happened |

- **`fact`** — everything that arrived: kind, payload, `dedupeKey`, depth, delivery,
  any park. The intake log *is* the audit trail of change.
- **`run`** — one activation of one reflex: the cause (occurrence key, fact id, run id,
  or `manual:<who>`), the version hash, the identity it ran `as`, what the selection
  returned, the counts, the outcome.
- **`task`** — one unit of effect work: unit key, pinned `env`, state, attempt count,
  last error, and the handler's returned **output** — stored, which is what makes
  non-write effects (an external call, an agent's answer) selectable downstream
  without inventing a domain table.

**⟲ There were seven, and three of them cost real correctness.** The removed ones and
why each was vocabulary rather than schema:

- **`delivery`** — a join table for "which reflexes did this fact wake", which is now
  the `cause` column: `WHERE cause = 'fact:<id>'`. Its other job, recording
  non-matches, grew one row per (fact × loaded reflex) — faster than the work itself —
  and is an event now, which a host logs at whatever grain it wants.
- **`attempt`** — correctness needs the count and the last error, both of which belong
  on the task. Per-attempt history is the host's log, which is where it was already
  being read from; nothing in this repo ever called `listAttempts`.
- **`window`** — deleted with coalesce (below).
- **`watermark`** — an unbounded key/value table with a growing set of string keys,
  for a couple of facts about each reflex. It is columns on `state` now. The clock
  through-line *is* derivable from `MAX(cause)` over the runs, but only while those
  runs exist, and retention is allowed to delete them.

Collapsing `fact` into `run` was considered and refused, and the reasoning is the
sharper half of the principle. Two tables would mean matching moves onto `ingest`:
evaluating every loaded reflex's `when` and opening N runs, synchronously, on the
host's request path — where a throw at reflex three of five leaves two runs and no
record that the fact ever arrived. A delayed fact would resolve against the reflexes of
its *arrival*, and a fact that matched nothing would leave no trace to dedupe or
explain. **Durability precedes interpretation** is the same argument as *idempotency
precedes the effect*, one layer earlier, and the intake table is what makes it true.

Causality is first-class: every run knows its cause and every emitted fact knows its
task, so *"why did this member get this email"* is a walk up a chain of rows —
`email ← draft approved ← draft written ← charge.failed ← evt_92xk` — not an
archaeology project.

**Retention is a policy, not an accident.** The ledger grows without bound unless told
otherwise; `sweep(now, { facts?, runs?, tasks? })` deletes settled rows past a horizon,
and the default is *keep forever*, which is the only honest default when the rows are
billing history. Deleting a run takes its tasks with it — **⟲** independent horizons
per table meant sweeping tasks could destroy the `UNIQUE(runId, unit)` row that *is*
the "this unit already ran" record, and a restore would then re-charge the invoice.

### Execution semantics

The requirements doc calls this "the part that must not be hand-waved." In order:

- **Idempotency.** The task row is written *before* the effect runs, keyed
  `UNIQUE(runId, unit)`. A duplicate trigger, a second instance, a crashed-and-restarted
  advance — all collide with the existing row and are refused. There is no path to the
  effect that does not pass through the insert. Handlers additionally receive the task
  key in `ctx` for downstream idempotency — a payment capture passes it to the provider.
- **Fan-out is transactional.** A run's tasks commit together with its move to
  `fanned`. This exists because the alternative is quietly catastrophic: a fan-out that
  crashes at row 200 of 500 and resumes would *re-select against moved data* — a member
  who paid in the gap keeps a task minted from the stale pass. Atomic fan-out means a
  crash leaves nothing to resume from; the re-run selects fresh and mints clean. The
  run's `total` is what was **written**, not what was offered — **⟲** counting the
  input array meant any refusal by the unique key left `total` permanently
  unreachable, so the run never settled, never drained, and blocked its reflex for good.
- **A bad minute is not a bad reflex.** A fan-out failure is two different things. A
  `TideError` is tide's own refusal — a duplicate unit key, a missing `select` seam —
  so the reflex is wrong and will be wrong again next time: the run is `skipped`, with
  a note. Anything else came out of a host seam, and the run stays `pending` to be
  retried, which is a row past its due time that a query can see. **⟲** Every throw
  used to skip; because runs are idempotent on `(reflexId, cause)`, the occurrence
  could never re-materialize, so one unreachable database destroyed that night's
  billing run permanently — and since `skipped` is not `settled`, everything waiting on
  it waited forever.
- **Retry is a type distinction, not metadata.** An effect that **returns** is done —
  a card decline is not an error but a *domain outcome*, which the handler records and
  the flow branches on via reflexes. An effect that **throws** is transient — tide
  retries on the bounded backoff, then parks the task `failed`: terminal, visible, and
  exit-able only through the human verb `retry()`.
- **`retry()` rewinds the run, and ⟲ it did not.** A failed task had already settled
  its run, and a claim only reaches tasks that are claimable; reopening the task alone
  left it `pending` forever, so the only documented exit from `failed` did nothing at
  all. Reopening now moves the run back to `fanned` and decrements `failed`, in one
  transaction. The old objection was real — a digest already went out saying twelve
  failed, and re-settling must not send it again — and it is answered by `drained`, a
  flag on the run recording that its settlement has been announced. The run rewinds;
  the announcement does not repeat.
- **Attempts are fenced.** A timeout marks the attempt failed and schedules a retry —
  but the timed-out effect may still be running. Each claim mints a token; recording a
  result requires the token to still be current, so a zombie completion is discarded
  instead of overwriting the live attempt. (Its external side effect is exactly what
  the downstream idempotency key defends against.) One token per *claim*, not per task:
  the fence's job is to tell this claim apart from an earlier one, and a task appears
  in at most one claim.
- **A lease is the whole recovery story.** A claim writes `claimedUntil`; a task still
  claimed past it is claimable again. **⟲** There was no lease, no expiry and no
  reaper, so a process that died between the effect and the record left the task
  `claimed` forever: the run never settled, never drained, fan-in stalled, and an
  `overlap: 'skip'` reflex was blocked permanently. The alternative designs — a reaper
  process, a heartbeat table, a liveness service — all add an organ; expiry adds a
  column, and the fencing token is what makes it safe.
- **Emits are buffered, validated, and narrowed.** `ctx.emit` facts commit with the
  successful attempt, in the same transaction; a throwing attempt discards its buffer,
  or every retry of an emit-then-throw handler would double-mint facts and fire the
  chain twice. Emit accepts `write` and `signal` only: **⟲** it accepted anything and
  validated nothing, so a handler could emit `kind: 'manual'` and fire a **disarmed**
  reflex — manual facts are checked before enablement on purpose, because arming gates
  triggers rather than people, and a handler is not a person.
- **Concurrency has three dials, each where its limit lives.** Per-task claims are
  exactly-once (in SQL: `FOR UPDATE SKIP LOCKED`). Per-reflex: `overlap: 'skip'`
  refuses to start a run while the last is unsettled, and `order: 'serial'` allows one
  in-flight task at a time — enforced *inside* the claim, because a caller that counts
  what is busy and then claims loses the race to its own second instance. Provider rate
  limits need no tide vocabulary at all: a throttled provider answers 429, the handler
  throws, and the bounded backoff *is* the backpressure.
- **Overlap governs repeats, not distinct events.** *"May this start while the last is
  unsettled"* is the right question about an occurrence — next month's billing run
  arriving while this month's is still going is the same work coming round again — and
  about a `manual` fact, which is a human pressing the button twice. It is the wrong
  question about a payment. **⟲** It was asked of every cause, and `'skip'` is the
  default, so every fact-triggered reflex silently dropped its second fact per pass:
  three members joining in one minute produced one welcome email and two skipped runs.
  The failure scaled with traffic, which is the wrong direction, and it was invisible
  in the reference app because nothing there ever exercised the watched path with more
  than one row. Discarding an external event that exists exactly once is data loss;
  `order: 'serial'` is the dial that bounds concurrency by queueing instead.
- **Partial failure.** One task per unit, one transaction per task. If number 237 of
  500 throws, the first 236 stay done, 237 retries or parks, 238 onward run. There is
  no all-or-nothing batch to get wrong.
- **Catch-up is authored, not guessed.** After downtime, `'run'` fires missed
  occurrences late, `'skip'` drops them, `'latest'` fires only the most recent of
  several missed. Each leaves a run row saying which happened — a skipped run is a
  recorded decision. When a single advance would exceed the per-call cap, the watermark
  stops at the last occurrence actually materialized: **⟲** it used to jump to `now`
  regardless, so everything past the cap was unreachable forever with no row saying it
  had existed.
- **Timeouts.** Every effect races `timeoutMs`; a hung external call marks the attempt
  failed and frees the schedule.
- **Silence is visible.** Occurrences are materialized ahead, so a run that should have
  happened and didn't is a `pending` row past its due time — a *query*, not a vanished
  event. "Alert on silence" is a tide reflex watching tide's own ledger.

### The tenant boundary inside the engine

Every database access a reflex makes already goes through the host: a
selection and an effect's write both run as that reflex's own principal, under
a compiled scope policy, and neither can see another tenant's rows. That is
vex's job and it does it.

**Tide is the one place a row travels without being read.** A bridge-minted
fact carries the row its write committed; `ctx.emit` carries a row a handler
built; a settled run carries its counts. Those are payloads, not queries — so
no policy is consulted when they move, and nothing downstream can catch it if
they move to the wrong place.

**⟲ They did, and this is the most serious defect the package has had.** The
matcher paired facts to reflexes by ENTITY alone. Two studios each running
"welcome somebody who joins" both watched `memberships`; one studio's fact
matched the other's reflex, which fanned out over a person it had never
selected. The competitor's automation then emailed that member — under its own
studio id, correctly stamped, with somebody else's name and address inside.
The scope engine was not wrong to allow it: the row written was legitimately
the sender's. Only the data in it had crossed.

So a fact carries **`as`** — the identity of the reflex that minted it — and a
reflex matches only facts bearing its own. Stamped by the engine and never by
a handler, for the same reason `depth` is: a handler that could choose its own
identity could choose somebody else's. The string stays opaque; equality is
the whole rule, and tide still never learns what a principal is.

The rule is **strict**, including at the intake. `ingest(fact, { as })` is how
a host says whose webhook it just received; a fact with no identity reaches
only reflexes with no identity. An earlier version exempted unlabelled facts
on the reasoning that the host knows what it ingested — which is a hole with a
rationalisation on top, and it failed open.

**Identity equality** stops a fact crossing between tenants at every door —
ingest (the bridge stamps `as` from the WRITE's own scope, mapped by the
app's naming rule), fire, emit, and run-settlement. And within one tenant, a
write fact is a STREAM: every reflex watching the entity hears the same fact,
which is what makes "welcome them" and "tell the desk" two reflexes instead
of one with two jobs.

This is defence in depth, not a replacement for scoping. Vex still enforces
every read and every write; this closes the gap vex structurally cannot see.

### Occurrences and time

Occurrence identity is **(reflex, local calendar fields)**, never instants: the
March monthly run of a studio's billing reflex is `<its id>:2026-03`, the daily is
`…:2026-03-07` — and since a reflex id names one tenant's row, no two tenants' runs can
meet on a key. A DST boundary can move the *instant* a key fires at; it cannot mint a
second key or lose one — the double-fire and the skip are structurally impossible
rather than carefully avoided. The calendar edges are decided, not discovered:

- `every: 'month', on: 31` **clamps to the last day of the month** — February bills on
  the 28th (29th), because "skip February" is never what a billing rule means.
- A local time erased by spring-forward resolves to the **first valid instant after**;
  a local time that fall-back makes ambiguous takes the **first occurrence**. The key
  is identical either way.
- Timezone resolution uses the platform's IANA data (`Intl`), keeping the dependency
  count at zero. "03:00 in Vienna" and "03:00 in Denver" are both honest.

Occurrences being enumerable is also what makes **backfill** (deferred) natural:
"run the report reflex over the last 12 months" is materializing twelve past keys.

### Arming, and what a pause means

Matching starts at a reflex's arming, and a reflex never retro-fires. Two faces of
one rule, each needing its own sentence because each has its own way of reaching for
the past: a **clock** reflex with no arming time establishes its baseline on the
first advance and materializes nothing; and a **fact** older than the arming belongs
to a world in which the reflex did not exist.

A **paused** reflex materializes nothing and keeps its watermark moving. A reflex
*entering* the loaded set re-baselines to the `at` passed to `load`. Both say the same
thing: coming back is not the same as never having left.

**⟲ This is where the worst defect in the package lived.** A disarmed reflex was
skipped outright, which froze its watermark at the moment of the pause. Eight days off
meant eight occurrences materialized the instant it came back — and eight real effects
executed. Verified by running the built engine, not by reading it.

**⟲ And there is no `arm`/`disarm`.** There was a pair, and they mutated an in-memory
map: a second copy of a fact the host already owned as a column, lost on restart, and
disagreeing with the host's own screen in between — so re-reading the rows silently
undid a pause somebody had just made. Enablement is a property of the reflex the host
hands over. To pause one: write your own row, `load` again. One source of truth, it
survives a restart, and it leaves something to audit where a method call left nothing.

### Preview — dry run as a verb

`preview(reflexId, { now, fact? })` runs the real pipeline — materialize or match,
select against real data, evaluate every template — and stubs **one function**: the
effect executor. What comes back is the run that would happen: the occurrence or
fact, the selected rows (the eleven members, by name), each task's resolved input,
plus whatever the effect's optional `preview` hook renders. Because every effect passes
through the same choke point, there is no per-reflex dry-run flag and no `if (dryRun)`
to forget — a reflex *cannot* opt out of being previewable. Preview is also where
template typos surface, which makes it the authoring loop's inner verb.

### The graph, verified at load

`load(reflexes)` validates every artifact, hashes versions, and derives the graph:
what reflexes WATCH (their triggers) × what their effects WRITE × their **run-fact
subscriptions** — that last edge class matters, because fan-in creates cycles the
write edges alone can't see (B fires on A's run; B's run feeds C; C writes what
triggers A).

Cycles are **classified, not banned** — because tide's own best patterns are cycles
on purpose: a drip campaign is a reflex whose delayed fact fires itself; "retry the
decline in 3 days" loops through `notBefore`; a drain loop subscribes to its own run.
All converge because every loop passes through a **guard**: a selection that re-checks
reality, a `when`, or a `notBefore` delay. Static analysis cannot tell a convergent
cycle from a divergent one, so it does not pretend to:

- An **unguarded** cycle — every hop unconditional, no selection, no `when`, no
  `notBefore` anywhere on the loop — is refused at load: it diverges by construction.
- A **guarded** cycle is legal and reported as a finding, so the author sees the loop
  they built.
- The runtime backstop is nearly free because causality already exists: a fact whose
  cause chain exceeds `maxChainDepth` is **parked for review instead of fired**. Depth
  is stamped on the task at fan-out rather than read back from the run at emit time —
  **⟲** a run swept out from under a long-running chain answered `undefined`, resetting
  the ceiling to zero in exactly the swept, long-running case the backstop exists for.
  Releasing a parked fact **records** the override; **⟲** clearing the park alone was a
  ping-pong, because the depth that parked it had not changed and never would.

Load **refuses** outright: an unguarded cycle, a reflex naming an unregistered
effect, a `when` on a non-fact trigger. The verification is only as good as the
effects' `writes`: under moss they are *derived* (from `mutationEffect` on the vex
mutation behind each effect), so an edge is never guessed; a plain host declares
them or forgoes the check, and an effect with none is reported as a **blind** edge,
never silently trusted — under moss, blind means something bypassed vex, which is
exactly when a loud word is wanted. If it loads, it's coherent — the moss tradition,
one layer down.

---

## Flows — chains, not bodies

The requirements' hardest sentence: *"charge the card, and if that succeeds mark the
invoice paid and send the receipt; if it fails, record the failure and schedule a
retry — without dropping into imperative code."* As a chain:

```
clock ─→ [billing.charge-due] ── payments.charge ──→ charge_attempts row
                                                        │
            fact: charge_attempts (succeeded) ─→ [billing.mark-paid]      ─→ invoices row (paid)
            fact: charge_attempts (declined)  ─→ [billing.record-decline] ─→ invoice failed row
            fact: invoices (paid)             ─→ [billing.send-receipt]   ─→ mail
            fact: run billing.charge-due      ─→ [billing.digest]         ─→ owner's summary mail
            clock (daily) + select: declines ≥ 3 days old, still open ─→ [billing.dunning-notice]
```

Six reflexes, co-located in one `billing.reflexes.ts`. Every arrow is a committed row;
a crash anywhere resumes from the last row; every intermediate state has a name an
operator can query. Note the dunning line: it needs no cancel API when the member pays
— its selection asks "still open", and zero rows is an ordinary outcome.

**Data passes through three lanes, and the principle is one sentence:** *facts carry
the datum, the ledger carries the history, the domain rows carry the state — and
selection reaches all three.* The fact brings `$.fact.row`; task `output` makes any
effect's result selectable; and a selection joins whatever it needs (under moss, tide's
tables are vex entities — the digest's selection reads the tasks of `$.fact.runId`
joined to members). Nothing is "passed" in memory; everything is written where the next
reflex can read it.

**The granularity rule** — the one authored judgment this design asks for: *a joint
the business cares about (retry it independently, observe it, resume from it) is a
fact + reflex; a joint it doesn't care about lives inside one effect handler.* Two
external API calls that form one atomic business step are one handler — an endpoint is
a sanctioned home for imperative code, and the artifact thesis governs the automation,
not every HTTP call inside an effect.

**Mode guidance:** `batch` pins the whole result into one task and is for bounded sets
(a digest of dozens); a large set is `each` + a run-fact digest — 500 tasks and one
summary reflex, not one task carrying 500 rows.

**⟲ And there is no `coalesce`.** A policy field held matching facts in a window and
fired once with the batch. It cost two port methods, a table, an exactly-once promise
and a `DELETE … RETURNING` on every advance — and nothing ever set it; its only driver was
one test. It also had a quiet correctness bug: a throwing group key fell back to the
shared `''` window, so a per-customer digest could carry another tenant's rows. A
digest that genuinely needs batching is a **delayed run**: the first fact of a group
mints one at `now + window` under `cause: 'coalesce:<key>:<start>'`, the rest collide on
`UNIQUE(reflexId, cause)` and are refused, and when it comes due the reflex selects
what changed. Mechanisms that already exist, consistent with *the database is the
interpreter*, and no table.

---

## The seams

Five injection points. Every one is a move the stack has already made once — which is
the argument that tide is a *nisc* library and not a scheduler with JSON config:

| Seam | Contract | The host injects | Precedent |
|---|---|---|---|
| `store` | `TideStore` — six capabilities over four tables (below) | `createMemoryStore()` shipped; `createTideStore(pool)` from **moss** for persistence | vex's `CacheBackend` — structural, driver-free |
| `transform` | `(config, source) => value` | Prism's `evaluate`, or anything | **nova's exact socket** — nova doesn't know Prism; neither does tide |
| `select` | `(query, ctx) => AsyncIterable<row>` — the query blob is opaque | vex replay under the actor's policy; or raw SQL; or an array | vex's `generateDsl` / `mapToShape` |
| `effects` | `name → { run(input, ctx), writes?, preview? }` | vex mutation replays, fns, cortex agents; or plain functions | moss's `functions` seam |
| `ctx` | opaque, threaded through to `select` and `effects`; carries `taskKey`, `emit`, `now` | moss: `ActorContext` (principal, policy, wire) | charter's universe-blindness, applied to identity |

Plus the driver-facing edges, contracts rather than injections: **`ingest(fact)`**
in, **`advance({ now, limit })`** to run one committed increment, and
**`nextDue(now)`** so the driver knows when next to wake.

Dependencies: **`zod`**. Nothing else — the same bar charter clears.

### The store contract

```ts
type TideStore = {
  transact:       <T>(fn: (tx: TideStore) => Promise<T>) => Promise<T>;
  appendIfAbsent: (table, row) => Promise<Row | undefined>;
  claim:          (spec: ClaimSpec) => Promise<readonly Row[]>;
  cas:            (table, id, expect, set) => Promise<boolean>;
  query:          (spec: QuerySpec) => Promise<readonly Row[]>;
  remove:         (spec: RemoveSpec) => Promise<number>;
};
```

**⟲ It was twenty-seven methods**, shaped by nouns × verbs, and everything wrong with
the storage layer was downstream of that. `claimTasks`, `drainSettled` and
`claimClosedWindows` were three hand-written implementations of *one* operation, and
they diverged three ways; nine of the methods were reporting reads the engine never
called, so a reporting surface lived inside an execution contract. Shaped by what the
guarantees need instead, it is six — and the engine holds every opinion about retry,
arming, occurrences and coalescing, while the store holds none.

`UNIQUE_BY` is exported alongside it: the four unique keys **are** the exactly-once
promises, written down once so no store can drift from another's reading of a comment.

**Ledger reads left the port entirely.** Under moss they are vex entries over the same
tables — authored, scoped, cached, inspectable; standalone they are the host's own
queries. `tide.ledger.*` is a convenience over `query`, not a contract a store
implements.

### Holding two stores to one definition

`STORE_CONTRACT`, exported from `@niscorp/tide/testing`, is the executable definition
of everything above: a list of `{ name, run(store) }` checks that throw, with no test
framework, so any runner can drive them. The memory store runs it; moss's SQL store
runs the same list against a real database.

**⟲ This exists because of the store that was deleted.** `store/postgres.ts` was 700
lines, had never been instantiated anywhere in this repo, and claimed in its own header
to be "held to the same tests" — of which there were none. It diverged from the memory
store in eleven ways: `LIMIT` applied before the serial filter, so one serial reflex
with 5,000 due tasks starved every other reflex; list reads answering opposite ends of
the same list; a dedupe index freed by the sweep, so a replayed webhook re-fired after
the retention horizon; three transactional methods that skipped the ready-guard and
raised `undefined_table` *inside* a transaction. Every one was invisible. The lesson is
not "write more tests" — it is that a contract nobody can execute is a comment.

---

## Hosts

### Moss — the reference host

Moss fills every seam, and now the last one:

| Tide seam | Moss fills it with |
|---|---|
| `store` | **`createTideStore(pool)`** — four tables beside `vex_cache`, `ON CONFLICT DO NOTHING` for `appendIfAbsent`, `FOR UPDATE SKIP LOCKED` for `claim`, CHECK constraints on every state column, and a foreign key that cascades work with its run |
| `select` | vex replay **through the actor's own wire** — selection inherits replay-only, scoped, cached, inspectable; the tenant filter is in the SQL, engine-injected, unforgeable |
| `effects` | every seeded vex **mutation** auto-registered under its fingerprint (with `writes` *derived* from `mutationEffect`) + the app's `effects(actor)` |
| `transform` | prism — the same wiring the shell's transform socket already gets |
| `ctx` | `ActorContext`: the charter-resolved, engine-enforced, no-shell principal |
| the ledger | ordinary vex entries over `tide_run`, scoped by the host on the identity the run declared |

**The engine's writes do not go through vex's mutation pipeline, and the reason is
worth stating because the opposite looks tidier.** A vex mutation is an authored,
scope-compiled statement replayed on behalf of a principal — the right shape for an
application write, and the wrong shape for an engine claiming its own task: there is no
principal, no tenant to scope to, and no user input to police. Routing bookkeeping
through a policy compiler would add a scope rule permitting everything, which is a way
of saying the rule is not doing anything. The **reads** are the half that belongs to
vex, and they are authored entries like any other.

**Tide's tables are ordinary tables.** The first instinct was to hide them from
introspection, since they carry no tenancy of their own — but that is true of any table
with no scope rule, and it is the scope rule that has always been what makes
`memberships.read` safe. Hiding them would have closed the door as well as the hole: a
scoped entry over the run ledger cannot compile against a table vex has never heard of.

**Two live vex bugs surfaced on the way here**, both fixed rather than worked around:
no adapter implemented `transaction`, so *every batch mutation in every app* threw
"Batch mutations require a transactional client" — a message about a client nothing in
the repo could construct; and the PGlite shim's method needed its receiver, so
destructuring it produced a transaction that failed inside the library.

### Plain Node — the floor

```ts
const tide = createTide({
  store: createMemoryStore(),                                   // or your own, held to STORE_CONTRACT
  transform: (config, source) => evaluate(config, source),      // prism, or your own
  select: async function* (q) { yield* (await pg.query(q.sql, q.params)).rows; },
  effects: {
    'mail.send':    { run: (input) => mailer.send(input) },
    'orders.close': { run: async (input, ctx) => { await pg.query(/* … */);
                        ctx.emit({ kind: 'write', entity: 'orders', row, at: ctx.now }); },
                      writes: ['orders'] },
  },
});
tide.load(reflexes, { at: Date.now() });
app.post('/webhook/stripe', (req) => tide.ingest(toFact(req)));  // validate at the boundary first

// The driver: wake on ingest, drain to quiescence, sleep until nextDue.
// (Under moss this is `createTideDriver`; standalone it is these lines.)
const drain = async () => { for (;;) { const r = await tide.advance({ now: Date.now() }); if (isQuiet(r)) break; } };
```

No vex, no moss, no nova — and no magic either: facts must be ingested (a host with
its own write choke point pushes; one without builds an importer that pushes),
`writes` must be declared, the driver is theirs to run, and the outbox guarantee is
theirs to keep. `ctx.emit` is how a chain continues without a write choke point.

---

## File structure

```
src/
  index.ts                 Public API barrel — createTide, schemas, the store contract
  testing.ts               STORE_CONTRACT — the executable definition of a store
  tide.ts                  createTide: load, ingest, advance, nextDue, fire, retry, preview, ledger, sweep
  types.ts                 ledger rows, seam types, TideStore, UNIQUE_BY, reports
  errors.ts                TideError (code + details)

  schemas/
    reflex.schema.ts       ReflexSchema — trigger, select, effect, policy, enabled
    trigger.schema.ts      clock | fact | manual, with narrowing helpers
    fact.schema.ts         FactInputSchema — the public intake contract, union enforced
    policy.schema.ts       retry, backoff, overlap, order, catchUp, lateMs
    index.ts

  engine/
    advance.ts             the pipeline, in order, over (reflexes, store, now)
    due.ts                 nextDue — the instant the driver should wake for
    runtime.ts             EngineDeps, the `$` environment, isTruthy, versionOf
    occurrence.ts          calendar math, local-field keys, clamping, DST edges
    materialize.ts         clock → runs (catch-up, watermark)
    match.ts               fact × reflex, `when`, and openRun — the one place a run is born
    fanout.ts              selection → transactional unit-task commit; refuse vs defer
    execute.ts             claim → fence → transform → effect → record; the ONE door
    preview.ts             the same pipeline with the executor stubbed
    graph.ts               watches × writes × run subscriptions; refusal at load

  store/
    memory.ts              createMemoryStore — the reference implementation + snapshot()

test/
  occurrence.test.ts       DST both directions, clamping, key stability
  engine.test.ts           the execution semantics, end to end on a fake clock
  durability.test.ts       one test per defect that reached the built engine
  load.test.ts             the load gate: validation, cycles, versioning
  preview.test.ts          dry run writes nothing and shows everything
  store.test.ts            STORE_CONTRACT × every store
```

`materialize.ts` is split out of `advance.ts` because the clock is where the engine
*creates* work from nothing, and it reads better alone than buried in the
orchestrator. There is no `verbs.ts`: `fire` is four lines of sugar over `ingest`,
and `retry` belongs beside the executor whose invariants it rewinds.

There is no `store/postgres.ts`. **The moss integration lives in moss, not here — tide
must never import a host**, and persistence is where that rule earns its keep.

---

## Key design decisions

1. **No run body — the database is the interpreter.** Three earlier shapes died to
   get here: a bespoke step language (new grammar the stack didn't need), nova's
   trigger steps executed headlessly (the right grammar, but it hauled in shells and
   render machinery), and a moss subsystem (which handed moss a vocabulary, the one
   thing moss refuses to own). What survived: an in-memory step chain must journal each
   step to survive a crash — rebuilding a workflow engine's checkpointing — while a
   chain of facts and reflexes gets durability, resumability, per-step retry policy and
   per-step observability *from its shape*. The cost is real and named: flows span
   artifacts. The answer is co-location in authoring and the derived graph at load.

2. **A table earns its place with a guarantee, not a noun.** Seven became four. The
   surviving test is short: *what does this schema promise that nothing else can?* An
   intake that is durable before interpretation, one uniqueness constraint that is the
   idempotency for every trigger kind, one that is the idempotency for a unit of work,
   and a bounded row saying where each reflex has got to. Everything else was a
   vocabulary word that had been handed a table and, with it, accessors, retention,
   divergence and bugs.

3. **Fan-in is bookkeeping, not a primitive.** The run fact exists because tide
   already knows when the last task settles — emitting that knowledge as an ordinary
   fact turns fan-in, dependencies and batch digests into ordinary reflexes. Exactly
   once through `drained`, a flag on the row rather than an in-memory queue: a queue
   cannot survive a restart and cannot be rewound, which is what made fan-in and the
   recovery verb mutually exclusive.

4. **Fan-out is transactional; unit keys collide loudly.** A resumable partial
   fan-out re-selects against moved data — for a billing run, that is charging someone
   who already paid. Atomicity makes the crash case the clean case. And a duplicate
   `unitKey` inside one run refuses the run rather than silently dropping a row —
   authoring errors are loud or they are invisible.

5. **Attempts are fenced; emits are buffered; claims are leased.** All three exist for
   one reason: a retry must not let a previous try's ghost act, and a dead process must
   not hold work forever. The token check, the buffer-until-success rule, and lease
   expiry close the three leaks a naive executor ships with — and none of them needs a
   background process.

6. **Retry classification is a calling convention.** Return = domain outcome, recorded
   as data, branched on by reflexes. Throw = transient, retried on bounded backoff to
   a terminal, human-visible state. Per-effect metadata declaring which errors are
   retryable is a registry someone forgets to update; a type distinction at the seam
   cannot be forgotten, and it puts the decision where the knowledge lives.

7. **The effect executor is the only door.** Everything that leaves tide — a write, an
   email, an agent — passes through one function. That single choke point is what
   makes preview a *verb*, timeout uniform, the task key uniformly available, and the
   ledger complete. A second path outward would quietly break all four.

8. **Limits live where they bind.** Task uniqueness at the store; run overlap and
   task order on the reflex; provider ceilings in the handler that owns the provider
   relationship. Tide ships no rate vocabulary of its own.

9. **Occurrence identity is local calendar fields, with decided edges.** `2026-03`,
   not an epoch millisecond — DST cannot mint or lose a key. Day-31 clamps to
   month-end; erased local times take the next valid instant; ambiguous ones take the
   first. Decisions in the schema's documentation, not discoveries in production.

10. **A reflex never retro-fires, and a pause is a pause.** Matching starts at arming;
    history before a reflex existed is reachable only through deliberate backfill. The
    two faces — the clock's first advance, a fact older than the
    arming — are one principle: *a new watcher starts watching now.* The fourth face,
    learned the hard way, is that a paused watcher's clock keeps moving.

11. **Enablement is the host's column, not the engine's method.** Two copies of one
    fact is the bug; which copy wins after a restart is only the symptom. `load` again
    is the whole mechanism, and it is auditable where a method call was not.

12. **Selection and shaping are opaque on purpose.** Tide stores, diffs and hashes the
    query and template blobs but never interprets them. The moment tide validates a
    query it owns a query language; the moment it evaluates an expression it owns an
    evaluator — both exist in the stack already, better, behind seams nova proved out.
    The honest cost — template typos surface at preview, not load — is why preview is
    the authoring loop's inner verb, and why preview must use the engine's own
    truthiness rather than a second reading of it.

13. **Identity is the host's, entirely — and written down.** Tide threads an opaque
    `ctx`; moss's `ActorContext` supplies principal, compiled policy and tenancy. An
    automation that "runs as root" is unbuildable through this seam, because tide has
    no root to offer. Recording `as` on the run is what lets a host scope the ledger
    without tide learning what it scoped.

14. **Versioning is a content hash, and the ledger pins it.** A reflex's version is the
    hash of its definition, so the ledger can always say "March ran the old version,
    April the new one." `enabled` is excluded — flipping it isn't an edit. `params` are
    included — changing `graceDays` from 3 to 7 is a behavioural change the ledger must
    explain.

15. **A contract nobody can execute is a comment.** `STORE_CONTRACT` ships from the
    package because the alternative was tried: a store whose header said it was held to
    the same tests, and eleven silent divergences.

---

## Against the requirements

The wishlist, answered — including its own open questions:

| Requirement | Mechanism |
|---|---|
| Clock / change / external / manual triggers | clock, write facts (pushed at the choke point), signal facts, `fire()` — one ledger under all of them |
| Timezone honesty, no DST double-fire | tz is a field on the tenant's own reflex row + local-calendar occurrence keys + decided clamping (§ Tenancy, § decision 9) |
| Selection = an ordinary vex read | the `select` seam; under moss, literally a fingerprint replay under the actor's policy |
| Per-row and per-batch | `select.mode`; large sets = `each` + a run-fact digest |
| Streaming large sets | `select` returns an `AsyncIterable`; fan-out commits in one transaction |
| Effects: write / call out / agent / sequenced with explicit failure | the effects registry; sequences are chains; failure branches are reflexes on outcome rows |
| Idempotency before the effect | task insert refused by `UNIQUE(runId, unit)`; task key in `ctx` for downstream |
| Retry vs terminal | throw vs return (§ decision 6); `retry()` for the parked, and it rewinds the run |
| Concurrency, overlap, ordering, partial failure, timeout, catch-up | leased claims + fencing, `overlap`, `order: 'serial'` inside the claim, task-per-unit, `timeoutMs`, `catchUp` |
| Scoped no-session identity, tenant-bounded | `ctx` seam ← moss's `ActorContext`; engine-side enforcement, unchanged |
| Run ledger, dry run, preview with names, silence alerting, ledger-as-data | facts/runs/tasks; `preview()`; materialized-ahead pending rows; host-readable tables with a retention policy |
| Per-tenant config, instant disarm, versioning across runs | reflexes are tenant rows; disarming is the host's row write + `load` (§ decision 11); content-hash versions (§ decision 14) |
| Host-agnostic wake-up; serverless and local both | `advance({ now })` + `nextDue(now)`: the driver wakes on ingest and sleeps until the next due instant; its janitor beat is recovery, not pacing |
| Deterministic headless checks | memory store + fake clock; no timers exist to wait on |
| Durable across restarts | `createTideStore(pool)` in moss; the memory store remains the reference and the check harness |
| Wishlist: dependency between automations | run facts — `on: { fact: { run: 'A' } }` with `when` on the stats |
| **Open: one library or two?** | one, standalone — "react to a change" is a fact reflex; same machine |
| **Open: does the identity belong here?** | no — moss's `ActorContext`, consumed through an opaque seam |
| **Open: how much effect vocabulary is closed?** | the seam is closed (one shape), the vocabulary is open (registered handlers) |
| **Open: what does versioning mean?** | content hash pinned by the ledger; `enabled` is the host's field, so pausing isn't a version |
| **Open: do notifications belong here?** | no — an automation writes rows; whatever notifies is another consumer of rows |

---

## Non-goals

- **A workflow engine's machinery, refused — the capability is the point.** A click
  cascading into writes, calls, and follow-ups *is* a workflow by any honest name,
  and it is exactly what tide is for. What tide refuses is the machinery tradition:
  a central orchestrator holding in-memory state, parked step interpreters,
  approval-step primitives, barriers. Here the workflow exists as rows — which is
  why it survives a crash, shows up in a ledger, and needs no engine to resume.
  Human-in-the-loop is the same shape: an automation writes a draft, a person's
  ordinary action approves it (a write), a reflex carries on from that row.
- **Not a message bus, not an event-sourcing substrate.** The fact ledger is an intake
  log, not a topology; nothing subscribes to tide but tide.
- **Not real-time.** Minute-level cadence is the floor and the promise. Stream-shaped
  work belongs in a stream processor; tide is for work a diligent clerk could have
  done on a schedule.
- **Not a replacement for provider retries.** Where Stripe already does it well, the
  effect handler defers to Stripe and records the outcome.
- **Not a lock service.** `order: 'serial'` is as exact as the store's claim can make
  it in one statement, and `overlap: 'skip'` — which is a unique constraint — is the
  guarantee to reach for when it must be exact.

## Deferred

- **Backfill** — materializing past occurrence keys deliberately. Natural because keys
  are enumerable; deferred because catch-up covers outages.
- **A true multi-way barrier** ("when A *and* B *and* C") — run facts cover sequential
  dependency and single-run fan-in; a real conjunction barrier waits for a real case,
  because it is the first organ of a workflow engine.
- **Coalesce, if a digest case becomes real** — as a delayed run on a
  `coalesce:<key>:<window>` cause, never as a table.
- **Cron-string sugar** in tooling — the stored artifact stays structured.
- **Ephemeral fact observers** (live UI invalidation under moss) — a second,
  best-effort consumer of the host's fact stream; deliberately not tide's.
- **Engine-level throttling** — backpressure already exists, and proactive throttling
  lives in the handler that owns the provider relationship.
- **Distributed drive leadership** — unnecessary while idempotent materialization and
  fenced, leased, exactly-once claims make concurrent advances safe; revisit only if
  advance *cost* (not correctness) becomes a problem at scale.
