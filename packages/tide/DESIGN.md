# Tide — Design Document

> **Status: built.** The engine, both stores, and the grammar are implemented and
> tested; see [DOCS.md](./DOCS.md) for the API. This is the design answer to
> [`/automation-requirements.md`](../../automation-requirements.md), which stays
> authoritative on *what must be true*; this says *how*. Where the two disagree, one of
> them has rotted — report it, don't guess.

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
   is the clock. A data change is a fact (pushed by a host that sees its own writes,
   or pulled by a watermark poll). A webhook is somebody else's write, arriving as a
   fact over HTTP. A person pressing "run now" fires a reflex by hand. Four trigger
   surfaces, one mechanism underneath.

4. **Deterministic core, injected everything.** Tide contains no SQL dialect, no
   expression evaluator, no HTTP client, no identity model, and no timer. Storage,
   selection, transformation, effects, and identity are five seams the host fills.
   With stubs, the entire engine runs in memory under a fake clock — which is not a
   testing convenience but the design: a headless check advances time and asserts on
   rows, with no sleeping and no mocks of tide itself.

5. **Identity-blind.** Tide never learns what a principal is. Every reflex names an
   `as`; the host resolves it to whatever authority means there (under moss: a
   charter-resolved, engine-enforced `ActorContext`) and tide threads it through to
   effects untouched. The same blindness charter has toward universes, tide has toward
   identity — and for the same reason: enforcement belongs to the governed target,
   never to the middleman.

6. **The wall clock is never read.** The only time tide knows is the `now` handed to
   `tick({ now })` and the `at` stamped on ingested facts. Hosts own wake-up: a Cloud
   Scheduler ping, a `setInterval`, a dev check driving time forward by hand.
   In-process hosts may *nudge* (call `tick` right after producing a fact) for
   near-realtime latency; the periodic tick is the guarantee that survives a crash.

7. **One effect per reflex, and effects are opaque named calls.** The effect
   vocabulary is deliberately open — "send an email" cannot be a closed grammar,
   because it reaches an outside service — but the *shape* of the seam is closed: a
   registered handler with a name, an input the reflex shapes as data, an optional
   preview, and optional `touches` metadata for the flow graph. The definition stays
   declarative; the doing stays code; the boundary stays one function wide.

---

## Vocabulary

The working set, one line each. Terms are defined in depth where they operate.

| Term | Meaning |
|---|---|
| **reflex** | the artifact: trigger + optional selection + one effect + policy — a tenant's reflex is the tenant's own row, with its own id |
| **trigger** | the reflex's `on` clause: `clock` \| `fact` \| `poll` \| `manual` |
| **occurrence** | one slot of a clock trigger, keyed by local calendar fields (`2026-03`) |
| **fact** | the intake contract — "something happened": a write, a signal, a manual poke, a settled firing |
| **firing** | one activation of one reflex: cause, version, selection, fan-out, outcome |
| **task** | one unit of effect work inside a firing; the idempotency grain |
| **attempt** | one execution try of a task, fenced by a token |
| **unit** | what a task acts on: one selected row (`each`), the whole result (`batch`), or the trigger itself |
| **effect** | the named call a reflex makes; reference in data, handler in the registry |
| **template** | a transform-config slot inside a reflex (`effect.input`, `when`, selection context) |
| **`$`** | the closed environment templates evaluate against |
| **cause** | the provenance pointer on every firing and emitted fact; composes into causality chains |
| **settle** | reach a final state (`done` or `failed`) — deliberately not "complete": a firing with failures has settled |
| **coalesce** | hold matching facts for a window, fire once with the batch |
| **watermark** | a poll trigger's stored cursor |
| **chain** | reflexes linked through facts — informal, derived, deliberately **not** an artifact |
| **graph** | the static structure (triggers × touches × firing subscriptions), verified at load |
| **ledger** | the collective rows: facts, firings, tasks, attempts — host-readable data |
| **arm / disarm** | flip a reflex's `enabled` field — a row write, never a deploy |
| **fire / retry / preview** | the human verbs: activate now, re-attempt a failed task, dry-run |
| **tick / ingest / load** | the machine verbs: advance time, accept a fact, accept artifacts |

Naming notes, recorded: **firing** replaces an earlier "run" — moss already owns
`RunRecord` (model runs), and one stack should not hold two unrelated "runs". The fact
kind for external events stays **`signal`** — conventional, and colliding with
`@niscorp/signal` only in prose, never in an API. There is deliberately no word for
"workflow"; the closest thing, *chain*, is defined so it can't become one.

---

## The grammar

Everything below is a Zod schema; everything a schema validates is plain JSON.

### Reflex

```jsonc
{
  "id": "billing.charge-due",
  "intent": "Charge every subscription due this month.",     // one factual sentence — mandatory, like a vex entry
  "on": { "clock": { "every": "month", "on": 1, "at": "03:00", "tz": "Europe/Vienna" } },  // THIS tenant's timezone — the row is theirs
  "as": "automation.billing@studio_42",                       // opaque to tide; the host resolves it
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
    "overlap": "skip",                                        // 'skip' | 'allow' — may a firing start while the last is unsettled?
    "catchUp": "run",                                         // 'run' | 'skip' | 'latest' — after downtime
    "order": "any",                                           // 'any' | 'serial' — serial = one task at a time, unit order
    "coalesce": { "windowMs": 300000, "key": { "$ref": "$.fact.row.member_id" } }   // fact triggers only
  },

  "enabled": true
}
```

The template environment `$` is small and closed:

