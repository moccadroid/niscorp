# Tide — API Reference

Every symbol the package exports, and what it promises. See [DESIGN.md](./DESIGN.md) for why the shapes are these shapes.

## Contents

- [createTide](#createtide)
- [The reflex](#the-reflex)
- [Triggers](#triggers)
- [Policy](#policy)
- [Templates and `$`](#templates-and-)
- [The fact](#the-fact)
- [Verbs](#verbs)
- [The ledger](#the-ledger)
- [The seams](#the-seams)
- [The store contract](#the-store-contract)
- [Occurrence math](#occurrence-math)
- [Errors](#errors)

---

## createTide

```typescript
const tide: Tide = createTide(config: TideConfig);
```

```typescript
type TideConfig = {
  store: TideStore;                      // required
  transform: TransformFn;                // required — (config, source) => value
  select?: SelectFn;                     // required only if a reflex has a selection
  effects?: EffectRegistry | ((as: string | undefined) => EffectRegistry);
  actor?: (as: string | undefined) => unknown;   // default: the `as` string itself
  maxChainDepth?: number;                // default 24
  maxFanOut?: number;                    // default 10 000
  leaseMs?: number;                      // default 300 000 — how long a claim is good for
  onEvent?: (event: TideEvent) => void;
};
```

`effects` may be a function of the reflex's `as`, which is how a host builds a
per-identity registry. Load-time verification sees the union across every
declared identity, so an unregistered effect is still caught before it runs.

`leaseMs` is the recovery story for a process that dies between the effect and
the record. A task still `claimed` past its lease is claimable again; the
fencing token is what makes that safe.

---

## The reflex

```typescript
type Reflex = {
  id: string;                 // unique; a tenant's reflex is the tenant's own row
  intent: string;             // one factual sentence, in the operator's language
  on: Trigger;
  as?: string;                // opaque identity; the host resolves it
  params?: Record<string, unknown>;      // authored knobs, visible as $.params
  select?: {
    query: unknown;           // opaque — handed to the `select` seam verbatim
    mode: 'each' | 'batch';   // default 'each'
    unitKey?: string;         // required for 'each' — the idempotency grain
  };
  when?: unknown;             // predicate template; FACT triggers only
  effect: { name: string; input?: unknown };
  policy: Policy;
  enabled: boolean;           // default true — a switch, not part of the version
};
```

`ReflexSchema` parses it; `ReflexInput` is the input type (defaults not yet applied).

**Load refuses**, in one pass: a reflex that does not parse, a duplicate id, an
unregistered effect, `when` on a non-fact trigger, `each` mode with no
`unitKey`, a poll with no selection, a run subscription to a reflex that is not
loaded, and an **unguarded cycle**.

**`enabled` is the host's.** Tide reads it off the reflex it is handed and
holds no copy. To pause an automation, write your own row and `load` again.

---

## Triggers

```jsonc
// the clock — recurring
{ "clock": { "every": "day" | "week" | "month" | "year",
             "on": 1..31 | "mon".."sun" | "MM-DD",   // omitted for `day`
             "at": "HH:MM", "tz": "Europe/Vienna" } }

// the clock — one shot
{ "clock": { "at": "2026-09-14T09:00", "tz": "Europe/Vienna" } }

// a write somebody made (pushed by the host)
{ "fact": { "entity": "invoices", "op": "insert" } }   // `op` optional

// an external event, on a named intake
{ "fact": { "signal": "stripe" } }

// another reflex's run settled — fan-in and dependency
{ "fact": { "run": "billing.charge-due" } }

// a pull, for hosts with no write choke point
{ "poll": { "everyMs": 300000, "entity": "orders", "cursor": "updated_at" } }

// only by hand
{ "manual": {} }
```

**Clock semantics.** Occurrence identity is *local calendar fields* — `2026-03`
for monthly, `2026-03-07` for daily/weekly, `2026` for yearly. A DST transition
can move the instant a key fires at but cannot mint a second key or lose one.
Day-31 clamps to month end (February bills on the 28th). An erased
spring-forward local time shifts past the gap; an ambiguous fall-back time takes
the first occurrence. Both match Temporal's `disambiguation: 'compatible'`.

A clock reflex with **no arming time** establishes its baseline on the first
tick and mints nothing — materializing from the epoch would backfill decades.
Pass `load(reflexes, { at })` to arm it at a known moment.

**A paused clock still moves.** A disarmed reflex materializes nothing, but its
watermark keeps up with the tick — so eight days paused is eight days of
nothing, not eight occurrences waiting to be minted the moment it comes back.
A reflex that *enters* the loaded set re-baselines to the `at` passed to `load`,
for the same reason: coming back is not the same as never having left.

**Poll semantics.** The first run establishes the cursor and mints nothing —
pointing a new poll at an existing table must not report every historical row as
new. It needs a monotonic `cursor`, so it sees appends and cursor-advancing
updates, not deletes and not in-place edits. The cursor need not be *unique*:
rows tied at the same value are tracked by identity, so two members joining in
the same millisecond both produce a fact. The delta becomes ordinary write
facts on `entity`, which the polling reflex consumes and anyone else may watch.

---

## Policy

```typescript
type Policy = {
  retry?: { max: number; backoff: 'fixed' | 'exponential'; baseMs: number };  // default max 3 / exponential / 60s
  timeoutMs: number;        // default 30 000
  overlap: 'skip' | 'allow';   // default 'skip'
  catchUp: 'run' | 'skip' | 'latest';   // default 'run'
  lateMs: number;           // default 3 600 000 — only `catchUp: 'skip'` reads it
  order: 'any' | 'serial';  // default 'any'
};
```

- **retry** — bounded. `max` is retries *after* the first attempt; exhausting
  them parks the task `failed`, terminal and visible, exitable only by `retry()`.
- **overlap: 'skip'** — refuses to start a run while the previous one is
  unsettled. The skip is a recorded run row with a note, never an absence.
  It governs **repeats**: a clock occurrence and a `manual` fact are the same
  intent coming round again. A `write`, `signal` or `run` fact is a distinct
  event that exists exactly once, so it always opens a run whatever this says —
  discarding it would be data loss, and the tool for bounding concurrency
  without discarding is `order: 'serial'`, which queues.
- **catchUp** — after downtime: `'run'` fires every missed occurrence,
  `'latest'` fires only the most recent, `'skip'` fires only what is inside
  `lateMs`. Every decision leaves a run row saying which happened.
- **order: 'serial'** — one in-flight task at a time for that reflex. Enforced
  inside the claim, not by a filter applied around it.

**There is no `coalesce`.** It cost two port methods, a table, an exactly-once
promise and a `DELETE … RETURNING` on every tick, and nothing ever set it. A
digest that genuinely needs batching is a *delayed run*: the first fact of a
group mints one at `now + window` under `cause: 'coalesce:<key>:<start>'`, the
rest collide on `UNIQUE(reflexId, cause)` and are refused, and when it comes due
the reflex selects what changed. Mechanisms that already exist, and no table.

---

## Templates and `$`

A template is a transform-config slot inside a reflex — `effect.input`, `when`
and `select.query`. Tide stores, diffs and hashes them but never interprets
them: they go to the `transform` seam verbatim (under moss, Prism).

```
$ = { params,        // the reflex's knobs
      occurrence?,   // clock runs: { key, at }
      fact?,         // fact runs: the fact
      facts?,        // runs carrying more than one fact, in `at` order
      row?,          // per-unit in `each` mode
      rows?,         // in `batch` mode
      now }          // the tick's LOGICAL now — never a wall-clock read
```

Truthiness is one predicate, shared by the matcher and by `preview`: `false`,
`null`, `undefined`, `0`, `''` and `[]` are all falsy. They used to disagree,
and a `when` returning an empty list previewed as "this will fire" and then
didn't — the exact surprise preview exists to eliminate.

The honest cost of opacity: a typo'd `$ref` cannot be caught at load. It
surfaces at `preview()` — which is why preview is the authoring loop's inner
verb — and, if it slips through, on the task's `error`.

---

## The fact

The public intake contract. Anything that can produce this shape can drive tide.

```typescript
type FactInput = {
  kind: 'write' | 'signal' | 'manual' | 'run';
  entity?: string;  op?: 'insert' | 'update' | 'delete';  row?: Record<string, unknown>;
  name?: string;    payload?: unknown;                    // signal
  reflex?: string;  runId?: string;  occurrence?: string;
  stats?: { total: number; done: number; failed: number };  // run
  target?: string;  by?: string;                          // manual (via `fire`)
  at: number;                 // supplied by the caller — tide reads no clocks
  notBefore?: number;         // a delayed fact: timers as data
  dedupeKey?: string;         // a repeat drops silently; it is not an error
  cause?: string;             // set by tide when an effect emits
};
```

**The union is enforced end to end.** A `write` needs an `entity`, a `signal` a
`name`, a `manual` a `target`, a `run` both `reflex` and `runId` — and each
refuses the fields belonging to the others. `{ kind: 'write' }` with no entity
used to parse, store, match nothing, get marked delivered and vanish, with no
way for the producer to learn its fact was never going to wake anything.

**Ops are distinct stimuli.** "Only on create" is `op: 'insert'`. Things that
happen exactly once ride inserts naturally when the domain models intent as
rows: a receipt follows a *payment* (inserted once), not "invoices where status
= paid" (a state every later edit still satisfies). Where a domain does hang
state on a wide row, the guard is the selection — ask "is there work left to
do", not "is the row in state X".

**`notBefore` needs no cancel API.** The reflex it wakes re-checks reality
through its selection, and zero rows is an ordinary outcome. Reality is the
cancellation token.

**Dedupe is keyed on `(kind, entity, name, dedupeKey)`.** `entity` is in the key
because two polls over different tables that happened to agree on a cursor value
were otherwise duplicates of each other, and one of them lost its rows.

---

## Verbs

```typescript
load(reflexes, options?: { at?: number }): Promise<LoadReport>
```
Validates, hashes versions, derives and verifies the graph, and arms. `at` is
the host's boot time; arming persists, so a restart does not reopen the past.
`LoadReport` carries `{ loaded, cycles, unverifiable, warnings }` — guarded
cycles are legal and reported; effects with no `touches` are reported as
unverifiable edges. Calling it again is how a host changes what is running,
including turning one off.

```typescript
ingest(fact: FactInput, options?: { as?: string }): Promise<Fact | undefined>
```
One write. Undefined means a `dedupeKey` collision — a refusal, not an error.
Matching happens in the tick, against whatever is loaded when the fact comes
due, which is what lets a delayed fact meet the reflexes of the day it fires.

**`as` is whose fact this is**, and it is the tenant boundary at the intake. A
fact is only ever offered to reflexes running under the SAME identity, so a
webhook ingested for one tenant cannot wake another tenant's reflex on the same
signal. It is a second argument rather than a field on the fact because the
fact shape is what a webhook body parses into: an identity a caller can choose
is not an identity.

The rule is strict — a fact with no identity reaches only reflexes with no
identity. A single-tenant host names no `as` anywhere and is unaffected;
a multi-tenant host that forgets one gets silence rather than a leak. An event
that genuinely concerns every tenant is ingested once per tenant, by the only
party that can know which those are.

```typescript
tick(options: { now: number; limit?: number }): Promise<TickReport>
```
Materialize → poll → match → fan out → claim → execute → settle. Idempotent and
safe to run concurrently. `limit` (default 100) bounds facts, fan-outs and
claims per pass. A chain advances one hop per tick — nudge for latency, tick for
the guarantee.

```typescript
fire(reflexId, { now, input?, by? }): Promise<Fact | undefined>
```
Sugar over `ingest`: mints a `manual` fact aimed at one reflex. Works on a
**disarmed** reflex — arming gates triggers, not people.

```typescript
retry(taskId, now): Promise<boolean>
```
Reopens a `failed` task **and rewinds its run** from `settled` back to `fanned`,
in one transaction, so the next tick actually claims it. The run keeps
`drained`, so re-settling does not announce a second time: the digest that
already went out saying twelve failed is not sent again.

```typescript
preview(reflexId, { now, fact? }): Promise<PreviewReport>
```
Runs the real pipeline against real data and stubs exactly one function, the
effect executor. Writes nothing. Returns the occurrence or fact, the selected
rows by name, each unit's resolved input, and whatever the handler's `preview`
hook renders.

```typescript
graph(): GraphReport      // edges, cycles, unverifiable, errors, warnings
sweep(now, retention): Promise<number>   // { facts?, runs?, tasks? } horizons in ms
```

---

## The ledger

Three readable row kinds, all reachable through `tide.ledger` and — under a host
that exposes the tables — through ordinary queries.

```typescript
tide.ledger.runs(filter?)      // { reflexId?, limit? } — newest first
tide.ledger.run(id)
tide.ledger.tasks(filter?)     // { runId?, reflexId?, state?, limit? }
tide.ledger.task(id)
tide.ledger.facts(filter?)
tide.ledger.fact(id)
tide.ledger.causeChain(factId)     // walks `cause` upward
tide.ledger.releaseParked(factId)  // let a chain-ceilinged fact through, once
```

- **fact** — everything that arrived, with its depth, delivery and any park.
- **run** — one activation: cause, version hash, the identity it ran `as`, what
  the selection returned, the counts, the outcome.
- **task** — one unit of effect work: unit key, pinned `env`, attempt count,
  lease, last error, `output`.

States: a task moves `pending → claimed → done | retrying | failed`; a run moves
`pending → fanned → settled`, or lands on `skipped` (overlap, catch-up, or a
malformed reflex, always with a `note`).

`limit` means **the most recent N**, in every store. The two stores used to
answer opposite ends of the same list under the same filter.

**There is no attempt table.** Correctness needs the count and the last error,
and both are on the task; per-attempt history is the host's log, which is where
it was being read from anyway.

**Retention** is a policy, not an accident. The default is keep-forever, which
is the only honest default when the rows are billing history:

```typescript
await tide.sweep(now, { facts: THIRTY_DAYS, runs: NINETY_DAYS });
```

Removing a run removes its tasks with it. Keeping the tasks would destroy the
`UNIQUE(runId, unit)` row that *is* the "this unit already ran" record, and a
restore would then re-charge the invoice.

---

## The seams

| Seam | Contract |
|---|---|
| `store` | `TideStore` — six capabilities; see below |
| `transform` | `(config: unknown, source: Row) => unknown` |
| `select` | `(query: unknown, ctx: SelectCtx) => AsyncIterable<Row> \| Iterable<Row> \| Promise<Iterable<Row>>` |
| `effects` | `name → { run(input, ctx), touches?, preview? }` |
| `actor` | `(as: string \| undefined) => unknown` — threaded into `select` and `run`, opaque throughout |

```typescript
type TideCtx = {
  reflexId: string; runId: string; taskId: string;
  taskKey: string;   // the downstream idempotency key — pass it to the provider
  attempt: number; now: number; actor: unknown;
  emit: (fact) => void;   // buffered; commits with a SUCCESSFUL attempt only
};
```

**The calling convention is the retry classification.** Return = done, however
unhappy the outcome (a card decline is a domain outcome: record it as a row and
let another reflex branch on it). Throw = transient, retried on bounded backoff.

**`emit` accepts `write` and `signal` only, and validates.** A handler that
could emit `manual` would reach past the arming switch, because manual facts are
checked before enablement on purpose — arming gates triggers, not people, and a
handler is not a person. `run` is tide's own bookkeeping. A malformed emit
throws inside the handler, so the attempt fails visibly rather than minting a
fact that matches nothing and vanishes.

---

## The store contract

```typescript
type TideStore = {
  transact:       <T>(fn: (tx: TideStore) => Promise<T>) => Promise<T>;
  appendIfAbsent: (table, row) => Promise<Row | undefined>;
  claim:          (spec: ClaimSpec) => Promise<readonly Row[]>;
  cas:            (table, id, expect, set) => Promise<boolean>;
  query:          (spec: QuerySpec) => Promise<readonly Row[]>;
  remove:         (spec: RemoveSpec) => Promise<number>;
};
```

Six capabilities over four tables — `fact`, `run`, `task`, `state`. The old port
had a method per noun per verb, twenty-seven of them, so `claimTasks`,
`drainSettled` and `claimClosedWindows` were three hand-written implementations
of one operation and diverged three ways.

- **`appendIfAbsent`** is idempotent on the table's unique key, declared once in
  the exported `UNIQUE_BY` constant. Those four constraints *are* the engine's
  exactly-once promises; a store that does not enforce all four is not a tide store.
- **`claim`** selects and mutates in one step. `set` accepts `{ inc: n }` for a
  counter, because `attempt` has to rise at claim time or a handler that
  reliably kills the process retries forever. `onePer` is `order: 'serial'`,
  and it lives inside the claim because a caller that looks first and claims
  second loses the race.
- **`cas`** is the fence: a timed-out attempt finishing late finds its token
  superseded and is discarded. Setting a field to `undefined` clears it.
- **`transact`** is required. Fan-out committing with its run's transition, and
  an attempt recording with the facts it emitted, are transactions rather than
  conventions.

```typescript
import { createMemoryStore } from '@niscorp/tide';
import { STORE_CONTRACT } from '@niscorp/tide/testing';
```

`createMemoryStore()` is the reference implementation and what headless checks
run against. It also exposes `snapshot()` for assertions — deliberately outside
`TideStore`, so the engine cannot reach around its own contract.

`STORE_CONTRACT` is the executable definition of everything above: a list of
`{ name, run(store) }` checks that throw, with no test framework, so any runner
can drive them.

```typescript
for (const check of STORE_CONTRACT) it(check.name, () => check.run(makeStore()));
```

It is exported rather than kept in `test/` because the contract is not tide's
private business. The last SQL store in this package said in its own header that
it was "held to the same tests" and had none; it diverged in eleven ways and
every one of them was invisible. **Under moss**, `createTideStore(pool)` runs
this same list against a real database.

---

## Occurrence math

Exported because a host that renders a schedule needs the same answers the
engine uses:

```typescript
occurrencesBetween(clock, after, through, cap): Occurrence[]   // (after, through]
occurrenceKey(clock, day): string
zonedToUtc(day, hour, minute, tz): number
zonedParts(instant, tz): LocalParts
daysInMonth(year, month): number
versionOf(reflex): string      // the content hash, excluding `enabled`
```

---

## Errors

`TideError` carries a `code` and optional `details`; `isTideError(value)` narrows it.

| Code | Raised when |
|---|---|
| `invalid_reflex` | a reflex failed `ReflexSchema` |
| `invalid_fact` | a fact failed `FactInputSchema`, or a handler emitted one that did |
| `duplicate_reflex` | two reflexes share an id |
| `unknown_reflex` | `fire`/`preview` named a reflex that is not loaded |
| `unknown_effect` | a reflex names an unregistered effect |
| `unguarded_cycle` | load found a loop with no guard anywhere on it |
| `duplicate_unit` | a selection's `unitKey` was not unique, or `maxFanOut` was exceeded |
| `store` | a selection exists but no `select` seam is wired |

Runtime failures are **not** exceptions: a handler that throws becomes a
recorded attempt, a `when` that throws becomes a recorded non-match, and a tick
does not crash because one reflex is broken.

**A fan-out failure is two different things and the engine tells them apart.**
A `TideError` is tide's own refusal — a duplicate unit key, a missing `select`
seam — which means the reflex is wrong and will be wrong again next tick, so the
run is `skipped` with a note. Anything else came out of a host seam: a
selection, a transform, a database. That is a bad minute, not a bad reflex, so
the run stays `pending` and is retried — a row past its due time that a query
can see. Every throw used to skip, and because runs are idempotent on
`(reflexId, cause)`, one database hiccup destroyed that night's billing run
permanently.
