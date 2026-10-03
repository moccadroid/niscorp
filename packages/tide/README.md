# @niscorp/tide

Host-blind automation engine. A **reflex** turns the clock and the fact into one named effect, through a durable ledger — and everything in between is rows.

Every nisc package answers one question: vex answers *what*, nova *how it looks*, charter *who may*, prism *into what shape*, cortex *thinks*. Tide answers **when**.

## Install

```bash
pnpm add @niscorp/tide zod
```

`zod` is the only required peer; `@niscorp/cortex` is an optional one, used only by `@niscorp/tide/agent`. Storage, selection, transformation, effects and identity are seams the host fills.

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

// The HOST owns waking. Tide reads no clock — it advances one committed step
// at a time and says when it next wants waking, and a driver does the rest:
// drain on every ingest, then sleep until that instant.
const drain = async () => { for (;;) { const r = await tide.advance({ now: Date.now() }); if (quiet(r)) break; } };
await drain();
const at = await tide.nextDue(Date.now());   // undefined = nothing scheduled
```

## The thesis

**An automation is an artifact.** It parses a schema, it is stored as a row, it diffs in review, it can be shown to a non-technical operator, and it can be previewed against real data before it is armed. A scheduled TypeScript function that queries a database and charges a card would be the most consequential logic in an application and the only piece with none of those properties.

**There is no run body.** No step language, no workflow interpreter, no in-memory execution state that matters. A reflex is a straight arc from stimulus to one response. A multi-step flow is a *chain*: an effect completes by producing a fact, and other reflexes fire on that fact. The database is the interpreter — so every joint between steps is a committed row, a crash between steps loses nothing, and every intermediate state is named, durable and visible.

## What you get

| | |
|---|---|
| **Three triggers, one ledger** | a clock, a write pushed by the host that saw it, an external signal — plus a person, by hand |
| **Idempotency before the effect** | the task row is written first, keyed `(run, unit)`; there is no path to the effect that skips it |
| **DST-proof schedules** | occurrence identity is *local calendar fields*, so a transition can move the instant but cannot mint or lose a key |
| **Retry as a calling convention** | a handler that returns is done; one that throws is retried on bounded backoff to a terminal, visible state |
| **Leased claims** | a process that dies mid-effect loses its lease and the work is taken back — no reaper, no heartbeat |
| **Transactional fan-out** | 500 tasks commit with the run, so a crash never re-selects against moved data |
| **Fenced attempts** | a timed-out attempt that finishes late cannot overwrite the live one |
| **Fan-in for free** | a settled run mints a fact carrying its stats — digests and dependencies are ordinary reflexes |
| **Dry run as a verb** | `preview()` runs the real pipeline and stubs exactly one function; a reflex cannot opt out |
| **A queryable ledger** | facts, runs, tasks — ordinary rows, with causality chains |
| **Deterministic tests** | a memory store and a fake clock; nothing to sleep on |

## Three verbs and the driver's edges

```typescript
await tide.load(reflexes, { at: bootTime });   // validate, hash versions, verify the graph
await tide.ingest(fact);                       // the public intake contract
await tide.advance({ now });                   // one committed increment of the world
await tide.nextDue(now);                       // when the driver should wake next