```
$ = { params,                       // the reflex's own knobs
      occurrence?,                  // clock firings: { key, at, localDate, tz }
      fact?, facts?,                // fact firings: the fact (or the coalesced batch, in `at` order)
      row?, rows?,                  // per-unit: the selected row (each) or all rows (batch)
      now }                         // the tick's LOGICAL now — never a wall-clock read
```

A manual firing (via `fire()`) gets `$.fact = { kind: 'manual', payload: <input> }` —
templates see a fact like any other, and a template that requires `$.occurrence` on a
manually-fired clock reflex fails loudly at preview, which is where authoring errors
belong.

### Tenancy — a reflex is a tenant's row

Tide has **no tenant concept**, because the stack already solved multi-tenancy one
layer down and everything above inherits it. A reflex is tenant data, like a theme:
studio 42's billing reflex is studio 42's row — its own id, its tz, its params, its
`as`, minted from a template by the same artifact machinery that mints their layouts
(the artifact library's overlay story, where "one template, N tenant rows" is already
the plan for every artifact kind). Tide requires ids to be unique and runs the rows
it is given; how a host mints them is the host's business.

The boundary needs nothing from tide, because it is **vex's, engine-side, already
built**: a reflex's selections and writes execute under its own tenant principal's
compiled scope policy — the same wall that holds for humans. A reflex physically
cannot see or touch another tenant's rows, so tenants cannot influence each other
through tide any more than through a screen. Even the stray case fails safe: a reflex
woken by another tenant's write runs its selection under its *own* policy, sees zero
rows, and does nothing — the ordinary outcome, again. Routing precision on top of
that is plain authored data — a `when` comparing the fact's tenant column to the
reflex's own stamped params — an efficiency, never a boundary.

What tide deliberately does **not** parse: the `select.query` blob and the template
configs. The first belongs to the `select` seam (under moss: a vex
`{ fingerprint, context }` replay; under plain Node: perhaps `{ sql, params }`); the
second to the `transform` seam (under any nisc host: Prism). Tide stores them, diffs
them, hashes them into the reflex version — and hands them over verbatim. Nova does
exactly this with Prism endpoint configs; tide does not get to be smarter than nova
about other packages' languages. The honest cost: tide cannot validate a template at
load — a typo'd `$ref` surfaces at preview or execution, recorded on the task.

### Trigger

Four kinds. Structured on purpose — a reflex is shown to the operator it affects, and
`{ every: 'month', on: 1, at: '03:00' }` is reviewable by the person it bills where
`0 3 1 * *` is a shibboleth.

```jsonc
{ "clock": { "every": "day" | "week" | "month" | "year", "on"?: 1..31 | "mon".."sun" | "MM-DD",
             "at": "HH:MM", "tz": "IANA name" } }                   // the owning tenant's tz — the row is theirs
{ "clock": { "at": "2026-09-14T09:00", "tz": "IANA name" } }        // one-shot
{ "fact":  { "entity": "charge_attempts", "op"?: "insert" } }       // pushed changes, optionally one op
{ "fact":  { "signal": "stripe" } }                                 // pushed external events
{ "fact":  { "firing": "billing.charge-due" } }                     // a settled firing — fan-in and dependencies
{ "poll":  { "everyMs": 300000 } }                                  // pulled changes: select + watermark diff
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
  "kind": "write" | "signal" | "manual" | "firing",
  "entity"?: "charge_attempts",          // write facts: what changed
  "op"?: "insert" | "update" | "delete",
  "row"?: { /* the row, as returned by the write */ },
  "name"?: "stripe",                     // signal facts: which intake
  "payload"?: { /* validated at the host's boundary before it gets here */ },
  "reflex"?: "billing.charge-due",       // firing facts: whose firing settled (minted by tide)
  "firingId"?: "…",
  "occurrence"?: "2026-03",              // firing facts: the calendar key, when the clock was the cause
  "stats"?: { "total": 500, "done": 488, "failed": 12 },
  "at": 1755600000000,                   // supplied by the caller — tide reads no clocks
  "notBefore"?: 1755859200000,           // a delayed fact: timers as data
  "dedupeKey"?: "evt_92xk…",             // provider event ids; duplicates drop silently, per (kind, name)
  "cause"?: "task:…"                     // set by tide when an effect emits — the causality chain
}
```

`notBefore` earns its place twice: "retry the decline in three days" and "remind them
in an hour" are both delayed facts sitting in the ledger — visible, queryable rows
surviving restarts, not `setTimeout`s hiding in a process. And a delayed fact needs no
cancel API: the reflex it wakes re-checks reality through its selection, and **zero
rows is an ordinary outcome** — the guard is a query at fire time, not state to clean
up. Reality is the cancellation token.

**Ops are distinct stimuli, and intent is a row.** `op` rides every write fact —
"only on create" is `on: { fact: { entity: '…', op: 'insert' } }`, and things that
happen exactly once ride inserts naturally when the domain models intent as rows: a
receipt doesn't follow "invoices where status = paid" (a *state*, which every later
address edit still satisfies) — it follows a **payment**, inserted once, the moment
it happens. A click is the same shape: in this stack a click that means something
fires an endpoint that writes, so "send only when the user asks" is a reflex on the
intent row that click created, and the automation is everything that cascades from
it. Where a domain does hang state on a wide row, the guard is the **selection**:
don't ask "is the row in state X" — ask "is there work left to do" (*paid invoices
without a receipt*). The chain records its own progress because effects write
outcomes, and zero rows is the ordinary outcome doing its job.

