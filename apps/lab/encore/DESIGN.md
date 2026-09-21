# Encore — design record

`PLAN.md` says what is built and in what order. This says why the pieces are the shape
they are, and what was measured or copied to get there.

## The agent

The slow speed is a **cortex agent**, not a structured call. Slice 1b's writer
(`src/server/writer/`) drove `signal.schema().stream()` over facts Jev had picked in
advance. That is enough to write a push message. It cannot answer "what's going on?",
because nobody can know in advance which facts that needs — so the writer is **replaced**,
not kept beside the agent. One mechanism.

### What was studied first

Three working agents on this stack, read before designing this one:

| | Words reach the UI by | The screen is changed by | Catalog in the prompt |
|---|---|---|---|
| **relay** (Ray) | the `fn:` reply, plus a trace snapshot published every 400 ms | tool calls mid-run (`stack` push/pop) | whole, every turn |
| **atrium** | the `fn:` reply, plus `thinking`/`seconds` at 1 Hz | a final declared state → `reconcileCanvas` | narrowed six ways; queries fetched by tool |
| **Midas** | `@niscorp/solid` over the envelope, `setData` at most every 60 ms | typed blocks the person clicks; never a dispatch | whole, every turn |

What each of them wrote down the hard way, and what it decides here:

- **atrium, `DESIGN.md:509-521`:** screen edits as tools needed a guard per failure mode
  (don't duplicate, don't stack a copy, remember to close what you opened); a declared
  final state makes all four structural. → **The agent returns a state; it has no screen
  tool.** Encore already reconciles declared states, so this is the path of least code too.
- **relay, `ray/run.ts:76-81`:** publishing on every model event cost 3× wall clock and
  starved the stream into provider rejections. → **Nothing here is per-delta.** Every
  write to the screen from a run is throttled.
- **Midas, `assistant-checklist-2026-09-09.md:205-207`:** "Ten to sixty seconds … is the
  known weakness: every turn carries the whole catalog and the whole screen." Its plan
  names catalog lookup as a seam it could not build: "that needs an index the deployment
  does not have yet." → **Jev's pass is that index.** It has already ranked the catalog,
  resolved the rows and chosen the facts, 300 ms before the agent starts.
- **Midas, `assistant.md:30-32`:** "The assistant never calls anything." Enforced by a lint
  rule, not a sentence. → copied, lint rule included.
- **Midas + relay on Groq's gpt-oss-120b:** it writes payload keys beside `response`
  instead of inside `data`; it stringifies nested arrays in tool arguments (signal's
  registry marks it `manglesNestedToolArgs`, so transport resolves to `emit`); a low
  reasoning effort broke multi-step flows; the provider-default temperature made the same
  prompt a 3-tool run or a 20-step wander. → `temperature: 0`, effort `medium`,
  `output.strategy` left unset, tools that take flat arguments only.

### When it runs

Jev decides, in the pass it is already making. `handoff/route` gains a fourth option:

| Route | Means | The agent |
|---|---|---|
| `direct` | the cards are the whole answer | does not run |
| `ask` | a question that wants an answer in words | answers, and may place cards as evidence |
| `write` | a field needs authored words | writes them in place |
| `plan` | an open question about what to do | proposes steps, each a prefilled form |

And one rule that is **computed, not asked**: if a settled pass leaves Jev with nothing —
**nothing cleared the mount line**, or a wanted card was demoted because a required input
could not be filled — the sentence goes to the agent as `ask`. Jev not knowing is itself a
routing decision.

Chips do not count as knowing. The first version also required that there be no chips; it
passed every check on the lexical fake and stranded every cold follow-up on real Jev,
which answered "which of those is the most urgent?" with `incident.feed` 0.64 and
`situation.now` 0.54 — four honest guesses and no card. A calibrated model almost always
has a middling opinion; a rule that waits for zeros waits forever. (The third rule to pass
on the fake and fail on the model, after the fill gate on `confidence` and the wording of
row-reference questions. Thresholds are tested against the real model before they are
believed.)

"Settled" is the debounce at rest, `handoff/complete` clearing 0.6, and the line idle
700 ms. Enter runs it now, whatever Jev thought.

### What it is handed

Static blocks first, the one dynamic block last, so a provider's prefix cache holds
(atrium `chat.ts:8-13`; Midas orders by cache tier and throws on a block out of order):

1. identity and the law — a few sentences, in `instructions`;
2. the contract — cortex and signal inject the JSON Schema; constraints live in `.describe()`;
3. **Jev's pre-decisions**, the dynamic block: the sentence, what the parser heard, the
   rows Jev resolved, the six actions Jev ranked highest (one line each, not JSON Schema),
   the rows of the context packs Jev asked for, and what is on screen.

So a typical run is **one model step**: the facts are already there. The tools are the
escape hatch for what Jev could not anticipate:

- `list_queries` — the readable fingerprints, fetched on demand rather than recited
  (atrium: "~1,100 tokens of prompt on every run, and most runs never query");
