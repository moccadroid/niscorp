# Encore — the plan

The operations room of a three-day music festival, run by the person in the ops tent.
One screen. It has no navigation: the operator types (or says) what is happening, and
the room assembles itself around the sentence **while it is being typed**.

> "storm at 9 move headliner to the tent"

Before that sentence ends: the weather radar aimed at 21:00, the running order with the
headliner lit, a slot-swap form prefilled with act, from-stage, to-stage and time, the
tent's capacity against the expected crowd, and a draft push to attendees.

## What this proves

1. **A sub-second decision model makes the UI a function of intent.** Nisc already made
   the UI a closed set of data on a server that sees every keystroke. A model that
   *selects* — and answers in ~100 ms — is enough. Nothing generates a layout.
2. **The questions are derived from the catalog.** No hand-authored question set. The
   principal's resolved actions and their `input` schemas become the decision tree:
   an `enum` is a `choice`, a `boolean` a `noul`, a bounded integer a `score`, a row
   reference a `choice` over candidate rows. Add an action and the room can open it.
3. **The model picks, it never invents.** Jev returns no strings. Rows come from vex
   reads under the session's policy and Jev chooses among them; dates, times and
   amounts are parsed deterministically. It cannot make up a person or an act.
4. **Probability is assertiveness.** High mounts the card, middling offers it as a chip,
   low shows nothing. Nothing commits on its own — the model never presses a button.
5. **Width is free, depth costs a round trip.** Every question in a call is answered
   independently, so the tree goes out flat in one pass and the resolver reads its
   branches afterwards. The `trace` canvas measures how wide a pass can get before the
   typing feel degrades — that number is the point of the demo.

## Decision points

| # | Decision | Tier | Answer |
|---|---|---|---|
| D1 | Posture | derived | moss server app. Forced by the thesis: the loop runs where the shell is, and the shell must see keystrokes. |
| D2 | Environment | derived | PGlite + vex's postgres cache, schema and seed at boot. A demo; the data is fiction and resets on restart. |
| D3 | Reads | derived | Vex entries. Candidate retrieval needs vex's `fuzzy`/`ilike` filters under the session policy — a hand-written handler would be a second, unfenced read path. |
| D4 | Writes | derived | Vex mutation entries. Every `do` card is a form whose submit replays a fingerprint. |
| D5 | Routing | derived | None. There is one screen and its state is a sentence, not a URL. |

All five are derived from the design the user approved (2026-09-21: fresh app, festival
operations, operators' control room, "go wild" on action kinds). Recorded for review.

## Answered

- **Audience.** The festival's operators. One seeded operator principal, relay-style dev
  token minted in the page. A second, narrower role (`vendor-liaison`) exists to show
  that the candidate list is the resolved catalog: an action the principal lacks is
  never a question, so the model cannot pick it.
- **Domain.** Fiction, seeded: stages, acts, slots, crew, guests, vendors, gates, zones,
  weather, incidents, ticket and bar sales.
- **Decision provider.** `@niscorp/signal`'s `decide()`. `TYPESAFE_API_KEY` in
  `apps/lab/encore/.env` selects Jev; without it the app runs on its own fake decision
  provider — a local server speaking the same System One wire with a lexical scorer —
  so every check is deterministic and offline. A chat provider can be switched in to
  watch the same questions emulated, uncalibrated and seconds slow.
- **Nothing outside `apps/lab/encore`.** Gaps found in the packages become cases.

## The shell

Every region is a `list` canvas, and every canvas is a question. A card's position
comes from *which canvas it lands on*, never from an order within one — nova has no
verb to reorder instances, and a room whose cards jump is worse than one whose don't.

| Canvas | Asks | Holds |
|---|---|---|
| `line` | — | the intent line (frame, always mounted) |
| `doing` | what are you doing? | `do` forms, prefilled; more than one when the sentence has two intents |
| `about` | who or what is this about? | record cards: act, stage, crew, guest, vendor, gate |
| `where` | where is it? | the site map, aimed |
| `when` | when is it? | running order, countdown, weather at that hour |
| `nearby` | what else matters? | lists, charts, gauges, feeds |
| `maybe` | — | mid-confidence options as chips; a click mounts one |
| `warm` | — | hidden; speculative mounts so their reads are cached before promotion |
| `trace` | — | the instrument: questions, bytes, lane timings, probabilities |

**The frame rearranges.** The frame embeds the room as a `{ ref }` and the loop swaps it
with `shell.setLayout` among authored arrangements — `calm`, `focus`, `split`,
`warroom` — chosen by one `choice` question. An urgency `score` sets the frame's tone.

## The loop

```
keystroke → ui:model (debounce 0) → fn encore.intent (returns at once)
  parse        dates, times, amounts, durations — deterministic
  candidates   vex fuzzy reads per entity kind, ≤8 labels each, under the session policy
  derive       catalog + input schemas + candidates → questions
  decide       one wide pass; sharded into parallel calls only past the provider's limits
  resolve      bands + hysteresis + pins → Desired[] per canvas, arrangement, tone
  reconcile    reconcileCanvas per canvas → moss flushes one frame
```

- **Single-flight, trailing latest.** One pass in flight, the newest text queued behind
  it. Abort-on-keystroke would never land a result while someone types; an answer for
  "move headl" is still right at "move headliner". Same backpressure moss uses for frames.
- **Bands.** Mount at ≥ 0.80, unmount at ≤ 0.55, chips between. A card the operator has
  touched is pinned until dismissed.
- **Only labels leave the process.** Action descriptions and candidate labels go to the
  provider; rows never do.
- **Every engagement or dismissal is a label**, stored with the pass that produced the
  card, so calibration is measured rather than taken on the vendor's word.

## Two speeds: Jev decides, an agent answers, writes and plans

> **`DESIGN.md` is the specification for this section** — what was studied first (Midas,
> atrium, relay), what the agent is handed, what it returns, the thread, the law. What
> follows is the summary; where the two disagree, DESIGN.md wins. "Slice 1c — derived while
> building", below, records what building it decided. (Slice 1b shipped this as a single
> `signal.stream()` call — "the writer". It was replaced whole, not wrapped: one mechanism.)