**Firing facts are the fan-in mechanism, and they cost nothing.** Tide is the
bookkeeper of its own fan-out: the firing knows it minted 500 tasks, tasks settle one
by one, and when the last settles, tide mints a `firing` fact with the stats. "Send
one digest when the batch is done" is an ordinary reflex on that fact — no barrier
primitive, no "am I last?" logic in handlers, no coalesce contortions. And since a
reflex id names exactly one tenant's row, the fact names exactly one reflex —
a flow template mints the whole coherent set per tenant, ids wired together. The same fact
is the dependency mechanism ("run B after A succeeds" = `on: { fact: { firing: 'A' } }`
with a `when` on `$.fact.stats.failed`). A zero-task firing settles immediately and
mints its fact with `total: 0`; a digest that shouldn't fire on empty runs says so in
`when`.

---

## The machine

```
tick({ now, limit })
   │
   ├─ 1 MATERIALIZE   clock triggers → due firings, keyed by LOCAL calendar fields
   │                  (idempotent on the key; catch-up policy applied: run late / skip / latest;
   │                  skipped occurrences leave firing rows saying so)
   ├─ 2 POLL          due poll triggers → select seam → diff against the stored
   │                  watermark (one per reflex) → mint write facts for the delta. A poll's
   │                  FIRST run establishes the watermark and mints nothing — a new
   │                  poll must not flood the ledger with the whole table as "new".
   ├─ 3 MATCH         undelivered facts × fact reflexes → `when` filters INTO the window
   │                  (a `when` that THROWS counts as no-match, recorded loudly on the
   │                  fact's delivery accounting — never blocking its other reflexes)
   │                  → coalesce (fixed window from first matched fact; close is claimed
   │                  atomically) → firings. Delivery is per (fact, reflex); one fact
   │                  can wake five reflexes. A reflex matches only facts ingested at
   │                  or after its arming — re-arming starts a new arming (disarm is
   │                  stop, not pause); the past is reached by backfill, never by accident.
   ├─ 4 FAN OUT       firings with a selection → select seam (streamed) → unit tasks,
   │                  committed IN ONE TRANSACTION with the firing's move to `fanned`.
   │                  Duplicate unitKey in one firing fails the firing loudly.
   ├─ 5 CLAIM         due tasks of fanned firings (notBefore honored, overlap and order
   │                  honored, backoff elapsed) — store-mediated, exactly-once; each
   │                  claim mints an attempt token
   ├─ 6 EXECUTE       transform(effect.input, $) → effects[name].run(input, ctx),
   │                  raced against timeoutMs
   └─ 7 RECORD        done / retry-scheduled / failed; attempt appended (token-checked);
                      buffered emits committed with the successful attempt; settled
                      firings mint their firing fact
```

Every stage is a pure function over `(reflexes, ledger, now)` plus the injected seams.
Two instances ticking concurrently are safe by construction: materialization inserts
are idempotent on the occurrence key, window closes and task claims are exactly-once
through the store contract, and a non-monotonic `now` (clock skew between hosts)
merely delays work — it cannot duplicate it.

### The ledger

Four row kinds, all host-readable as ordinary data (under moss: exposed as vex
entries, so the operator's "what has the system been doing" screen is an ordinary nova
action — tide never knows it has a UI):

- **`fact`** — everything that arrived: source, payload, `dedupeKey`, per-reflex
  delivery accounting, cause. The intake log *is* the audit trail of change.
- **`firing`** — one activation of one reflex: the cause (occurrence key, fact id, or
  `manual:<who>`), the reflex version hash, what the selection returned, the fan-out,
  the outcome. "Which automation, which version, when, what it selected."