- `query` — replay one by fingerprint through `session.wire('/api/vex')`, as the operator,
  refused before the wire if the fingerprint is not in the allow-set or is a mutation,
  answer capped.

Both read. Neither touches the screen. There is no third tool.

### What it returns

cortex's envelope, used as designed — `response` **is** the answer; it is never spelled a
second time inside `data` (atrium `contract.ts:36-51`: the duplicate won, because it was
the one the app read):

```
response   the answer, in words — required
data       { canvases: { <canvasId>: [{ actionId, input }] }, fields: [...], steps: [...] }
reasoning  why, first
```

- **Only a canvas the answer names is reconciled.** An unnamed canvas is left exactly as
  Jev arranged it (atrium `contract.ts:247-259`: `columns: {}` "was taking the aside down
  every time").
- `actionId` is an enum of the narrowed list; each `input` is that action's own schema
  with every row reference an enum of Jev's candidates. An action the principal lacks, a
  row that does not exist and an input that does not fit are unrepresentable, not checked.
- Rejected whole on any violation. Nothing is partially applied.
- **One admission rule, in one file**, used by chips, plan steps and the agent's cards
  alike (Midas `screen-opening.ts`: "A second copy of that rule anywhere is a defect").

### How the words arrive

On an `assist.answer` card, mounted by the same Jev pass that routed the sentence, so the
room says "answering…" 300 ms after the thought settles. The run's `response` streams into
it through `@niscorp/solid` over the envelope, written with `setData` **at most every
120 ms** — Midas's mechanism at half its rate, because relay measured what unthrottled
costs. A rejected attempt is discarded before it reaches the card (Midas `reply-stream.ts:98-107`).
Tool calls show as a one-line trace under the answer: what was looked up, not the rows.

### The law, enforced

- The agent never dispatches an event, calls an endpoint or submits a form. ESLint bans
  `shell.dispatch` under `src/server/agent/**`; a check asserts no run ever wrote a row.
- A run is one `AbortController` per session. A new sentence aborts it; aborted is an
  outcome, not an error; the card settles at once while the provider stream drains.
- Every run is recorded through `session.recordRun` → the manifest's `runs` sink, on
  **every** branch — landed, failed, aborted — because a stopped run still spent tokens.
- `ENCORE_TRACE_DIR` writes one JSON file per run: the assembled prompt, every event, the
  raw reply. It is how every bug in the three apps above was found.
- Checks assert the prompt with `agent.preview()` — same assembly as a run, no key.

### Cards the questions need

A room that can only answer with words is a chatbot. "What's going on?" must put something
on screen that Jev can open **alone**, at 300 ms, with the words as the second layer:

- `situation.now` — on stage now and next, per stage; weather warnings in the next three
  hours; open incidents; holds and delays; the fullest zones.
- `incident.feed` — open incidents, newest first.
- `attendance.now` — people on site against capacity, by zone.

Each is also a context pack, so the agent's sentences and the card beside them are read
from the same rows.

### The thread — memory for the agent, none for Jev

Jev judges one sentence and is handed one sentence. It has no history and wants none: a
pass is a pure function of the line, which is what makes it cacheable, replayable and
checkable. **The agent is the opposite.** "And tomorrow?", "is the tent free then?", "do
that for the support act too" mean nothing without what came before, so the agent runs
over a thread.

- **The room resets per sentence; the thread does not.** A new sentence clears pins, cards
  and any run in flight (PLAN.md, the continuation rule). It never clears the thread.
- **The thread records every settled sentence, not only the ones the agent answered.**
  The operator moves the headliner — Jev alone, `direct`, no run — and then asks "is the
  tent free then?". The agent has to know what was just done. So a settled sentence is
  stored with what *either* speed made of it: the route, the rows resolved, the cards
  opened and what they were aimed at, and — when the agent ran — its answer. A turn Jev
  handled alone reaches the agent as one compact line, not as a transcript of nothing.
- **Rows, not process memory.** `agent_turns`, written through a vex mutation entry with
  the principal stamped server-side, read back through a vex entry. Relay keeps its
  history in the process and says so as debt ("eviction dies with the process"). The
  operator's line is stored **before** the run, so a failed or aborted reply still leaves
  the question (Midas `turn.ts:96-102`); an aborted run's partial answer is not kept.
- **The transcript is the caller's.** Stored rows are mapped to `Message[]` and passed as
  the run's input, newest last, a window of the last 20 turns (relay `ray/run.ts:22-25`,
  atrium `index.ts:159-163`). Order in the prompt: static blocks, then the thread, then
  this turn's pre-decisions as a system message, then the operator's line — so the
  per-turn block sits between the conversation and the last line, where Midas puts it,
  and the cached prefix survives.