Jev routes and fills. It cannot write a sentence, reason across rows, or build a plan —
and it should not try. What it cannot finish it hands to **a cortex agent with a thread**
(Groq's `openai/gpt-oss-120b` through signal), and the handoff is **Jev's own decision**,
asked in the same wide pass at no extra latency:

| Question | Type | Decides |
|---|---|---|
| `handoff/route` | choice: `direct` · `ask` · `write` · `plan` | whether cards suffice, the sentence wants an answer in words, a field needs authored words, or it needs reasoning |
| `handoff/complete` | noul | whether the thought is finished — the agent is never run on half a sentence |
| `context/<pack>` | noul each | which declared reads the agent is handed (the situation, incidents, attendance, the day's lineup, the weather window, stage capacities, sales) |

And one route that is **computed, not asked**: a finished thought that leaves Jev with
nothing — no card, no chip worth offering, or a card it wanted and could not aim — goes to
the agent as `ask`. Jev not knowing is itself a routing decision.

**The fast speed never waits.** Jev's cards land at once. A sentence is *settled* when the
pacer is at rest, `handoff/complete` clears 0.6 and the line has been idle 700 ms; a settled
sentence routed to the agent starts a run (Enter starts one now) — and the card that says
so, `assist.answer`, was mounted by the same pass.

**The agent is handed Jev's work, and a conversation.** Static blocks first (identity and
the law, the tools' own guides, the contract, what the room is), then **the thread** — the
last twenty turns, as messages — then **this turn's pre-decisions** as one system message
(the sentence, what the parser heard, the rows Jev resolved, Jev's top six actions *one line
each*, the rows of the packs Jev chose, what is on screen), then the operator's line. So a
typical run is one model step. Two tools, both reads: `list_queries` and `query` — replay by
fingerprint over the session's wire, refused before the wire if it is not in the caller's
allow-set or is a write.

**It returns cortex's envelope.** `response` is the answer, streamed onto the card at most
every 120 ms. `data` is the room's: `canvases` (the complete state of each canvas the answer
*names* — no other canvas is touched), `fields` (words for `.meta({ write: true })` fields
nobody has typed in) and `steps` (a plan: each a chip that opens one prefilled form). One
admission rule, in one file, decides what may be opened — for the agent's cards, a plan's
steps and a clicked chip alike. Rejected whole.

So the thesis holds at both speeds: the model places, it never generates a layout, it
cannot name a row that does not exist, and **it never presses a button** — `law-check`
reads the agent's files and counts the database's rows to hold that.

**The thread is memory for the agent and none for Jev.** Every settled sentence is a turn —
including the ones Jev handled alone, stored as one compact line of what was opened and
aimed at — in `agent_turns`, written and read through vex with the principal stamped by the
engine. The room resets with every sentence; the thread only when the operator says so.
Jev is handed one sentence and nothing before it, and a check asserts that on the wire.

**It is abortable and the fast speed is not.** A Jev pass always lands; a run is torn down
the moment the sentence changes in a way that moves Jev's answers. Aborted is an outcome:
the card says so at once, the question stays in the thread, the partial answer does not.
A field the operator has touched is never overwritten by either speed.

**The trace shows both clocks** — the pass in milliseconds, the run in seconds, model steps
and tokens for each — and `ENCORE_TRACE_DIR` writes one JSON file per run.

Without `GROQ_API_KEY` (or with `ENCORE_AGENT=off`) no run starts and no answer card
appears; the route is still asked and traced, and settled sentences are still turns.
Checks run the agent against a scripted chat client under signal's real adapter,
deterministic and offline, the same way the fake decider works.

## Actions

Cards, not screens: each is small, has an `input` schema with `.describe()` on every
field and `.meta({ ref })` on every row reference, and knows nothing about the intent
line.

| Kind | Actions |
|---|---|
| Spatial | `site.map` (focus zone, overlay, zoom) · `stage.view` · `gate.flow` |
| Temporal | `lineup.timeline` (stage, day, highlight) · `act.card` · `countdown` |
| People | `artist.card` · `crew.roster` · `guest.card` · `vendor.card` |
| Money | `sales.chart` (metric, grain, range, compare, kind) · `ticket.tiers` · `bar.revenue` |
| Live | `weather.radar` · `incident.feed` · `gate.ticker` · `crowd.gauge` |
| Do | `set.delay` · `slot.swap` · `crew.dispatch` · `ticket.comp` · `refund.issue` · `gate.toggle` · `push.compose` · `incident.log` |
| Frame | `intent.line` · `intent.options` · `intent.trace` · `assist.run` (the text model's card: status, streamed note, plan steps) |

## Order of work

1. **Slice 1 — the loop, end to end.** Skeleton, schema and seed, a plain kit, the
   shell, the fake provider, the loop, one action per kind, and a check that types the
   storm sentence into a real shell and asserts what each canvas holds.
   **Slice 1b — two speeds.** The handoff: route, completeness and context-pack questions
   in the pass; the text-model run with its closed output contract; touched-field pins;
   both clocks in the trace; a fake chat provider for the checks.
2. **Slice 2 — the room.** The full roster and the components that make it a room: map,
   timeline, chart, gauge, radar.
3. **Slice 3 — wild.** Arrangement and tone, two intents in one sentence, correction
   ("no, the other stage"), anticipation from the action graph, speculative mounts,
   voice via interim speech transcripts.
4. **Measure.** Jev against the fake against an emulated chat model, at growing width.

## Cases this is likely to raise

- **moss: the resolved catalog is `{ ids, hash }`.** This is the third app to re-join
  ids against definitions to get descriptions and input schemas.
- **nova: no verb to reorder instances on a canvas.** Designed around here; still a gap.
- **nova: `ActionDefinition.input` has no machine-readable row reference.** `.meta({ ref })`
  is this app's convention; if the deriver proves out, the convention wants a home.

## Slice 1 — derived while building

Choices that followed from the plan rather than being asked, recorded for review.

- **Three `.meta()` marks beside `ref`.** `parse` (`day` · `hour` · `time` · `minutes` · `amount` · `line`)
  names a field the deterministic parser fills and the deriver must never turn into a question —
  without it "a bounded integer is a `score`" would make `minutes` a 121-level distribution.
  `fallback: 'now'` lets such a field take the festival clock when the sentence names no value
  (a radar with no hour is aimed at this one; a swap form with no time is left blank).
  `levels` gives a `score`'s steps their words. Same standing as `ref`: a convention wanting a home.
- **`required` is read off the input schema.** A card whose required input is not confidently
  filled is offered as a chip rather than mounted — a record card of nobody is an empty box.
- **`none` on every choice**, enums included. An input is optional and "not said" is the commonest
  true answer.
- **Sharing is by content.** Two fields that emit the same question (same words, same options) are
  asked once; the shared act field lives in `app/actions/shared/input-fields.ts`.
- **From-stage is read, not guessed.** `slot.swap` keeps `fromStageId` as an input, but its mount
  load copies the act's current stage over it, and the mutation's WHERE carries it.
- **A delay is a ledger row**, not an edit to the slot: the mutation grammar has no arithmetic.
- **The clock is pinned** (Saturday 18:00). "today", "tonight" and "tomorrow" resolve against it.
- **A bare hour is an evening hour.** "at 9" is 21:00; the programme runs noon to 23:45.
- **A chip click pins** the card until the line is cleared. Pins on *touched* cards are Slice 3.
- **Uncalibrated picks** (a chat provider emulating `decide()`) are worth exactly the line they
  must clear — yes = 0.80, a pick = 0.60 — and the trace says `calibrated: false`.

## Slice 1b — derived while building

Choices that followed from "Two speeds" rather than being asked, recorded for review.

- **The contract carries everything it validates.** The per-run zod contract is not
  `actionId: enum` + a loose `input` checked afterwards: each narrowed action is its own
  member of a union with that action's input contract rebuilt as zod, and every `.meta({ ref })`
  field is an enum of Jev's candidate ids for that table in this pass (labels in its
  `.describe()`). So "outside the narrowed list", "outside the candidates" and "fails the
  action's schema" are all the same failure — not in the type — and signal can feed the zod
  issues back for its one correction retry. The reply is parsed once more against a static
  shape at the app's own boundary. Still rejected whole.
- **The narrowed catalog rides the message too**, as the brief says (id, title, description,
  region, mounted, input JSON Schema). The input schemas are therefore present twice — once as
  data the model reads, once as the type it must satisfy. The scripted writer needs the first
  to find an action's row references.
- **A context pack the principal cannot read is never a question.** Each pack declares the
  tables it reads; packs are filtered against the session's compiled `ScopePolicy` before
  `derive`, the same rule that keeps an ungranted action out of the questions. The liaison is
  asked about `sales` and nothing else.
- **Packs are read when a run starts, not per pass.** The pass only decides which.
- **`assist.run` needs a grant** (`assist.*`, both roles). No grant or no writer → no slow path.
- **The card is a promise until a run starts, then a report.** Pending is withdrawn if the
  route falls back to `direct`; running / landed / aborted / failed stays until the line is
  cleared, so an aborted run can say so even when the sentence that aborted it needs no run.
- **A signature is run once.** `landed` and `failed` are remembered per signature until the
  line is cleared; only Enter re-runs them. `aborted` is not remembered — if the sentence comes
  back, so does the run.
- **The signature is route + the SET of narrowed actions + the SET of resolved entities.** Two
  actions trading places in Jev's top six is not a new question. Ties in rank keep CATALOG
  order — the loop now derives in authored order rather than the alphabetical order moss
  resolves ids in. With a calibrated model ties do not happen; with the lexical fake they are
  most of the list, and they decide which forms a fake plan can propose.
- **Enter on a `direct` sentence** runs whichever of write / plan Jev gave the higher
  probability (plan when the provider was uncalibrated). Enter waits for the fast path to go
  idle first — milliseconds — because a run is *for* a landed pass.
- **In a plan, cards wait behind their steps**; a card no step points at mounts on landing. In
  `write` mode every card mounts on landing.
- **A card the slow path opens is adopted by the fast path**: pinned, its input remembered
  (`given`), and a pass is run so Jev fills the keys the text model left alone. `given` counts
  toward a card being aimed, so a record card the text model opened is not unmounted by a pass
  in which Jev is unsure of the record.
- **Touched, and authored.** Two sets per instance. *Touched* (a person, or the card's own mount
  load correcting a guess) — neither speed writes it. *Authored* (the text model wrote it) —
  the fast path leaves it alone, the slow path may write it again. Without the second, the next
  pass put the raw sentence back over a written message. Both reset when the line is cleared;
  a card re-mounted by a re-aim starts clean.
- **A touched field is not offered.** Touched before the run starts → absent from `writable`,
  so the text model is never asked; touched mid-run → the write is dropped at the door.
- **One correction retry** (`.retries(1)`), then the run fails.
- **Rarity is per question family in the fake decider** (`action/…` competes with `action/…`),
  so adding context packs does not dilute what lights a card. The fake's new cues — the
  write / plan lexicon, the completeness shape test, the first-option fallback — are generic and
  live in the scorer; no action or pack description was written for them.
- **The default check world runs with the writer off**, so the six fast-path checks assert the
  fast path alone; `handoff-check` builds its own worlds.

Cases this raised:

- **signal: `stream()` / `complete()` lose `usage.reported`.** `StepResult.usage.reported` exists
  (`packages/signal/src/stream/execute-step-stream.ts:141`) and is dropped when `runStream`
  sums usage into `SignalMeta` (`packages/signal/src/run.ts:100-113`, `143-147`). The trace shows
  "usage reported: not said". `decide()`'s meta keeps it.
- **signal DOCS.md says `.stream(input)` is "Not yet implemented"** (`packages/signal/DOCS.md:174-176`);
  it is (`packages/signal/src/run.ts:119`), and takes `{ signal }`.
- **An aborted `stream()` surfaces as an error**, "stream ended without a done event"
  (`packages/signal/src/run.ts:141`), because `executeStepStream` returns quietly on abort
  (`execute-step-stream.ts:79, 128`). The caller has to consult its own AbortSignal to tell an
  abort from a failure; `writer/run.ts` does.
- **nova: no provenance on data.** "Who wrote this value" is reconstructed in `touched.ts` from
  `shell.onDataChange` plus a record of the loop's own writes. It works; it is also exactly the
  bookkeeping a `setData(next, { origin })` would make unnecessary.

## After the first real session — derived while fixing

A real operator, on the real providers, ran the storm plan and then typed OVER it —
"how many guests are there right now?". Jev answered correctly and the screen did not move.
Three defects, and three measured findings about latency.

**A new sentence is a new room** (`server/intent/continuation.ts`).

- The line is compared against an ANCHOR — the furthest the current sentence has been typed —
  not against the previous keystroke. Typing forward (the anchor is a prefix of the line) and
  backspacing (the line is a prefix of the anchor) are the same sentence; backspacing does NOT
  move the anchor, so "backspace to `storm at 9`, then say something else" is one new sentence
  rather than two continuations.
- An edit — neither a prefix of the other — continues the sentence only if the line still
  begins with ≥ 70% of the anchor; the sentence then continues from the edited line. Common
  suffixes are deliberately not counted: "move headliner to the tent" → "move lantern club to
  the tent" keeps most of its characters and none of its meaning. So a typo fixed EARLY in a
  long line is a new sentence. That costs a pin and a re-decided run; the other mistake costs a
  room that makes no sense.
- Compared trimmed, lowercased, whitespace collapsed.
- A new sentence drops everything HELD — pins, `given`, who placed what, touched/authored,
  remembered run outcomes, the in-flight run (aborted), the `assist.run` card, the confirmed
  `heard` tags — and nothing on SCREEN: the pass runs on the new text and unmount hysteresis
  takes down what Jev no longer wants. A pass started under the old sentence still lands, but
  has no say in the slow path.
- The remaining edge, handled elsewhere: an edit in the last 30% can change what the sentence
  is ABOUT and still be a continuation. When that moves the handoff signature, the superseded
  plan's cards are released back to Jev's judgement (unpinned, `given` forgotten).
- A line with nothing to decide ("st", "at 9") is not a new sentence, but the room comes down
  as for an empty line, and a run in flight is aborted: the sentence stopped asking.

**The room can answer a plain question.** `attendance.now` (canvas `nearby`): the site total
against total capacity and every zone's share, at the festival clock's hour unless the sentence
names one. It takes no row, so nothing can demote it to a chip. The zone shares are worded
("91% full") in the entry's mapping, upstream of the layout. **The liaison holds it, on
purpose**: it reads `zones` and `zone_counts`, which they already read for the gauge and the
map, so the grant widens no data.

**The room accounts for itself.**

- Every card the loop mounts is composed `with: ['placed']` — one fragment, no per-action field —
  and carries `placedBy`: `jev 0.89`, `you`, or `120b · step 2`. The loop rewrites it in place
  as Jev's confidence moves.
- With nothing on the canvases the chip strip says so: "Nothing in the room answers that yet."
  / "…These are guesses — click one to open it." A cleared line says nothing: nothing was asked.
- `calm` is a wrapping Row of flex columns, and the kit collapses an empty Stack (`:empty`), so
  a column whose canvases are all empty takes no room. Columns have a `max`, so a lone card on
  a wall display stays a card.
- `assist.run` says what is happening in a sentence (`say`), not a state name.

**Latency** (measured by the coordinator against the real provider: ~220 ms round trip,
+~230 ms TLS, 66–140 ms server time regardless of payload size).

- `server/keep-warm.ts` installs an undici `Agent` as the global dispatcher at boot. Verified
  here rather than assumed: against a server that sends no keep-alive hint, two built-in
  `fetch`es five seconds apart open two sockets on Node's default dispatcher and one on this
  one. `decider-check` holds that in place (4.6 s idle gap, one connection).
- The decider is pre-warmed at boot and on `ui:focus` of the intent line (`encore.warm`): one
  one-question `decide()`, skipped if the connection was used in the last 20 s, never throws,
  outcome in the trace. Whether a pass reused a connection comes from undici's
  `undici:client:connected` diagnostics channel and is shown in the trace (`connection`).
- **The pacer debounces, server-side** (`PASS_QUIET_MS = 140`, `PASS_CEILING_MS = 400`): quiet
  timer re-armed per keystroke, a ceiling from the first unsent keystroke, a space sends at
  once, the trailing-latest slot behind an in-flight pass is unchanged and starts on landing
  with no extra wait, an empty line bypasses all of it. A line with no token of ≥ 3 characters
  is never sent. `waitedMs` is in every pass record and the trace. The clock is injected and
  the rules are asserted on a fake one.
- **The instant lane** (`server/intent/heard.ts`): right after parse and retrieval, before
  `decide`, the line shows what was HEARD — values read, and the top matched row per table —
  as muted `matched` tags; the pass confirms them (accent) or drops them. A row the previous
  pass confirmed stays confirmed while the next is out, so tags do not blink. For closed tables
  (every row is always retrieved) a row counts as heard only if a word of the sentence begins a
  word of its label.

## Slice 1c — derived while building

The writer became an agent (`DESIGN.md`). Choices that followed from that rather than being
asked, recorded for review — and where what was built differs from DESIGN.md, it says so.

**Deviations from DESIGN.md, and why**

- **The contract is not per-run; the admission rule is.** DESIGN.md: "`actionId` is an enum
  of the narrowed list; each `input` is that action's own schema … unrepresentable, not
  checked." That needs a schema built per run, and the agent is defined ONCE at module scope
  (also DESIGN.md) — `output.schema` is part of the definition. So `agent/contract.ts` is the
  static shape (strict keys, five named canvases, `actionId: string`), and the per-run half —
  these six actions, their own input contracts, this pass's candidate rows as enums, this
  screen's writable fields — is `admitAnswer` in `intent/admission.ts`, built from the same
  zod the slice-1b union was. It runs twice with the same arguments: inside the run, as
  cortex's `output.validate`, so a refusal goes back to the model as a correction; and when
  the answer lands, where a refusal rejects it whole. The guarantee is the same; the model is
  told the rule in prose and lines (`ACTIONS`, `ROWS`) rather than as a JSON Schema enum.
- **cortex's validator is handed no run context, so the run's facts reach it through
  `AsyncLocalStorage`** (`agent/run-facts.ts`). See the cases below. The honest alternative
  was no in-run correction at all.
- **The law is a check, not an ESLint rule.** The root ESLint config is outside this app.
  `law-check` strips comments from every file under `src/server/agent/` and fails on
  `.dispatch(`, `.publish(`, `.setData(`, `getRuntime(`, `reconcileCanvas`, a held `Shell`,
  `fetch(`, an endpoint call, a mutation's fingerprint, a second `wire(`, or a value import
  from nova — then scripts a run to ask `query` for every mutation the app has, and counts
  every table before and after.
- **`response` streams through cortex's `output-partial` events**, which ARE solid's
  progressive parse of the envelope (`packages/cortex/src/loop/partials.ts`). The app does
  not import `@niscorp/solid` itself — a second parser over the same bytes would be the
  duplicate DESIGN.md warns about.
- **A Jev-alone turn is stored when its sentence is LEFT, not the moment it settles.** At
  700 ms the form is open and nothing has been done with it; by the time the operator types
  the next sentence it has been corrected by hand and perhaps submitted, and the one compact
  line can say so (`SUBMITTED`). Settling is what makes it a turn; leaving is when it is
  written. An agent turn's line is stored before its run, as DESIGN.md says.

**Choices**

- **One settle timer for every route.** `direct` sentences arm it too — that is how they
  become turns — so "settled" means one thing.
- **Every write a run makes to the card is throttled**, not only the words: "looking
  something up" and a retry's wipe share the same 120 ms budget (`ANSWER_WRITE_MS`, one
  constant, `intent/assist.ts`). Patches merge while they wait, and a patch that changes
  nothing is not a write — solid reports a partial per chunk, and most of an envelope's chunks
  are not the answer. Landing, aborting and failing bypass it: the card settles at once.
