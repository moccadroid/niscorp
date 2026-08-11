# @niscorp/tide

Host-blind automation engine. A **reflex** turns the clock and the fact into one named effect, through a durable ledger — and everything in between is rows.

Every nisc package answers one question: vex answers *what*, nova *how it looks*, charter *who may*, prism *into what shape*, cortex *thinks*. Tide answers **when**.

## Install

```bash
pnpm add @niscorp/tide zod
```

`zod` is the only peer dependency. Storage, selection, transformation, effects and identity are seams the host fills.

## Quick example

```typescript
import { createTide, createMemoryStore } from '@niscorp/tide';
import { evaluate } from '@niscorp/prism';

const tide = createTide({
  store: createMemoryStore(),
  transform: (config, source) => evaluate(config, source),
  select: async (query) => db.rows(query),
  effects: {
    'mail.send': {
      run: (input) => mailer.send(input),
      preview: (input) => ({ channel: 'email', to: input.to }),
    },
  },
});

await tide.load([
  {
    id: 'billing.dunning',
    intent: 'Email members whose payment failed three days ago.',
    on: { clock: { every: 'day', at: '09:00', tz: 'Europe/Vienna' } },
    select: { query: { table: 'overdue' }, mode: 'each', unitKey: 'member_id' },
    effect: {
      name: 'mail.send',
      input: { to: { $ref: '$.row.email' }, name: { $ref: '$.row.name' } },
    },
    policy: { retry: { max: 3, backoff: 'exponential', baseMs: 60_000 } },
  },
], { at: Date.now() });

// The host owns wake-up. Tide reads no clock.
setInterval(() => tide.tick({ now: Date.now() }), 60_000);
```

## The thesis

**An automation is an artifact.** It parses a schema, it is stored as a row, it diffs in review, it can be shown to a non-technical operator, and it can be previewed against real data before it is armed. A scheduled TypeScript function that queries a database and charges a card would be the most consequential logic in an application and the only piece with none of those properties.

**There is no run body.** No step language, no workflow interpreter, no in-memory execution state that matters. A reflex is a straight arc from stimulus to one response. A multi-step flow is a *chain*: an effect completes by producing a fact, and other reflexes fire on that fact. The database is the interpreter — so every joint between steps is a committed row, a crash between steps loses nothing, and every intermediate state is named, durable and visible.

## What you get

| | |
|---|---|
| **Four triggers, one ledger** | a clock, a fact (pushed or polled), an external signal, a person |
| **Idempotency before the effect** | the task row is written first, keyed `(reflex, cause, unit)`; there is no path to the effect that skips it |
| **DST-proof schedules** | occurrence identity is *local calendar fields*, so a transition can move the instant but cannot mint or lose a key |
| **Retry as a calling convention** | a handler that returns is done; one that throws is retried on bounded backoff to a terminal, visible state |
| **Transactional fan-out** | 500 tasks commit with the firing, so a crash never re-selects against moved data |
| **Fenced attempts** | a timed-out attempt that finishes late cannot overwrite the live one |
| **Fan-in for free** | a settled firing mints a fact carrying its stats — digests and dependencies are ordinary reflexes |
| **Dry run as a verb** | `preview()` runs the real pipeline and stubs exactly one function; a reflex cannot opt out |
| **A queryable ledger** | facts, firings, tasks, attempts — ordinary rows, with causality chains |
| **Deterministic tests** | a memory store and a fake clock; nothing to sleep on |

## Three verbs and two edges

```typescript
await tide.load(reflexes, { at: bootTime });   // validate, hash versions, verify the graph
await tide.ingest(fact);                       // the public intake contract
await tide.tick({ now });                      // the one heartbeat

await tide.fire('billing.dunning', { now, by: 'ada' });  // run it now — works on a disarmed reflex
await tide.retry(taskId, now);                           // reopen a parked task
await tide.preview('billing.dunning', { now });           // show me, change nothing
```

## Hosts

Tide imports no host. Under **moss** the seams are filled with vex (selection under the actor's scope policy, mutations auto-registered as effects), prism (transform), cortex agents (effects), and moss's `ActorContext` (identity) — and tide's tables sit beside `vex_cache`. In plain Node they are filled with raw SQL and plain functions. Nothing above the seam can tell the difference.

## Documentation

- **[DESIGN.md](./DESIGN.md)** — the thesis, the machine, the seams, and the decisions with their reasons
- **[DOCS.md](./DOCS.md)** — the full API reference

## Status

Pre-1.0. The grammar and the store contract are the parts to hold still; everything else may move.

## License

MIT