- **`task`** — one unit of effect work: unit key, resolved input (pinned at fan-out),
  state (`pending → claimed → done | retrying | failed`), and the handler's returned
  **output** — stored, which is what makes non-write effects (an external call, an
  agent's answer) selectable downstream without inventing a domain table.
- **`attempt`** — one execution try: timestamp, error, token. A failed attempt spent
  effort and is exactly the row somebody needs to read.

Causality is first-class: every firing knows its cause and every emitted fact knows
its task, so *"why did this member get this email"* is a walk up a chain of rows —
`email ← draft approved ← draft written ← charge.failed ← evt_92xk` — not an
archaeology project.

**Retention is a policy, not an accident.** The ledger grows without bound unless told
otherwise; the store ships a sweep (`retention` per row kind — settled rows past the
horizon are deleted) and the default is *keep forever*, which is the only honest
default when the rows are billing history. Hosts that want hygiene configure it;
nobody loses an audit trail to a default.

### Execution semantics

The requirements doc calls this "the part that must not be hand-waved." In order:

- **Idempotency.** The task row is written *before* the effect runs, keyed
  `UNIQUE(reflex, cause, unit)`. A duplicate trigger firing, a second instance, a
  crashed-and-restarted tick — all collide with the existing row and are refused.
  There is no path to the effect that does not pass through the insert. Handlers
  additionally receive the task key in `ctx` for downstream idempotency — a payment
  capture passes it to the provider.
- **Fan-out is transactional.** A firing's tasks commit together with its move to
  `fanned`, and claims only see tasks of fanned firings. This exists because the
  alternative is quietly catastrophic: a fan-out that crashes at row 200 of 500 and
  resumes would *re-select against moved data* — a member who paid in the gap keeps a
  task minted from the stale pass. Atomic fan-out means a crash leaves nothing to
  resume from; the re-run selects fresh and mints clean.
- **Retry is a type distinction, not metadata.** An effect that **returns** is done —
  a card decline is not an error but a *domain outcome*, which the handler records
  (under moss: writes as a row) and the flow branches on via reflexes. An effect that
  **throws** is transient — tide retries on the bounded backoff, then parks the task
  `failed`: terminal, visible, and exit-able only through the human verb `retry()`.
  "Try again" versus "done and it failed" is decided where the knowledge lives (only
  the payment handler can tell a decline from a gateway 500) and expressed in the
  calling convention, where nobody can forget to declare it.
- **Attempts are fenced.** A timeout marks the attempt failed and schedules a retry —
  but the timed-out effect may still be running. Each claim mints an attempt token;
  recording a result requires the token to still be current, so a zombie completion is
  discarded instead of overwriting the live attempt. (Its external side effect is
  exactly what the downstream idempotency key defends against.)
- **Emits are buffered.** `ctx.emit` facts commit with the successful attempt, in the
  same transaction. A throwing attempt discards its buffer — otherwise every retry of
  an emit-then-throw handler would mint duplicate facts and fire duplicate chains.
- **Concurrency has three dials, each where its limit lives.** Per-task claims are
  exactly-once (Postgres: `FOR UPDATE SKIP LOCKED`). Per-reflex: `overlap: 'skip'`
  refuses to start a firing while the last is unsettled (the long billing run still
  going at the next tick does not double-start — the skip is a recorded firing, not an
  absence), and `order: 'serial'` executes a reflex's tasks one at a time in unit
  order, for the cases where sequence matters. Provider rate limits need no tide
  vocabulary at all: a throttled provider answers 429, the handler throws, and the
  bounded backoff *is* the backpressure — the machinery already exists. A handler
  that wants to throttle proactively does so in its own code, where the provider
  relationship lives.
- **Partial failure.** One task per unit, one transaction per task. If number 237 of
  500 throws, the first 236 stay done, 237 retries or parks, 238 onward run. There is
  no all-or-nothing batch to get wrong.
- **Catch-up is authored, not guessed.** After downtime, `'run'` fires missed
  occurrences late, `'skip'` drops them, `'latest'` fires only the most recent of
  several missed. Each leaves a firing row saying which happened — a skipped firing is
  a recorded decision.
- **Timeouts.** Every effect races `timeoutMs`; a hung external call marks the attempt
  failed and frees the schedule.
- **Silence is visible.** Occurrences are materialized ahead, so a firing that should
  have happened and didn't is a `pending` row past its due time — a *query*, not a
  vanished event. "Alert on silence" is a tide reflex watching tide's own ledger.

### Occurrences and time

Occurrence identity is **(reflex, local calendar fields)**, never instants: the
March monthly firing of a studio's billing reflex is `<its id>:2026-03`, the daily
is `…:2026-03-07` — and since a reflex id names one tenant's row, no two tenants'
runs can meet on a key. A DST boundary
can move the *instant* a key fires at; it cannot mint a second key or lose one — the
double-fire and the skip are structurally impossible rather than carefully avoided.
The calendar edges are decided, not discovered:

- `every: 'month', on: 31` **clamps to the last day of the month** — February bills on
  the 28th (29th), because "skip February" is never what a billing rule means.
- A local time erased by spring-forward resolves to the **first valid instant after**;
  a local time that fall-back makes ambiguous takes the **first occurrence**. The key
  is identical either way.
- Timezone resolution uses the platform's IANA data (`Intl`), keeping the dependency
  count at zero. "03:00 in Vienna" and "03:00 in Denver" are both honest.

Occurrences being enumerable is also what makes **backfill** (deferred) natural:
"run the report reflex over the last 12 months" is materializing twelve past keys.

### Preview — dry run as a verb

`preview(reflexId, { now, cause? })` runs the real pipeline — materialize or match,
select against real data, evaluate every template — and stubs **one function**: the
effect executor. What comes back is the firing that would happen: the occurrence or
fact, the selected rows (the eleven members, by name), each task's resolved input,
plus whatever the effect's optional `preview` hook renders (a vex-backed effect shows
its derived write; a mail effect shows the message). Because every effect passes
through the same choke point, there is no per-reflex dry-run flag and no `if (dryRun)`
to forget — a reflex *cannot* opt out of being previewable. Preview is also where
template typos surface, which makes it the authoring loop's inner verb.

### The graph, verified at load

`load(reflexes)` validates every artifact, hashes versions, and derives the graph:
reflexes × their triggers × their effects' `touches` × their **firing-fact
subscriptions** — that last edge class matters, because fan-in creates cycles the
write edges alone can't see (B fires on A's firing; B's firing feeds C; C writes what
triggers A).

Cycles are **classified, not banned** — because tide's own best patterns are cycles
on purpose: a drip campaign is a reflex whose delayed fact fires itself; "retry the
decline in 3 days" loops through `notBefore`; a drain loop ("process 100, fire again
while more remain") subscribes to its own firing. All converge because every loop
passes through a **guard**: a selection that re-checks reality, a `when`, or a
`notBefore` delay. Static analysis cannot tell a convergent cycle from a divergent
one, so it does not pretend to:

- An **unguarded** cycle — every hop unconditional, no selection, no `when`, no
  `notBefore` anywhere on the loop — is refused at load: it diverges by construction.
- A **guarded** cycle is legal and reported as a finding, so the author sees the loop
  they built.
- The runtime backstop is nearly free because causality already exists: a fact whose
  cause chain exceeds `maxChainDepth` (engine config, generous default) is **parked
  for review instead of fired** — a divergent loop hits a loud ceiling instead of
  melting the ledger. Parked facts are ledger rows: an operator releases or drops
  them, the same register as `retry`.