- **A canvas the answer names is reconciled to exactly what it listed.** Cards it left out
  are closed and then *held down* (`suppressed`, resolve.ts) — offered as chips, not mounted —
  or Jev would put them back on the next keystroke. A click outranks that; a new sentence
  clears it. Cards it listed are adopted (pinned, `given`) exactly as slice 1b's were.
- **A plan step JOINS its canvas**; only `canvases` describes one whole.
- **`null` and absent both mean "I did not name this canvas"; `[]` names it, empty.**
- **Required inputs are required of anything a model opens, and not yet of a chip** — a chip
  opens a card with nothing and Jev aims it on the pass the click sets off (`partial`).
- **The computed route only fires on a finished thought** (`complete` ≥ 0.6), and a card a
  person pinned does not count as "Jev wanted it and could not aim it".
- **Enter on a `direct` sentence** runs the likeliest of ask / write / plan, `ask` on a tie
  or with no odds: of the three it is the one that cannot put a wrong form up.
- **The same sentence is stored once**, however often it is run (Enter after a failure).
- **The answer card lists the turns BEFORE the exchange it is showing**, loaded through its
  own declared endpoint (`encore.thread`) at mount and on a `thread-changed` message the
  manager publishes when a row lands. "New thread" is an endpoint too (`encore.newThread`):
  a `break` row. Threads are never deleted, only ended.