- **A follow-up is where the computed fallback earns its keep.** Jev sees "and tomorrow?"
  cold, recognises nothing, mounts nothing — and "Jev doesn't know" routes it to the agent
  as `ask`, which reads the thread and knows exactly what is meant. Neither model has to
  pretend to the other's job.
- **The operator ends a thread, nothing else does.** A "new thread" control on the answer
  card. It is the operator's click, like every other write.
- **The thread is on screen.** `assist.answer` shows the current exchange with earlier
  turns above it, read from the same rows — the conversation is rows reloaded after a
  turn lands (atrium `assistant.action.ts:56-58`), not state held in a component.

### Not built, on purpose

- **No history for Jev.** See above; it is a decision, not an omission.
- **No summarising of the thread.** A window, whole, or nothing — Midas replaced its
  summaries with artifacts after review ("a summary is by definition less precise than
  the artifact it summarises"). If 20 turns ever cost too much, the window shrinks.
- **No delegation, manifold or approvals.** No lab app uses them, and one agent is enough.
- **No generative queries.** Reads are replay-only by fingerprint (PLAN.md D3). Relay's
  second engine is relay's.

## The room watches (scene 4)

Until now the room answers a sentence. This makes it pay attention with nobody typing —
and it is the clearest statement of what a decision model is *for*: at ~300 ms and
~$0.0001 a decision, **every event in the festival can be triaged**, not sampled.

### The shape

```
director (or, one day, real feeds) ── vex mutation ──▶ a write lands
   moss reaction: { table, op, count }   (row-less, by design)
      └─ per live session: coalesce → re-read what changed AS THAT PRINCIPAL
            └─ the same pass: derive → decide → resolve → reconcile  → `attention` canvas only
                  └─ critical only → the agent, mode `brief`, one line
```

- **The reaction carries no rows and must not.** moss's `reactions` say *that* a write
  landed; what it wrote is re-read through the session's own wire, under the session's
  own policy (`packages/moss/src/app.ts:274-296`: "rows handed to imperative code would
  be rows outside every fence this stack builds"). So the liaison, who cannot read the
  incident log, is never shown — or asked about — a security incident. Permission as
  existence, for events too, with no code that says so.
- **The event is the state.** Same `decide()`, same derivation, same bands. The state is
  the event as labels — kind, place, the numbers, the words of the report — instead of a
  line of text, and the per-action question reads "does this card belong on screen for
  this event?". Three event questions ride along: `event/urgency` (score),
  `event/interrupt` (noul: is this worth the operator's eyes now?), `event/audience`
  (choice: who should be told, if anyone).
- **One canvas, and only that canvas.** An event pass reconciles `attention` and nothing
  else. The sentence arranges `doing`, `about`, `when`, `where`, `nearby`; events never
  touch them. Two sources, one room, no fight — the same rule that keeps the agent from
  collapsing a canvas it did not name.
- **Most events answer "nothing", and that is the product.** A gate scan, a routine sale, a
  count that moved two percent: asked, answered no, gone. The trace counts them, because
  "412 events triaged, 3 raised" is the number that makes the point.

### What keeps it honest

- **Coalescing, per session, like keystrokes.** Single-flight with a trailing batch:
  events that land while a pass is out are merged by kind and place into the next one. A
  storm of scans is one state ("West Gate: 340 scans in the last minute"), not 340 passes.
  A global ceiling on event passes per second, shown in the trace when it bites.
- **The operator's sentence always wins.** A sentence pass and an event pass share the
  decider; the sentence is never queued behind events. The agent runs a `brief` only when
  no operator run is out, at most one per ten seconds, and only for an event Jev scored
  critical with its pick clearing 0.6.
- **Attention is finite.** Cards leave when their cause does (the incident closes, the
  zone drains) or when the operator dismisses them. At most four show; the rest fold into
  a counted line. The cap is on the display, never on what the model may say — atrium's
  lesson (`contract.ts:117-129`: "a cap the model cannot see is not a bound, it is a
  trapdoor").
- **A dismissal is a label.** Every raise and every dismissal is stored with the
  probabilities of the pass that raised it. That is the calibration record PLAN.md
  promised: whether 0.8 means four in five is measured here, per question, from the
  operator's own hand.
- **Flagged events join the rail.** "18:42 · Food Court 96% — raised" is a turn, so
  "what did I miss?" is a question the agent can answer from the thread.
- **Tone is the louder of the two.** The frame's tone is the maximum of the sentence's
  and the events', decaying when its cause leaves.
- **The law holds.** An event pass places cards. It never writes, notifies, opens a gate
  or sends a push; `event/audience` fills a draft the operator may send.

### The director

A deterministic script that plays Saturday evening through **vex mutations, as its own
principal** — a `director` role in the charter that may insert incidents, move zone counts,
flip a gate's scanner, and advance the clock. The clock becomes a row it advances;
checks pin it. Play, pause and speed are the operator's controls. It is a stand-in for
real feeds and it enters through the same door they would, so nothing downstream of the
write knows it is a demo.