await tide.fire('billing.dunning', { now, by: 'ada' });  // run it now — works on a disarmed reflex
await tide.retry(taskId, now);                           // reopen a failed task
await tide.preview('billing.dunning', { now });          // show me, change nothing
```

**There is no `arm`/`disarm`.** Enablement is a property of the reflex the host hands over, so pausing one is: write your own row, `load` again. One source of truth, it survives a restart, and it leaves something to audit. There used to be a pair of methods that mutated an in-memory map; they were a second copy of a fact the host already owned, and they disagreed with it the moment either moved.

## Storage

Four tables, and only two of them grow with events:

| | carries |
|---|---|
| `fact` | the intake — durable before anything interprets it, so `ingest` is one write and matching is retryable |
| `run` | `UNIQUE(reflexId, cause)` — *the* idempotency, one constraint for every trigger kind |
| `task` | `UNIQUE(runId, unit)`, written before the effect; the lease; the retry counter |
| `state` | where each reflex has got to — one row per reflex, bounded by how many exist |

The port is six capabilities, not twenty-seven nouns: `transact`, `appendIfAbsent`, `claim`, `cas`, `query`, `remove`. `createMemoryStore()` is the reference implementation. `STORE_CONTRACT`, exported from `@niscorp/tide/testing`, is the same set of checks both it and any other store must pass — importable so a host's store is held to one definition rather than to two readings of a comment.

## The reflex agent — `@niscorp/tide/agent`

A model can WRITE a reflex; it never runs one. `createReflexAgent({ effects, triggers, fields })` is a cortex agent handed what somebody wants automated, the local `now` and timezone, and what the host offers:

- **effects** — each a name, a `description` (one to three sentences on what it does and what it is for: the model chooses by it) and a Zod schema for its input;
- **triggers** — which trigger kinds a draft may use (`clock`, `timer`, `write`, `signal`, `run`, `manual`; every kind if the option is left out — an empty list is an error), so a draft only ever uses what the host can run;
- **fields** — the extra fields a draft may carry (`params`, `select`, `when`; none if none are named).

The draft's shape is built from that choice (`draftSchemaOf`, from tide's own schemas, each with its description) — it is what the model is shown and what it is held to. A draft never carries who it runs as, its policy or whether it is enabled: those are the host's, and `anchorDraft` completes them. Its `id` is only a short name — the host may give the stored reflex its own id when it is saved; and a `run` trigger names another reflex's id, so a host that offers it must tell the model which reflexes exist.

It answers with ONE of three things (`answerSchemaOf`): a reflex draft; a `{ question }` back, when the request can be read as different automations and nothing in the conversation decides which; or a `{ refused }`, when no offered effect does what was asked. A question ends the run like any answer — nothing waits. When the person answers it, or corrects a draft they have not saved, the host runs the agent again over the conversation: `reflexConversation({ now, tz, earlier, latest })` turns the earlier requests and the agent's answers to them — as it gave them, reasoning first — and the latest words into the turns of a chat. A draft naming an effect that is not offered, or an input that effect's schema refuses, goes back to the model to correct in the same run (`effectProblem`). The host shows it, and when somebody saves it, anchors it (`anchorDraft`) and decides who it runs as (`as`); from then on it runs with no model at all. Cortex is an optional peer, used only by this subpath.

A draft's trigger may be a **timer** — `{ "timer": { "minutes": 5 } }`, "this long from now". A timer is sugar and is never stored: `anchorDraft(draft, { at, tz })` fixes it to a one-shot clock at the moment of saving plus its length, to the second (rounded up — never short), so time spent reading the draft is not taken off it, and a restart re-loads the same instant.

```typescript
import { anchorDraft } from '@niscorp/tide';
import { createReflexAgent, isDraft, reflexConversation } from '@niscorp/tide/agent';

const agent = createReflexAgent({ effects: [{ name: 'digest.send', description: 'Send the weekly digest to the team.', input: z.object({}) }], triggers: ['clock', 'timer'] });
const result = await agent.run(earlier.length === 0 ? { intent, now, tz } : reflexConversation({ now, tz, earlier, latest: intent }), { llm }).result;
if (result.ok && isDraft(result.output.data)) {
  // …shown to the person; when they save it:
  await tide.load([{ ...anchorDraft(result.output.data, { at: Date.now(), tz }), as: owner }], { at: Date.now() });
}
```

## Hosts

Tide imports no host. Under **moss** the seams are filled with vex (selection under the actor's scope policy, mutations auto-registered as effects), prism (transform), cortex agents (effects), moss's `ActorContext` (identity), and `createTideStore(pool)` from `@niscorp/moss` for persistence. In plain Node they are filled with raw SQL and plain functions. Nothing above the seam can tell the difference.

## Documentation

- **[DESIGN.md](./DESIGN.md)** — the thesis, the machine, the seams, and the decisions with their reasons
- **[DOCS.md](./DOCS.md)** — the full API reference

## Status

On npm and live. The version is below 1.0; releases are compatible all the same — what is exported and documented here keeps working from one release to the next, and what should go is deprecated, not removed.

## License

Apache-2.0