- **The thread window is turns, not rows**: the last twenty operator lines and everything
  after the first of them. A Jev-alone turn is `[cards only] Opened …`, as an assistant
  message.
- **`situation.now` and `incident.feed` are NOT the liaison's.** Both read `incidents` —
  medical and security reports — and the overview reads the bill and the weather too. With
  the tables go the `situation` and `incidents` packs and those fingerprints from their
  `query` allow-set, all by the one rule: can this policy read every table it touches.
  They do hold `assist.*` and a thread of their own.
- **The `runs` sink is an in-process list of the last 200** (`boot.ts`). A run has three
  outcomes and moss has two, so the third rides the label: `write:aborted`.
- **The fake's `ask` cue is shape, and a fallback**: a question mark or an interrogative first
  word, counted only when no other concept cue fired ("what should we do?" is a plan). `how`
  left the plan lexicon for that reason. A terminal `.`, `?` or `!` finishes a thought.
- **The scripted agent model is asked for one MOVE per model step** — call a tool or answer
  — from what a model would have in front of it, so a scripted run is a real multi-step run.
  It declares Groq's capabilities, so transport resolves to `emit` and a check that reads the
  prompt reads the prompt Groq gets.

Cases this raised:

- **cortex: `OutputValidator` is handed the envelope and nothing else**
  (`packages/cortex/src/loop/loop.ts:72-74`, called at `:389-390`) — no `deps`, no `RunCtx`,
  unlike gates, hooks and `prepareStep`. A module-scope agent therefore cannot validate an
  answer against anything per-run without a side channel. One argument fixes it.