Load **refuses** outright: an unguarded cycle, a reflex naming an unregistered
effect, a `when` on a non-fact trigger. The verification is only as good as the
declared `touches`: under moss they are *derived* (from `mutationEffect` on vex
entries — the strongest case); a plain host declares them or forgoes the check, and
an undeclared effect is reported as an unverifiable edge, never silently trusted. If
it loads, it's coherent — the moss tradition, one layer down.

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
            fact: firing billing.charge-due   ─→ [billing.digest]         ─→ owner's summary mail
            clock (daily) + select: declines ≥ 3 days old, still open ─→ [billing.dunning-notice]
```

Six reflexes, co-located in one `billing.reflexes.ts` (the suffix names the kind — the
repo's own convention). Every arrow is a committed row; a crash anywhere resumes from
the last row; every intermediate state has a name an operator can query. Note the
dunning line: it needs no cancel API when the member pays — its selection asks "still
open", and zero rows is an ordinary outcome.

**Data passes through three lanes, and the principle is one sentence:** *facts carry
the datum, the ledger carries the history, the domain rows carry the state — and
selection reaches all three.* The fact brings `$.fact.row` (the change that fired
you); task `output` makes any effect's result selectable; and a selection joins
whatever it needs (under moss, tide's tables are vex entities — the digest's selection
reads the tasks of `$.fact.firingId` joined to members, with the entry's mapping
producing display-ready lines, because formatting lives in mappings). Nothing is
"passed" in memory; everything is written where the next reflex can read it.

**The granularity rule** — the one authored judgment this design asks for: *a joint
the business cares about (retry it independently, observe it, resume from it) is a
fact + reflex; a joint it doesn't care about lives inside one effect handler.* Two
external API calls that form one atomic business step are one handler — an endpoint is
a sanctioned home for imperative code, and the artifact thesis governs the automation,
not every HTTP call inside an effect.

**Mode guidance:** `batch` pins the whole result into one task and is for bounded sets
(a digest of dozens); a large set is `each` + a firing-fact digest — 500 tasks and one
summary reflex, not one task carrying 500 rows.

---

## Templates, concretely

A template is not an artifact — it is a transform-config slot inside a reflex,
evaluated by the injected `transform` seam over `$`. Under moss that means Prism,
literally the same language as a `.prism.ts` endpoint body:

```ts
export const billingDigest: Reflex = {
  id: 'billing.digest',
  intent: 'Mail the owner a summary after each monthly charge firing.',
  on:   { fact: { firing: 'billing.charge-due' } },
  as:   'automation.billing@studio_42',
  select: {
    query: { fingerprint: 'billing/firing-summary',                 // a vex read over tide's own ledger
             context: { firingId: { $ref: '$.fact.firingId' } } },  // ← template: selection context
    mode: 'batch',
  },
  effect: {
    name: 'mail.send',
    input: {                                                        // ← template: effect input
      to:      { $ref: '$.params.ownerEmail' },
      subject: { $join: { parts: [{ $ref: '$.fact.reflex' }, ' — ',
                                  { $ref: '$.fact.occurrence' }], sep: '' } },
      failed:  { $ref: '$.fact.stats.failed' },
      lines:   { $pluck: { over: { $ref: '$.rows' }, key: 'summary_line' } },
    },
  },
  params: { ownerEmail: 'studio@example.com' },
  policy: { retry: { max: 2, backoff: 'fixed', baseMs: 300000 } },
  enabled: true,
};
```

`$.rows` came from the selection; `summary_line` was formatted by the entry's mapping;
`$.fact` is the firing fact tide minted; `$.params` are the reflex's knobs. Tide
evaluated none of it.

---

## The seams

Five injection points. Every one is a move the stack has already made once — which is
the argument that tide is a *nisc* library and not a scheduler with JSON config:

| Seam | Contract | The host injects | Precedent |
|---|---|---|---|
| `store` | `TideStore` — facts, firings, tasks, watermarks; idempotent inserts; exactly-once claims and window closes; transaction-joining; retention sweep | `createPostgresStore(pool)` shipped; `createMemoryStore()` for checks | vex's `CacheBackend` / `MutationClient` — structural, driver-free |
| `transform` | `(config, source) => value` | Prism's `evaluate`, or anything | **nova's exact socket** — nova doesn't know Prism; neither does tide |
| `select` | `(query, ctx) => AsyncIterable<row>` — the query blob is opaque | vex replay under the actor's policy; or raw SQL; or an array | vex's `generateDsl` / `mapToShape` — deterministic core, injected capability |
| `effects` | `name → { run(input, ctx), touches?, preview? }` | vex mutation replays, fns, cortex agents; or plain functions | moss's `functions` seam |
| `ctx` | opaque, threaded through to `select` and `effects`; carries `taskKey`, `emit`, `now` | moss: `ActorContext` (principal, policy, wire, recordRun) | charter's universe-blindness, applied to identity |

Plus the two edges that are contracts rather than injections: **`ingest(fact, tx?)`**
in (the fact shape is the public API; `tx` lets a host append the fact in the same
transaction as the write that caused it) and **`tick({ now, limit })`** to run.

Dependencies: **`zod`**. Nothing else — the same bar charter clears.

---

## Hosts

### Moss — the reference host, walked end to end

The app declares two manifest fields, mirroring the existing pattern exactly —
artifacts in data, code at the code seam:

```ts
defineApp({
  // ... charter, actions, entries, shell ...
  reflexes: [chargeDue, markPaid, sendReceipt, recordDecline, billingDigest, dunningNotice],
  effects: (actor: ActorContext) => ({                     // the twin of functions(session)
    'mail.send': {
      run: (input) => mailer.send(input),                  // keys from .env — never in artifacts
      preview: (input) => ({ channel: 'email', to: input.to, subject: input.subject }),
    },
    'payments.charge': {
      run: async (input, ctx) => {
        const res = await stripe.charge({ ...input, idempotencyKey: ctx.taskKey });
        await ctx.wire('/api/billing/vex', { method: 'POST',      // outcome → a GOVERNED write,
          body: JSON.stringify({ fingerprint: 'chargeAttempt/record',
            context: { subscriptionId: input.subscriptionId, status: res.status } }) });
        return { status: res.status };                     // …and a task output for the ledger
      },
    },
  }),
})
```

Moss wires tide once at boot:

| Tide seam | Moss fills it with |
|---|---|
| `store` | the runtime `pool` — tide's tables stand up beside `vex_cache`, derived like the rest of the data layer |
| `select` | vex replay **through the actor's own wire** — selection inherits replay-only, scoped, cached, inspectable; the tenant filter is in the SQL, engine-injected, unforgeable |
| `effects` | every seeded vex **mutation** auto-registered under its fingerprint (with `touches` *derived* from `mutationEffect` — the mark-paid branch of the chain is artifacts all the way down, no code anywhere) + the app's `effects(actor)` |
| `transform` | prism — the same wiring the shell's transform socket already gets |
| `ctx` | `ActorContext`: the charter-resolved, engine-enforced, no-shell principal (`automation.billing@studio_42`; tenancy from the app's `scope()` seam — the identical mechanism a person goes through). The same type webhook intake needs — two consumers, one primitive, and it is **moss's**, not tide's |
| `ingest` | the write path: each vex mutation commits its fact atomically with the write (transactional outbox — the guarantee is a *host property*; tide exposes the `tx` seam, moss uses it correctly). Non-vex writers get a documented opt-in hook and the honest note that skipping vex forfeits derived facts and derived `touches` |
| tenancy | a tenant's reflexes are the tenant's rows, minted from templates by the artifact library's overlay story alongside their layouts and entries; each runs as that tenant's automation principal under its compiled scope policy — the boundary is vex's, engine-side, identical to a person's |
| wake-up | `POST /tide/tick` for Cloud Scheduler; an in-process nudge after commits for near-realtime latency; a dev check calling `tick({ now })` with a marched clock |
| the ledger | exposed as vex entries — arming, disarming, `fire`, `retry`, the firing history, and preview are ordinary nova actions over ordinary rows |

One monthly firing, every hop: the scheduler pings `/tick` → materialize mints
`billing.charge-due:2026-03` → fan-out streams `subscriptions/due` as
`automation.billing@studio_42` and commits 500 tasks with the firing's move to
`fanned` → each task claimed: prism resolves
the input, the handler charges Stripe with the task key, writes `charge_attempts`
through the actor's wire → that write's fact fires `mark-paid` or `record-decline`
(pure-artifact branches) → the invoices-paid fact fires `send-receipt` → the 500th
task settles → tide mints the firing fact → `billing.digest` mails the owner —
meanwhile the operator's nova screen reads the same firing and task rows over vex,
and tide never knew it had a UI.

The coupling that is deliberately *absent*: tide imports nothing from nova and holds
no reference to any shell. Live server shells may someday consume the same facts
ephemerally (re-running reads a write staled — derived invalidation); if that never
gets built, tide loses nothing. Tide and the UI are two customers of one stream who
never meet.

### Plain Node — the floor

```ts
const tide = createTide({
  store: createPostgresStore(pool),
  transform: (config, source) => evaluate(config, source),      // prism, or your own
  select: async function* (q) { yield* (await pg.query(q.sql, q.params)).rows; },
  effects: {
    'mail.send':    { run: (input) => mailer.send(input) },
    'orders.close': { run: async (input, ctx) => { await pg.query(/* … */);
                        await ctx.emit({ kind: 'write', entity: 'orders', row, at: ctx.now }); },
                      touches: ['orders'] },
  },
});
tide.load(reflexes);
app.post('/webhook/stripe', (req) => tide.ingest(toFact(req)));  // validate at the boundary first
setInterval(() => tide.tick({ now: Date.now() }), 60_000);
```

No vex, no moss, no nova — and no magic either: facts must be ingested or polled for,
`touches` must be declared, the outbox guarantee is theirs to keep. `ctx.emit` is how
a chain continues without a write choke point. Poll's honest limits hold everywhere:
it needs a monotonic cursor, so it sees appends and cursor-advancing updates — not
deletes, not in-place edits that leave the cursor alone. That is what write facts are
for, and why moss hosts rarely poll.

---

## File structure

```
src/
  index.ts                 Public API barrel — createTide, schemas, occurrence math
  tide.ts                  createTide: load, ingest, tick, fire, retry, preview, ledger
  types.ts                 ledger rows, seam types, TideStoreLike, reports
  errors.ts                TideError (code + details)

  schemas/
    reflex.schema.ts       ReflexSchema — trigger, select, effect, policy, enabled
    trigger.schema.ts      clock | fact | poll | manual, with narrowing helpers
    fact.schema.ts         FactInputSchema — the public intake contract
    policy.schema.ts       retry, backoff, overlap, order, catchUp, lateMs, coalesce
    index.ts

  engine/
    tick.ts                the pipeline, in order, over (reflexes, store, now)
    runtime.ts             EngineDeps, the `$` environment, versionOf (content hash)
    occurrence.ts          calendar math, local-field keys, clamping, DST edges
    materialize.ts         clock → firings (catch-up); poll → facts (watermark)
    match.ts               fact × reflex, `when`, delivery accounting, coalescing,
                           and openFiring — the one place a firing is born
    fanout.ts              selection streaming → transactional unit-task commit
    execute.ts             claim → fence → transform → effect → record; the ONE door
    preview.ts             the same pipeline with the executor stubbed
    graph.ts               triggers × touches × firing subscriptions; refusal at load

  store/
    memory.ts              createMemoryStore (checks, standalone dev) + snapshot()
    postgres.ts            createPostgresStore (SKIP LOCKED, tx fan-out, drained flag)

