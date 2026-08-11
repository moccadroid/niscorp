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
- [Stores](#stores)
- [Occurrence math](#occurrence-math)
- [Errors](#errors)

---

## createTide

```typescript
const tide: Tide = createTide(config: TideConfig);
```

```typescript
type TideConfig = {
  store: TideStoreLike;                  // required
  transform: TransformFn;                // required — (config, source) => value
  select?: SelectFn;                     // required only if a reflex has a selection
  effects?: EffectRegistry | ((as: string | undefined) => EffectRegistry);
  actor?: (as: string | undefined) => unknown;   // default: the `as` string itself
  maxChainDepth?: number;                // default 24
  maxFanOut?: number;                    // default 10 000
  onEvent?: (event: TideEvent) => void;
};
```

`effects` may be a function of the reflex's `as`, which is how a host builds a
per-identity registry. Load-time verification sees the union across every
declared identity, so an unregistered effect is still caught before it runs.

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
unregistered effect, `when` on a non-fact trigger, `coalesce` on a non-fact
trigger, `each` mode with no `unitKey`, a poll with no selection, a firing
subscription to a reflex that is not loaded, and an **unguarded cycle**.

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

// another reflex's firing settled — fan-in and dependency
{ "fact": { "firing": "billing.charge-due" } }

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

**Poll semantics.** The first run establishes the watermark and mints nothing —
pointing a new poll at an existing table must not report every historical row as
new. It needs a monotonic `cursor`, so it sees appends and cursor-advancing
updates, not deletes and not in-place edits. The delta becomes ordinary write
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
  coalesce?: { windowMs: number; key?: unknown };   // fact triggers only
};
```

- **retry** — bounded. `max` is retries *after* the first attempt; exhausting
  them parks the task `failed`, terminal and visible, exitable only by `retry()`.
- **overlap: 'skip'** — refuses to start a firing while the previous one is
  unsettled. The skip is a recorded firing row with a note, never an absence.
- **catchUp** — after downtime: `'run'` fires every missed occurrence,
  `'latest'` fires only the most recent, `'skip'` fires only what is inside
  `lateMs`. Every decision leaves a firing row saying which happened.
- **order: 'serial'** — one in-flight task at a time for that reflex, in unit order.
- **coalesce** — a fixed window opened by the first matching fact; when it
  closes, one firing carries the batch as `$.facts`. A sliding window would
  starve forever under a steady stream.

---

## Templates and `$`

A template is a transform-config slot inside a reflex — `effect.input`, `when`,
`select.query`, and `coalesce.key`. Tide stores, diffs and hashes them but never
interprets them: they go to the `transform` seam verbatim (under moss, Prism).

```
$ = { params,        // the reflex's knobs
      occurrence?,   // clock firings: { key, at }
      fact?,         // fact firings: the fact
      facts?,        // coalesced firings: the batch, in `at` order
      row?,          // per-unit in `each` mode
      rows?,         // in `batch` mode
      now }          // the tick's LOGICAL now — never a wall-clock read
```

The honest cost of opacity: a typo'd `$ref` cannot be caught at load. It
surfaces at `preview()` — which is why preview is the authoring loop's inner
verb — and, if it slips through, on the task's `error`.

---

## The fact

The public intake contract. Anything that can produce this shape can drive tide.

```typescript
type FactInput = {
  kind: 'write' | 'signal' | 'manual' | 'firing';
  entity?: string;  op?: 'insert' | 'update' | 'delete';  row?: Record<string, unknown>;
  name?: string;    payload?: unknown;                    // signal
  reflex?: string;  firingId?: string;  occurrence?: string;
  stats?: { total: number; done: number; failed: number };  // firing
  target?: string;  by?: string;                          // manual (via `fire`)
  at: number;                 // supplied by the caller — tide reads no clocks
  notBefore?: number;         // a delayed fact: timers as data
  dedupeKey?: string;         // a repeat drops silently; it is not an error
  cause?: string;             // set by tide when an effect emits
};
```

**Ops are distinct stimuli.** "Only on create" is `op: 'insert'`. Things that
happen exactly once ride inserts naturally when the domain models intent as
rows: a receipt follows a *payment* (inserted once), not "invoices where status
= paid" (a state every later edit still satisfies). Where a domain does hang
state on a wide row, the guard is the selection — ask "is there work left to
do", not "is the row in state X".

**`notBefore` needs no cancel API.** The reflex it wakes re-checks reality
through its selection, and zero rows is an ordinary outcome. Reality is the
cancellation token.

---

## Verbs

```typescript
load(reflexes, options?: { at?: number }): Promise<LoadReport>
```
Validates, hashes versions, derives and verifies the graph, and arms. `at` is
the host's boot time; arming persists, so a restart does not reopen the past.
`LoadReport` carries `{ loaded, cycles, unverifiable, warnings }` — guarded
cycles are legal and reported; effects with no `touches` are reported as
unverifiable edges.

```typescript
ingest(fact: FactInput): Promise<Fact | undefined>
```
Undefined means a `dedupeKey` collision — a refusal, not an error.

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
Reopens a `failed` task. Deliberately does not rewind the firing: a digest that
already went out must not be sent twice.

```typescript
preview(reflexId, { now, fact? }): Promise<PreviewReport>
```
Runs the real pipeline against real data and stubs exactly one function, the
effect executor. Writes nothing. Returns the occurrence or fact, the selected
rows by name, each unit's resolved input, and whatever the handler's `preview`
hook renders.

```typescript
arm(reflexId) / disarm(reflexId): boolean
```
Flips `enabled` on the loaded reflex. Instant, and outside the version hash.

```typescript
graph(): GraphReport      // edges, cycles, unverifiable, errors, warnings
sweep(now, retention): Promise<number>
```

---

## The ledger

Four row kinds, all readable through `tide.ledger` and — under a host that
exposes the tables — through ordinary queries.

```typescript
tide.ledger.firings(filter?)   // { reflexId?, limit? }
tide.ledger.firing(id)
tide.ledger.tasks(filter?)     // { firingId?, reflexId?, state?, limit? }
tide.ledger.task(id)
tide.ledger.attempts(taskId)
tide.ledger.facts(filter?)
tide.ledger.fact(id)
tide.ledger.causeChain(factId)     // walks `cause` upward
tide.ledger.releaseParked(factId)  // let a chain-ceilinged fact through
```

- **fact** — everything that arrived, with per-reflex delivery accounting.
- **firing** — one activation: cause, version hash, what the selection returned, outcome.
- **task** — one unit of effect work: unit key, pinned `env`, state, `output`.
- **attempt** — one execution try, with its token and error.

States: a task moves `pending → claimed → done | retrying | failed`; a firing
moves `pending → fanned → settled`, or lands on `skipped` (overlap, catch-up, or
a failed fan-out, always with a `note`).

**Retention** is a policy, not an accident. The default is keep-forever, which
is the only honest default when the rows are billing history:

```typescript
await tide.sweep(now, { facts: THIRTY_DAYS, attempts: NINETY_DAYS });
```

---

## The seams

| Seam | Contract |
|---|---|
| `store` | `TideStoreLike` — the persistence port. Two methods carry real promises: `commitFanout` is atomic with the firing's transition, `recordAttempt` is token-fenced and commits emits. |
| `transform` | `(config: unknown, source: Row) => unknown` |
| `select` | `(query: unknown, ctx: SelectCtx) => AsyncIterable<Row> \| Iterable<Row> \| Promise<Iterable<Row>>` |
| `effects` | `name → { run(input, ctx), touches?, preview? }` |
| `actor` | `(as: string \| undefined) => unknown` — threaded into `select` and `run`, opaque throughout |

```typescript
type TideCtx = {
  reflexId: string; firingId: string; taskId: string;
  taskKey: string;   // the downstream idempotency key — pass it to the provider
  attempt: number; now: number; actor: unknown;
  emit: (fact) => void;   // buffered; commits with a SUCCESSFUL attempt only
};
```

**The calling convention is the retry classification.** Return = done, however
unhappy the outcome (a card decline is a domain outcome: record it as a row and
let another reflex branch on it). Throw = transient, retried on bounded backoff.

---

## Stores

```typescript
import { createMemoryStore } from '@niscorp/tide';
import { createPostgresStore } from '@niscorp/tide/postgres';
```

`createMemoryStore()` is the reference implementation and what headless checks
run against. It also exposes `snapshot()` for assertions — deliberately outside
`TideStoreLike`, so the engine cannot reach around its own contract.

`createPostgresStore(client, options?)` takes a structural client:

```typescript
type SqlClient = {
  query: (sql, params?) => Promise<{ rows: Record<string, unknown>[] }>;
  transaction: <T>(run: (tx: SqlClient) => Promise<T>) => Promise<T>;
};
```

`transaction` is required, not optional: atomic fan-out and fenced recording are
transactions, not conventions. It creates its tables on first use (`tide_fact`,
`tide_delivery`, `tide_firing`, `tide_task`, `tide_attempt`, `tide_watermark`,
`tide_window`) and claims with `FOR UPDATE SKIP LOCKED`.

A store implementing this contract must hold the same semantics the memory store
does — run it against the same tests. A store that lies passes checks that then
fail in production.

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
| `invalid_fact` | a fact failed `FactInputSchema` |
| `duplicate_reflex` | two reflexes share an id |
| `unknown_reflex` | `fire`/`preview` named a reflex that is not loaded |
| `unknown_effect` | a reflex names an unregistered effect |
| `unguarded_cycle` | load found a loop with no guard anywhere on it |
| `duplicate_unit` | a selection's `unitKey` was not unique, or `maxFanOut` was exceeded |
| `store` | a selection exists but no `select` seam is wired |

Runtime failures are **not** exceptions: a handler that throws becomes a
recorded attempt, a `when` that throws becomes a recorded no-match, a fan-out
that fails becomes a skipped firing with a note. A tick does not crash because
one reflex is broken.