- **cortex: `output.schema` is static by construction**, so DESIGN.md's per-run enum
  contract is not expressible on an agent defined once. Either `RunOptions` takes an
  `output.schema` override, or per-run narrowing is `validate`'s job (and then see above).
- **moss: `RunRecord.outcome` is `'ok' | 'failed'`** (`packages/moss/src/app.ts:389`). An
  aborted run is neither; it is recorded `failed` with `label: '<mode>:aborted'`.
- **signal's `usage.reported` gap is closed by using cortex** (`RunMeta.usage.reported`); the
  DOCS.md note and the abort-surfaces-as-error note from slice 1b still stand for anyone
  calling `stream()` directly.
- **nova: still no provenance on data** — `touched.ts` is unchanged and now serves three
  writers.

## Slice 2a — derived while building

The answer surface, the impact card, exposure, and scenes 1–3 of `SCENARIOS.md` end to end.
`SCENARIOS.md` is the specification; this is what building it decided, and where it differs.

**Designed for a model with a middling opinion.** Three rules had passed every check on the
lexical fake and failed on calibrated Jev (the fill gate on `confidence`, the row-reference
wording, the zero-chips fallback). So every rule added here was written against a model that
almost never says zero, and the fake can now BE one: `noulFloor` lifts every yes/no onto
[floor, 1] (`ENCORE_DECIDER_MIDDLING`, `decider.fakeMiddling`). `scenes-check` turns it to 0.4
and re-runs the rules that matter: a cold follow-up is eight-plus chips and no card and still
reaches the agent; the impact card stands beside the form at a probability that alone would
only have made it a chip; a companion that cannot be aimed never routes.

**Deviations from SCENARIOS.md, and why**

- **A claim's `row` is admitted and carried, not yet drawn.** A cited sentence lights its CARD,
  both ways; lighting one row inside a card needs every list primitive to take a highlight key
  and every read to name its row key. The segment carries `row`, so it is a kit change, not a
  contract change.
- **A bad row keeps its claim.** "Dropped with a note" for a row outside the card's rows means
  the ROW is dropped: the words still stand on the card. A wrong card or words that are not in
  the answer drop the claim; a wrong card/row/input in `canvases`/`steps` still rejects whole.
- **Hover rides `ui:focus`/`ui:blur`.** nova has no pointer-hover event, so pointing with a mouse
  and tabbing to a span are the same event with the card's key as payload — which is also the
  right semantics. The kit settles attention for 120 ms before reporting a change, so a pointer
  crossing a paragraph is one round trip, not twelve. This is the operator's event, not a run
  write; run writes keep their own 120 ms budget, spans included (asserted).
- **The impact card stands beside MOVES, not beside every plan step.** A hold and a push have no
  target stage to be consequences of. `COMPANIONS` (canvas-placement.ts) is the mechanism; a
  second pair is one line.
- **The scene-1 plan on the fake moves Nova Kestrel to The Grove, not Velvet Arcade.** Velvet
  Arcade is under a roof, so nothing the storm turn was handed names her — and an answer may only
  name rows that are on the table (below). The red verdict is the scenario's own: 22,000 into 4,000.
- **"what are our options" reaches the agent as `plan`, by Jev, on the fake** — "options" is a
  plan cue and has been since slice 1b. The COMPUTED route is exercised beside it with a cue-less
  follow-up under the middling floor. The fake's follow-ups carry a question mark: its finished-
  thought test is a shape test, and four short words are not a shape.
- **Follow-ups are not ranked by Jev.** SCENARIOS.md says "Jev ranks them"; they are shown in the
  agent's order. Ranking is one more `choice` in the pass that lands the answer — a second pass,
  so it was left until it can be measured on the real model.

**Choices**

- **Citations are admitted twice and only fatal never.** `claims` and `followUps` go through the
  one admission rule (`admitAnswer`), which now returns what stood and, in words, what did not;
  the notes are shown on the card. Claims are checked against the screen AS IT IS when they are
  checked — once in the run, again after the answer's own cards have landed — so a card the same
  answer places may be stood on. Two claims over the same words: the first wins.
- **The answer is segments, cut once, server-side** (`intent/answer-spans.ts`). While it streams it
  is one plain span; unlinked words are marked unsupported only once it has LANDED.
- **One channel, one key.** Every card the loop opens wears the `placed` fragment, which now also
  wraps it in a `Spotlight` with `citeKey` (its action id) and listens on `attention`. The answer
  card announces a span's card on that channel and listens on it too. No card knows it can be
  cited; no component knows what an agent is.
- **The rail is its own card on its own canvas** (`assist.rail`, canvas `rail`, seeded at build),
  because it has to outlive the exchange and exist for sentences that want no agent. One entry
  per TURN, newest first, four shown, the rest counted; each exactly one line. "New thread" moved
  there with it.
- **What a turn amounted to is written WITH the row** (`detail.rail`), from authored templates
  per form (`app/rail-phrases.ts`: "moved {actId} → {toStageId}, {time}") with row ids worded as
  names. The rail never re-derives history from a screen that has moved on.
- **A pressed button is a turn**: role `did`, written when a form's `saved` goes true
  (`shell.onDataChange`). It ticks the plan — a step is OPENED by its chip and DONE only by that
  press — and reaches the agent's thread as `[button pressed] …`.
- **The rows the conversation has put on the table may be named.** An answer is admitted against
  this pass's candidates ∪ the rows the facts it was handed are about (`PackRead.refs`) ∪ the rows
  earlier turns resolved or were handed (`detail.rows`). Without it a follow-up — which retrieves
  nothing — could never move the act the last answer was about. All were read under the caller's
  policy.
- **Exposure is a column the database keeps** (`slots.exposure`, a BEFORE trigger over stage cover
  × the weather hours the set overlaps). It is a fact about three tables, vex introspects tables
  and not views, and a swap has to clear it in the same write. The running order's mapping turns
  it into a tone and the words for why; the timeline is told which key is a tone.
- **Verdicts are computed in vex mappings** (`vex/impact.entries.ts`), using `$.context` for the
  half of each comparison that lives in another table. The card's own tone — the worst of its
  lines — is the one fold done in the layout (`$prism`), over verdicts the reads already gave.