test/
  occurrence.test.ts       DST both directions, clamping, key stability
  engine.test.ts           the execution semantics, end to end on a fake clock
  load.test.ts             the load gate: validation, cycles, versioning
  preview.test.ts          dry run writes nothing and shows everything
```

Two departures from the sketch this document carried before implementation, both
recorded because they are the kind of thing a reader would otherwise assume was an
oversight. `materialize.ts` split out of `tick.ts` — the clock and the poll are the
two places the engine *creates* work from nothing, and they read better beside each
other than buried in the orchestrator. And there is no `verbs.ts`: `fire` turned out
to be four lines of sugar over `ingest`, and `retry` four lines over the store, so
both live on the `Tide` object they belong to rather than in a file that would only
ever hold them.

The moss integration lives in **moss**, not here — tide must never import a host.

---

## Key design decisions

1. **No run body — the database is the interpreter.** Three earlier shapes died to
   get here: a bespoke step language (new grammar the stack didn't need, dragging
   Prism toward control flow — a mapper is not an orchestrator), nova's trigger steps
   executed headlessly (the right grammar, but it hauled in shells, completion
   contracts, and render machinery automations never needed), and a moss subsystem
   (which handed moss a vocabulary, the one thing moss refuses to own). What survived
   every round: an in-memory step chain must journal each step to survive a crash —
   rebuilding a workflow engine's checkpointing — while a chain of facts and reflexes
   gets durability, resumability, per-step retry policy, and per-step observability
   *from its shape*. The cost is real and named: flows span artifacts. The answer is
   co-location in authoring (one file per flow) and the derived graph at load — the
   flowchart is computed from the artifacts, never drawn beside them where it can drift.

2. **Fan-in is bookkeeping, not a primitive.** The firing fact exists because tide
   already knows when the last task settles — emitting that knowledge as an ordinary
   fact turns fan-in, dependencies ("after A succeeds"), and batch digests into
   ordinary reflexes. The alternative — a barrier primitive — would have been the
   first workflow-engine organ, solving a problem the ledger had already solved.

3. **Fan-out is transactional; unit keys collide loudly.** A resumable partial
   fan-out re-selects against moved data — for a billing run, that is charging someone
   who already paid. Atomicity makes the crash case the clean case. And a duplicate
   `unitKey` inside one firing fails the firing rather than silently dropping a row —
   authoring errors are loud or they are invisible.

4. **Attempts are fenced; emits are buffered.** Both exist for the same reason: a
   retry must not let the *previous* try's ghost act — a zombie completion recording
   over the live attempt, or a re-executed handler double-minting facts. The token
   check and the buffer-until-success rule close the two leaks a naive executor ships
   with.

5. **Retry classification is a calling convention.** Return = domain outcome, recorded
   as data, branched on by reflexes. Throw = transient, retried on bounded backoff to
   a terminal, human-visible state. Per-effect metadata declaring which errors are
   retryable is a registry someone forgets to update; a type distinction at the seam
   cannot be forgotten, and it puts the decision where the knowledge lives.

6. **The effect executor is the only door.** Everything that leaves tide — a write, an
   email, an agent — passes through one function. That single choke point is what
   makes preview a *verb* (stub one function, nothing can leak), timeout uniform, the
   task key uniformly available, and the ledger complete. A second path to the
   outside would quietly break all four.

7. **Limits live where they bind.** Task uniqueness at the store; firing overlap and
   task order on the reflex; provider ceilings in the handler that owns the provider
   relationship — a throttled provider's 429 is a throw, and the bounded backoff is
   the backpressure. Tide ships no rate vocabulary of its own.

8. **Occurrence identity is local calendar fields, with decided edges.** `2026-03`,
   not an epoch millisecond — DST cannot mint or lose a key. Day-31 clamps to
   month-end; erased local times take the next valid instant; ambiguous ones take the
   first. These are decisions in the schema's documentation, not discoveries in
   production.

9. **A reflex never retro-fires.** Matching starts at arming; the fact history before
   a reflex existed is reachable only through deliberate backfill. The alternative —
   a new "notify on signup" reflex greeting every member since launch — is the kind of
   incident that ends adoption. Implementation surfaced a third face of the same rule,
   beside the poll's first run: a **clock** reflex with no arming time establishes its
   baseline on the first tick and materializes nothing, because materializing from the
   epoch would backfill decades of occurrences. Arm it with `load(reflexes, { at })`
   and it fires from that moment forward. All three are one principle — *a new watcher
   starts watching now* — and each had to be written down separately because each has
   its own way of reaching for the past.

10. **Selection and shaping are opaque on purpose.** Tide stores, diffs, and hashes
    the query and template blobs but never interprets them. The moment tide validates
    a query it owns a query language; the moment it evaluates an expression it owns an
    evaluator — both exist in the stack already, better, behind seams nova proved out.
    The honest cost — template typos surface at preview, not load — is why preview is
    the authoring loop's inner verb.

11. **Identity is the host's, entirely.** The requirements doc suspected the scoped
    no-session principal "may not belong in this library at all" — confirmed. Tide
    threads an opaque `ctx`; moss's `ActorContext` (also wanted by webhook intake —
    two consumers is the definition of a primitive) supplies principal, compiled
    policy, and tenancy, enforced by the same engine that enforces people. An
    automation that "runs as root" is unbuildable through this seam, because tide has
    no root to offer.

12. **Versioning is a content hash, and the ledger pins it.** A reflex's version is
    the hash of its definition, so the ledger can always say "March ran the old
    version, April the new one." `enabled` is a switch on the row, not part of the
    definition — flipping it isn't an edit. `params` are part of it — changing
    `graceDays` from 3 to 7 is a behavioral change the ledger must explain.
    Firings record the hash they executed under; an edited reflex is a new hash;
    the ledger still explains a firing from three weeks ago.
    And because a tenant's reflex is the tenant's own row (§ Tenancy), disarming is
    an instant field write that corrupts nothing in flight — no new firings, existing
    tasks settle under the version they started with.

---

## Against the requirements

The wishlist, answered — including its own open questions:

| Requirement | Mechanism |
|---|---|
| Clock / change / external / manual triggers | clock, fact (pushed) + poll (pulled), signal facts, `fire()` — one ledger under all four |
| Timezone honesty, no DST double-fire | tz is a field on the tenant's own reflex row + local-calendar occurrence keys + decided clamping (§ Tenancy, § decision 8) |
| Selection = an ordinary vex read | the `select` seam; under moss, literally a fingerprint replay under the actor's policy |
| Per-row and per-batch | `select.mode`; large sets = `each` + a firing-fact digest |
| Streaming large sets | `select` returns an `AsyncIterable`; fan-out commits in one transaction |
| Effects: write / call out / agent / sequenced with explicit failure | the effects registry; sequences are chains; failure branches are reflexes on outcome rows |
| Idempotency before the effect | task insert `ON CONFLICT` refusal; task key in `ctx` for downstream |
| Retry vs terminal | throw vs return (§ decision 5); `retry()` for the parked |
| Concurrency, overlap, ordering, partial failure, timeout, catch-up | claims + fencing, `overlap`, `order: 'serial'`, task-per-unit, `timeoutMs`, `catchUp` |
| Scoped no-session identity, tenant-bounded | `ctx` seam ← moss's `ActorContext`; engine-side enforcement, unchanged |
| Run ledger, dry run, preview with names, silence alerting, ledger-as-data | facts/firings/tasks/attempts; `preview()`; materialized-ahead pending rows; host-readable tables with a retention policy |
| Per-tenant config, instant disarm, versioning across runs | reflexes are tenant rows (§ Tenancy; the no-fork concern is the artifact library's overlay story) + content-hash versions (§ decision 12) |
| Host-agnostic wake-up; serverless and local both | `tick({ now })`; the nudge gives latency, the tick gives the guarantee |
| Deterministic headless checks | memory store + fake clock; no timers exist to wait on |
| Wishlist: dependency between automations | firing facts — `on: { fact: { firing: 'A' } }` with `when` on the stats |
| **Open: one library or two?** | one, standalone — "react to a change" is a fact reflex; same machine |
| **Open: does the identity belong here?** | no — moss's `ActorContext`, consumed through an opaque seam |
| **Open: how much effect vocabulary is closed?** | the seam is closed (one shape), the vocabulary is open (registered handlers) |
| **Open: what does versioning mean?** | content hash pinned by the ledger; `enabled` is a field, so disarming isn't a version |
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
  log with delivery accounting, not a topology; nothing subscribes to tide but tide.
- **Not real-time.** Minute-level cadence is the floor and the promise. Stream-shaped
  work belongs in a stream processor; tide is for work a diligent clerk could have
  done on a schedule — that is the register the requirements come from, and the
  boundary is kept on purpose. Mounting per-event machinery at 50 events/sec is the
  wrong tool held wrong.
- **Not a replacement for provider retries.** Where Stripe already does it well, the
  effect handler defers to Stripe and records the outcome.

## Deferred

- **Backfill** — materializing past occurrence keys deliberately ("compute the report
  for the last 12 months", "greet members who joined before this reflex existed").
  Natural because keys are enumerable; deferred because catch-up covers outages and
  nothing at launch needs the past.
- **A true multi-way barrier** ("when A *and* B *and* C") — firing facts cover
  sequential dependency and single-firing fan-in; a real conjunction barrier waits for
  a real case, because it is the first organ of a workflow engine.
- **A second store** (SQLite) — the contract is structural and small; on demand.
- **Cron-string sugar** in tooling — the stored artifact stays structured.
- **Ephemeral fact observers** (live UI invalidation under moss) — a second,
  best-effort consumer of the host's fact stream; valuable, and deliberately not
  tide's: tide owns durable consumption only.
- **Engine-level throttling** — backpressure already exists (a throttled provider's
  429 → handler throws → bounded backoff), and proactive throttling lives in the
  handler that owns the provider relationship; engine-level caps wait for contention
  the retry machinery demonstrably can't absorb.
- **Distributed tick leadership** — unnecessary while idempotent materialization and
  fenced, exactly-once claims make concurrent ticks safe; revisit only if tick *cost*
  (not correctness) becomes a problem at scale.