- **`move.impact` re-aims in place from the form** (`move-draft`, emitted on the form's `ui:model`)
  and is re-opened by nova's own rule when JEV re-aims it. Both are correct: a hand edit must not
  flicker, and a verdict must never sit under an aim it was not computed for.
- **A pass no longer writes what is already true.** nova re-opens a card when a mount key is among
  the keys WRITTEN, moved or not — so a pass repeating `actId` beside a new `placedBy` re-mounted
  the form on every keystroke. `reconcile.ts` now drops unchanged keys, unless a mount key really
  moved, in which case the card is re-opened with all of its input.
- **A written field follows the forms beside it.** After a `write` lands, a change to any sibling
  form's values (by hand or by the sentence) re-asks the same question after the usual quiet. A
  field the operator has typed in is not offered, so it is never written.
- **Status is what was read, and how long**: packs have a `noun` ("the running order").
- **ACTIONS lines mark required keys with `*`**, so a model (and the scripted one) knows which
  cards it can open without a row.
- **The fake's new cues, all generic**: a correction word ("no", "not", "instead", "rather", …)
  discounts what was named before it once something after it names another option of the same
  question, and the word after inherits the direction of the one it replaces; a sentence that is
  nothing but intensity words is a question; `how` had already left the plan lexicon.
- **Seed**: The Tent holds 6,000 (was 9,000); two more Saturday-evening open-air sets, so the
  storm exposes three.

Cases this raised:

- **nova: no pointer-hover event** (`packages/nova/src/shared/event-bus/schemas.ts:36-47` — click,
  submit, input, focus, blur, model, key, drop). Citations ride focus/blur.
- **nova: `reconcileCanvas` re-opens on a mount key that was WRITTEN, not one that CHANGED**
  (`packages/nova/src/shell/reconcile.ts:99`: `Object.keys(input).some(…mountInputKeys…)`). Worked
  round in `intent/reconcile.ts`; the fix is to compare values.
- **prism: no string → number** (`packages/prism/src/schemas/node.schema.ts:64-79`). "21:00" becomes
  minutes of the day by `$dateDiff` from midnight on an arbitrary date — exact, and a workaround.
- **prism: `$join.parts` is a fixed list**, so a computed array of names cannot be joined with a
  separator; two clashing sets' names run together in the clash line.
- **vex: views are not introspected** (`packages/vex/src/adapters/postgres/introspect.ts:113-115`,
  `table_type = 'BASE TABLE'`), and a non-array `shape` hands a mapping only the first row
  (`packages/vex/src/engine/runtime.ts:386-389`) — so a read that folds all its rows into one
  object must declare an array shape and return its lines as rows.
- **A form that outlives a sentence keeps what a person typed into it** (the touch tracker resets,
  the value stays). Found by the rail wording; not changed here, and worth a decision.

## Scene 4 — derived while building

The room watches (`DESIGN.md` § The room watches, `SCENARIOS.md` scene 4). What building it
decided, and where it differs.

**The shape, as built.** A director writes through `/api/vex` as its own principal (`director`
role: counts, incidents, a gate's scanners, scans, the clock — and nothing a person decides).
moss's `reactions` (six tables) call `loops.notifyFeed(table)`; every live session's watcher
(`server/watch/watch.ts`) waits for the feeds to go quiet (120 ms, 500 ms ceiling), re-reads
each changed feed over ITS OWN wire with a cursor (`rev`, one sequence stamped by trigger on
insert and update), merges rows by kind + place (`events.ts`), and gives each thing that happened
the same pass a sentence gets — `deriveQuestions(…, 'event')` → `decide` → the same bands → one
canvas, `attention`. Three event questions ride along (`event/urgency`, `event/interrupt`,
`event/audience`).

**Designed for a model with a middling opinion.** `watch-check` runs with the fake's `noulFloor`
at 0.4 THROUGHOUT: a routine event is a 0.4 "worth a look?" and every card a 0.4 guess. Raising
therefore has hysteresis like mounting — up at `INTERRUPT_AT` 0.7, down under 0.5 — and needs
BOTH the interrupt and a card over the mount line that can be aimed.

**Deviations from DESIGN.md, and why**

- **A raise is a TURN; a label is a CLICK.** DESIGN.md says every raise and every dismissal is
  stored as a label, and also that an event pass never writes and labels are the operator's
  click. Both cannot be a row in `attention_labels` written by the pass. So: every raise is
  stored as an `event` turn in the thread with the probabilities of the pass that raised it
  (the loop's write, like every turn), and every KEEP or DISMISS is an `attention_labels` row
  written by the raised card's own endpoint — a vex mutation, stamped by the engine — carrying
  those same probabilities. A raise nobody clicks has a turn and no label. `law-check` asserts
  the label table is empty after an evening of raises and no clicks.
- **An event raises VIEWS, never forms**, and `event/audience` is recorded (turn detail, label
  probabilities) but does not yet open a push draft. A form on `attention` with nobody typing is
  a second way to reach the send button; it wants its own decision.
- **One card per CAUSE, not per action**: `attention` is driven with `shell.push` /
  `removeInstance`, because `reconcileCanvas` keys a canvas by action id and two zones over the
  line are two gauges. Still the only canvas an event pass touches (asserted by instance ids and
  by origin).
- **The cap is on the display**: four shown by urgency then recency, the rest counted on the
  strip by name ("+2 more raised, not shown: …") — raised, on the rail, and shown as room is made.
- **A dismissal holds its cause down until the cause changes band or leaves** — "I have seen
  this", not "never tell me about the Food Court again".
- **The brief** is the same agent in a fourth mode (`brief`, never a route): no tools, nothing it
  may name, handed the causes that are up; it lands whole on the strip (one line is not worth
  streaming). Critical + pick ≥ 0.6, none while an operator run is out, one per ten seconds, and
  a brief that cannot go now is dropped, not queued. An operator run starting aborts one in flight.
- **The clock is a row per DATABASE and an object per SESSION**: the director advances
  `festival_clock`; each watcher re-reads it under its own policy and mutates the session's clock
  in place, which both speeds read. Checks that do not play the director see 18:00, as before.
- **Bands are authored** (`events.ts`: crowd ≥ 90% warning, ≥ 95% critical; an incident's own
  severity; a scanner down is a warning). They are what a feed would stamp on a reading, not a
  judgement — and on the lexical fake they are most of what it has to go on. On a real model the
  reading itself should carry it; whether it does needs the key.

**The warm-up and the first pass (fixed).** Two causes, both found here. (1) A request sent in the
very tick the previous one finished finds undici's client still marked busy, and the pool — allowed
two sockets — opens the second: measured on the fake (`open connections 2` without, `1` with one
`setImmediate`). That is the `connection new` a first pass paid beside a warm socket. A pass now
waits for a warm-up in flight (bounded, 1 s — never longer than the handshake it saves) and one
turn of the loop more. (2) "Fresh" was a twenty-second guess about OUR keep-alive; the far end
hangs up when it likes. It is now a count of open sockets per origin, from undici's diagnostics
channel and each socket's own `close`. The boot warm-up moved after the database boot. The 5.2 s
warm-up itself could not be reproduced on the fake (27 ms beside the database boot) — if it is the
provider's cold start, a pass no longer races it for more than a second.

Cases this raised:

- **undici / Node fetch: a client is "busy" for a tick after its response completes**, so
  back-to-back requests on a two-socket pool open the second socket. Not a package of ours; worked
  round in `decider.ts` `ready()`.
- **nova: `reconcileCanvas` is keyed by action id per canvas** (`packages/nova/src/shell/reconcile.ts`
  — `find((item) => item.definitionId === entry.actionId)`), so a list canvas cannot be reconciled
  to two instances of one action. `attention` is managed by hand.
- **moss: `reactions` are per table, not per session** (`packages/moss/src/app.ts:274-296`) — right,
  and it means fan-out to live sessions is the app's (`functions.ts` roster). A `sessions()` iterator
  on the server would make that three lines shorter.
- **vex: no way to read "max(rev)"** without an aggregate entry; the feeds sort newest-first with a
  limit, and the first read (cursor 0) is how a watcher learns where "now" is.

## After playing the director on the real providers — derived while fixing

**Raised cards went stale** ("96%" over a gauge reading 93%). Fixed at the root, for every card on
every canvas (`app/reload-on-write.ts`, `server/watch/reload.ts`):

- Which tables a card reads is DERIVED from the entries its own endpoints replay; the reload
  trigger (`reload:<action id>` → re-run the card's own mount steps) is composed onto every
  definition in the catalog. No card carries one. The hand-written `lineup-changed` /
  `delays-changed` / `pushes-changed` emits and listeners are gone: one mechanism.
- moss reactions are declared for every table a mutation can write (derived from the entries), so a
  form's submit and a feed's write reload the same way. Each session's reloader publishes only for
  actions with a card up, throttled per action: the first write re-reads at once, the rest of a
  burst become one more after 500 ms. `gate_scans` reloads nothing — no card reads it.
- A `fallback: 'now'` field that nobody set follows the clock ROW: re-aimed in place (same
  instance) and re-read when the director advances it. "Nobody" means not a person's hand
  (`touched`) and — on the sentence's canvases — not a kind of time the sentence said. The hour a
  card shows is an hour BUCKET (counts are hourly), so it moves when the clock crosses the hour.
- The director now logs the scanner fault as an incident as well as flipping the gate, so a list of
  open incidents under that alert can show it.

**The brief restated its header.** It was handed every standing cause — in FACTS — and its last
message named one; a model answers its last message. The line is now the whole situation ("JUST
NOW … / STANDING, all at once: …"), the causes are structured (`place`, `kind`, `band`, `reading`,
`since`), and the instruction asks for the one thing the header cannot say: how they compound. No
adjectives, no advice.

**The strip adds up**: every event is one of raised · nothing · already up · left.

## "What am I looking at?" — derived while fixing

The room after the director had finished: a standing red brief about causes that had all left, a
blank middle, a trace of zeros ending "calibrated false", a deck at 63 of 63, an unlabelled list.

- **The brief leaves with its causes.** It remembers the causes that stood when it was written and
  comes down when ANY of them leaves; the next critical event writes a fresh one. A brief that
  lands after one of its causes has already gone is not shown at all.
- **An idle room says so**: no sentence, no card, nothing raised → one muted sentence on the chip
  strip (`intent.options.idle`, the strip's fourth state — no new canvas). It offers "press play"
  only to a principal who holds the deck, and is gone at the first key or the first card.
- **The trace has a zero state**: one muted line until the first pass lands; no rows before.
- **A finished director says so** (`status`: ready · playing · paused · finished), and `play`
  becomes `replay`. `reset` is DERIVED from the script — every count back to what that hour was
  seeded with, every incident it opened closed, every scanner working, the clock row back to the
  start — and sent through the director's own mutations as the director. Nothing is deleted (the
  feed has no such grant); a second play's incidents get their own ids. **Play sets the scene
  first**, so the first play and every replay open with the same writes and raise the same things
  (asserted: identical rail lines).
- **The rail has a heading.**


## The surface — derived while building

The room showed its instruments to everybody: probabilities on cards, model names, a wall of
timings, state words in mono capitals. **Three layers that never mix**, and the rule that makes
it true is that the second and third are not in the tree the terminal is sent.

1. **The app** — the line, the answer (citations, follow-ups), cards, attention cards, a quiet
   history called "Earlier" (three lines, "show all").
2. **Why** — one quiet "why?" per placed card (the shared `placed` fragment; no card knows it).
   One plain sentence, written where the card was decided: `resolve.ts` for Jev ("Opened because
   you said “…” — fairly sure."), `assist.ts` for the assistant and for a pressed step, `loop.ts`
   for a clicked chip. Confidence is a WORD off the same bands the room mounts by
   (`confidenceWord`: ≥0.9 sure · ≥ MOUNT_AT fairly sure · else a guess). Closed by default; open
   is the card's own data.
3. **X-ray** — ONE switch (`room.xray`: a button bottom right, and the backtick key through the
   kit's `Hotkey`, which draws nothing and ignores keys typed into fields). It calls
   `encore.xray`; the loop flips a per-session flag, writes `xray` into every instance in place,
   and swaps the room's arrangement with `shell.setLayout` for the one that heads each region with
   its question. A card that mounts later is told as it arrives (`onStateChange`).

**How it is kept honest.** Every meta element is behind a layout `if` on `$.xray`, or is a prop
bound through `$if/$then/$else` (the rail's role column, the line's "heard" prefix, the chip's
meter). Where the DATA itself is meta it is projected before it is sent — the rail's rows lose
`by`, the heard tags lose `state` (`$prism` → `$map` → `$omit`). No CSS hides anything and no
component is duplicated or knows what a model is; the kit gained `Hotkey`, a `quiet` button, a
`stateKey` on `Tags`, a plain variant of `Rail`, and lost the card's eyebrow (every card said
"DOING" above "Move a set"; the props are gone from the layouts too).

**What the app says instead.** The answer card's status exists while something is happening
("Reading the running order and the weather…", "Answering…") and is gone once the answer is
there; `say` keeps the instrument's line (what was read · how long) for x-ray, and a new `plain`
carries the only things an operator still needs to be told — a failure in one sentence, "press a
step…" under a plan, "edit the words freely" under a draft. The idle sentence does not offer a
deck the app does not show. The strip's counts and the ceiling line are x-ray's; what is folded
away and the brief are the app's. A raised card is severity + sentence + keep/dismiss: the
alerting rule's band words ("— warning — needs attention soon") are for the model, and the card
already wears a badge (`withoutBand`). The director is one tiny "demo ▸" handle in the app and a
deck in x-ray.

**The drawer.** The trace is five sections — Pass · Decision · Handoff · Run · Probabilities —
each ONE line the loop writes (`summary_pass`: "Pass 10 · 348 ms · 40 questions") until somebody
opens it. What is open is the card's own data and the loop never writes it, so it survives every
pass, every sentence and the switch itself. Flat keys (`open_pass`), because a trigger's `set`
takes a key and a nested object would be replaced whole by the loop's merge.

**The line stays put; the drawer is docked.** The frame is now the line, ONE scrolling column
(answer, history, suggestions, attention, the room), then the drawer: the trace and one row
holding the director and the switch. Before, four raised cards pushed the room and the
instruments off the bottom of the window. With x-ray off the drawer is two tiny handles, bottom
right: "demo ▸" and "x-ray".

**Toggling re-mounts nothing.** `xray` is no action's mount input, so writing it is a re-render
in place: same instance ids, hand edits kept (asserted with a typed-over time field).

**"Why" is rewritten with the sentence.** It quotes the line as it stands — the room is a
function of the line, and a quote frozen at the keystroke the card first appeared on reads
"because you said “move the headl”". So a pass that re-aims a form writes two keys, not one
(scenes-check restated, dated).

**The "Reading…" status is a run write**, so it goes through the same 120 ms throttled writer as
the answer (handoff-check counts every write a run makes to its card; the first version wrote
around it and the count caught it).

**Checks that read the instruments off the rendering** now turn x-ray on first (watch-check,
and one assertion each in typeover- and handoff-check); everything that read DATA was untouched.
Restated with a date: boot (a fourteenth canvas), scenes (above), watch (the trace draws section
summaries, the heading is "Earlier").

**Design pass**, folded into the kit's stylesheet rather than layered over it: one spacing scale
(4·8·12·16·24), one radius, one border weight; the line is the largest type in the room and the
answer the second (18/1.6, 70ch), both in the reading face; labels are sentence case; mono is for
a time, a count, the instrument; a citation is an underline that brightens with its card; a card
has two text sizes (16 title, 14 everything else) and badges/quiet buttons are chrome at 12.

`surface-check` (39): every message served with x-ray off — a storm sentence, a question, a plan,
a failure, the director's evening, under a 0.4 floor — walked leaf by leaf for model names, state
words, probabilities, timings and units, and the same scan proven not blind by running it over
x-ray on.

## Polish, and a correction that no model can get wrong — derived while fixing

**Suggestions are few.** A calibrated model has a middling opinion about most of the catalog and
every one of those clears `CHIP_AT`: one question put eight chips on the strip. The app shows at
most `CHIPS_SHOWN` (3), best first, and only those within `CHIP_MARGIN` (0.15) of the best —
`resolve.ts suggestedOf`. The whole middle band is still computed, still counted by the handoff,
and x-ray shows all of it with meters. Asserted under a 0.4 floor (nine chips in the band, one
offered).

**A correction is READ, not judged** (`intent/supersede.ts`, lane 2½, pure). "move the headliner
to the tent no the grove" left To = The Tent on the real model and passed every check through the
fake scorer's negation cue — the sixth rule the fake hid. Now a row the speaker took back is
removed from that pass's candidate sets BEFORE a question is derived from them: it is not an
option, for any model. The heard tags are built from the same sets, so the line shows the
survivor; Jev gets the line as typed plus a `superseded` note; the pass record carries
`superseded` and the note leads its `notes`.

- A row is MENTIONED when a word of the sentence begins a word of its label and of no other
  row's in that table ("stage" names four stages and therefore none). Stopwords and marker words
  are not mentions ("no" begins "Nova").
- **Two kinds of marker, because English has two** — a deliberate departure from "not = no":
  `replaces` (no · actually · i mean · scratch that · instead · rather): what FOLLOWS replaces the
  same-table row said LAST before it. `rejects` (not · instead of · rather than): what follows is
  the thing NOT meant, and goes if another row of its table was mentioned at all. Treating "not"
  like "no" takes The Grove back in "to the grove, not the tent" — deterministically wrong, for
  every model, which is the opposite of what the lane is for.
- Different tables never touch; a marker with nothing after it changes nothing; "do not delay"
  supersedes nothing; chained corrections chain.

**The fake's negation cue is removed** — `CORRECTIONS`, `TAKEN_BACK`, `takenBack`, the direction
a word inherited across a correction — so scenes-check proves the lane. Two things the fake
needed instead, both about being a word-counter and neither about corrections: "no" is a function
word, and a `superseded` NOTE is not the sentence (it would have been the operator saying
"taken", "back" and "place", and it names the row that was taken back). decider-check now asserts
the fake has NO opinion: handed both stages, it cannot fill the field.

**A value the sentence no longer says goes back.** A form kept 21:00 from an earlier sentence
that the new one never said. A parsed field the current line does not name returns to the card's
own blank (`FieldPlan.blank`, the definition's default; `resolve.ts blanksOf`) — in place, same
instance. A field a person typed into is still theirs (the reconciler strips it). Not done, and
the same class of bug: a CHOICE field (`toStageId`) the new sentence stops naming keeps its row.

## The redesign — derived while looking at it

What the user saw on the real app: a wall of 18 px text reciting the card beside it, every
sentence underlined and flashing green, two identical rows of pills, "why?" shutting itself, a
scrollbar inside the page, columns with nothing in them — and x-ray, left on by somebody else.

**One packed flow, not columns.** A canvas is still a question the loop owns; it is no longer a
place. Every question canvas — and what the room raised, first — renders into ONE `Pack`
(`shell/calm.layout.ts`); a slot renders no element, so the cards of six canvases are siblings in
one grid. Columns come from the width the pack HAS (a container query: 1 · 2 · 4 · 6), a tile
spans what its size class says at that width, `grid-auto-flow: dense` back-fills, and rows are
4 px with each tile spanning as many as its content is tall (measured by `Pack`, re-measured on
resize) — so nothing waits under a short card for a tall neighbour to end. Size class is DATA
beside the placement (`canvas-placement.ts CARD_SPAN`). Looking at it changed the numbers:
`regular` and `wide` are halves and wholes (then thirds and two-thirds) so they always sum to a
row; records were `compact` until a form beside one record left a quarter of the row empty.

**Meaning by colour, not position.** Five of the kit's hues, one family, one lightness, none near
the amber and red kept for severity: a thin left edge on the card and a small sentence-case tag
("Doing · About · When · Where · Context"). The kit names colours; `CATEGORIES` says what they
stand for. Three things mount cards (Jev, the assistant, the watcher) and all hand the chrome its
tile through one function (`tileOf`). A form's old green `accent` border is gone. X-ray swaps the
arrangement for the same pack under a legend of the five questions.

**One scrollbar, the page's.** The frame is a document that grows: no `100vh`, no inner scroll
box. The line sticks to the top of the page, the handles to the bottom; neither is a scroll
container. The only thing that may scroll inside itself is x-ray's drawer (34vh).

**The answer shrinks and stops reciting.** Body size, 70ch. AT MOST TWO SENTENCES (320 chars), and
never a recital: an answer that names more than two of the things a mounted card is showing
(`namesOn`: strings under `name`/`*_name`/`summary` in the rows it loaded) is REFUSED with the
reason and the model gets its one correction — never truncated. The bounds live in the contract
(`agent/contract.ts`), are said in the instructions and the schema's description from the same
constants, and are enforced by admission, in-run and at landing. (`response` is cortex's envelope
field, so the bound cannot be a `.max()` on it.) Citations are invisible at rest: a dotted
underline on hover or focus, and the cited card outlined in ITS OWN hue.

**One row of next steps.** Card suggestions are chips (≤3, each with the hue of what it would
open); follow-up questions are plain "↳" links (≤2) in the same row, written there by the run
(`assist.ts writeNextSteps`). A plan's steps ARE the next steps: while they stand, no other card
is offered. Follow-ups must be specific and are never a repeat: the thread's asked lines and every
follow-up it was ever offered (`thread.asked()`, stored on the agent's turn) are handed to the
agent as ASKED and deduped by admission.

**"Why?" stays open.** The bug: nova re-opens a re-aimed card by removing it and pushing a new
instance, which starts from the fragment's defaults — and while somebody types, most passes move a
mount key. Whoever re-opens a card now hands the new instance what the old one held under
`KEPT_ACROSS_REOPEN` (reconcile.ts, assist.ts). Asserted across a re-aim (new instance id), a
reload-on-write, and the switch.

**X-ray is unmistakable and never sticky.** On, a violet marker at the very top says so, with
"turn off" beside it (`room.marker`). And it does not survive a page load: moss tells an app when
a shell is BUILT, not when a terminal attaches to one that already exists, so the arrival is
noticed from the terminal — the kit's `OnLoad` clicks once per page load, only while x-ray is on,
and that click is a reset (`command: 'off'`), not a toggle.

**Density.** "Earlier · 3" is one line until pressed. Title 15, body 13.5, one radius, hairline
borders, 12–14 px padding.
