# Lyceum — what was measured

What the models actually did against lyceum, measured before each seam's design was
settled. Not a plan: the choices these led to are recorded in `PLAN.md` ("Decided").
Probes are written before a run and not rewritten to pass.

## 2026-09-29 — the same changes, one at a time (`LYCEUM_PART=tide`, 8 runs each)

Each configuration built on the real path (tide's source rewritten, rebuilt, restored after),
21 probes × 8 runs = 168. Cumulative: each step on top of the ones kept.

| step | change | total | kept? |
|---|---|---|---|
| B0 | the last good prompt (wide draft, `as` line, worked example, old S2, S1, the full trigger line) | 155/168 | — |
| B1 | the draft built from lyceum's choice (`clock`, `timer`; no `as`/`policy`/`enabled`) | 154/168 | yes — level |
| B2 | the worked example removed | 147/168 | yes — see below |
| B3 | S2 reworded to cortex's `reasoning` | 148/168 | yes — level |
| B4 | S3, "ask about everything still undecided in one question" | **155/168** | **yes** |
| B5 | lyceum's trigger line cut to the timer sentence | 146/168 | NO — the email refusal 6 of 8 wrong, replies 5 of 8 |
| B6 | S1 generalised to corrections (on B4, line kept) | 144/168 | NO — and the correction still 7 of 8 wrong |

The example's removal cost what it cost on two probes: "Every day at 9:00" was asked about
("9:00 AM or 9:00 PM each day?") — by the times paragraph a defensible question, since
"9:00" is not plainly a 24-hour time; the example had shown "16:00" — and "At quarter to
ten", which has swung between 0 and 5 misses of 8 in every configuration. It stays out.

The correction ("End the talk in 30 minutes" → a notification → "Nah, I meant put up the
last slide") failed in EVERY configuration, 7–8 of 8: the model asks "When should the last
slide be shown?" — its reasoning: "hasn't specified when". Replaying the draft WITH the
reasoning it was written with (as lyceum does; the probe did not): 0 of 6, the same
question.

The prompt kept is B4, and it is what the source now says (lyceum's line restored).

SPEC CHANGE, after the speaker read the answers: both readings are right in two probes —
the correction may keep the 30 minutes or ask when ("Nah" can reject them too), and "Every
day at 9:00" may be written or asked about ("9:00" is not plainly a 24-hour time). The
probes take either now. B4's own answers, judged again: all 8 correction "misses" were that
question — **163/168**. Left: "At quarter to ten" written, not asked, 3 of 8; "Tonight,
just once" asked again 1; "Ring in half an hour" 1.

## 2026-09-29 — the caller's draft, no example, S2 reworded, S3: WORSE (`LYCEUM_PART=tide`)

Five changes at once — the draft built from lyceum's choice (`triggers: ['clock','timer']`,
no `as`/`policy`/`enabled`/`select`…); the worked example removed; S2 reworded to cortex's
`reasoning` ("first restate the whole request… then decide"); S3 ("ask about everything
still undecided in one question"); lyceum's trigger line removed (the schema says it now) —
plus one probe added before the run: a correction of an unsaved draft ("End the talk in 30
minutes" → a notification → "Nah, I meant put up the last slide" → the closing slide at
19:35). 3 × 4 runs: **74/84, 75/84, 69/84**. On the 20 probes shared with the run below:
**217/240, against 225/240** — worse, and with five changes in one measurement, no single
cause can be named.

- The correction: **1/12**. It asked "When should the last slide be shown?" 9 times, and
  put it up NOW twice — the 30 minutes of the draft it was correcting kept 1 time in 12.
- "Email me in ten minutes": 7/12 — 3 ERRORS (the refusal's `refused` written as an OBJECT,
  three times over: "expected string, received object"; never seen before), 2
  notifications.
- "Tonight, just once" (reply): 5/12 — "What exact time tonight?" 7 times.
- "End the talk" (no time): the closing slide NOW, 2 of 12 (it asked 4/4 with lyceum's
  trigger line).
- "At quarter to ten": written, not asked, 4 of 12.

## 2026-09-29 — S2 + S1 applied, measured twice more (`LYCEUM_PART=tide`)

S1 went into tide's prompt beside S2; lyceum's timer line reworded ("When only a timer is
asked for, with nothing to do when it ends, it notifies the person." — was "A timer asked
for on its own notifies the person when it is up", read once as "timers can only
notify"). Same 20 probes, 4 runs each: **75/80, 74/80** (76/80 the run before — 225/240
over the three).

- Replies 8/8 and 6/8 (22/24 over three runs); the misses: "Tonight, just once" → "What
  exact time tonight?", 2.
- "End the talk in 30 minutes" → the closing slide 2 (of 8). Both readings are right (the
  speaker's call, 2026-09-29): the probe will take either.
- "At quarter to ten" written, not asked, 3 (of 8).
- One each: "Show the last slide in 2 minutes" and "Go back to the title slide in 5
  minutes" → a NOTIFICATION; "Ring in half an hour" refused ("can't ring a bell"); "Email me
  in ten minutes" → a notification.

## 2026-09-29 — S2 applied; S2 again, and S2 with S1 (`LYCEUM_PART=tide`)

S2 went into tide's prompt. Measured again, same 20 probes, 4 runs each:

| | total | replies (8) | other misses |
|---|---|---|---|
| S2 (the same prompt as S2 below) | 73/80 | **4** | "end the talk in 30" → the closing slide 2; "go back to the title slide in 5 minutes" REFUSED 1 — *"Timers can only send a notification"* |
| S2 + S1 | 76/80 | **8** | "end the talk in 30" → the closing slide 2; "set a timer" refused 1; "quarter to ten" written, not asked, 1 |

S2 alone scored its replies 8/8 in the run below and 4/8 here — the SAME prompt. The
variance between two 4-run measurements is larger than the differences being measured; the
single comparison below ranked S2 on noise. Over both runs S2 alone is 12/16 on replies; S2
with S1 8/8 (one run). "Tonight, just once" is the reply that fails: "What time tonight?"
The refusal of the title slide misread lyceum's own line ("a timer asked for on its own
notifies the person") as "timers can only notify".

## 2026-09-29 — three steering sentences for replies, tried one at a time (`LYCEUM_PART=tide`)

The BASE, first: "an automation happens once unless the person says it repeats" (replacing
"ask whether it repeats"; `every`'s description matched to it); a refusal sentence in tide's
prompt ("when the request names something to be done that no offered effect does — a
channel, a device, an action — refuse it; never put a different effect in its place");
`notify`'s "sends nothing anywhere else" line removed (the refusal sentence covers it);
SPEC changes: "End the talk in 30 minutes" expects a notification (a slide ends nothing),
"Put the register up at 21:00" the next 21:00, once; "Show the last slide in 30 minutes"
added. Then each sentence alone on top of the base, the real path each time (tide's prompt
swapped and rebuilt), **4 runs**, 20 probes:

| | total | replies (8) | "quarter to ten" asked (4) | email refused (4) | other misses |
|---|---|---|---|---|---|
| base | 66/80 | 4 | 1 | 2 | 6, one each, scattered |
| S1 "a reply … together with the request before it, is one request — keep what the request said, and add what the reply decides" | 74/80 | 6 | 4 | 3 | "the slide where the room asks questions" 2, "end the talk in 30" 1 |
| S2 `reasoning` "restating the whole request as the conversation now has it — then how you read it" | 74/80 | **8** | 2 | 4 | "the slide where the room asks questions" 2, two timers 1 each |
| S3 "when you ask, ask about everything still undecided in one question" | 73/80 | 6 | 4 | 4 | "end the talk in 30" 3, 3 others |

The replies were the target: S2 8/8, S1 and S3 6/8, the base 4/8. Four runs is still few;
"the slide where the room asks questions" went to another slide in S1 and S2 only (a title
reading, not a reply — likely noise).

## 2026-09-29 — four small fixes (`LYCEUM_PART=tide`)

What changed: the times paragraph reads "nothing in the conversation saying which" (was
"in the words" — a reply read alone lost the earlier turn); lyceum's line gains "A timer
asked for on its own notifies the person when it is up."; `notify`'s description gains "It
sends nothing anywhere else — no email, no message."; and one SPEC change — "Put the
register up at 21:00" expects a question (a time of day alone says neither which day nor
whether it repeats). **32/38**, 2 runs.

- Asked about 9/10 (the four 8/8; "at 21:00" 1/2 — once written for today). Timers 10/10;
  once vs every day 4/4; "tomorrow at nine in the morning" 2/2.
- NEW: "End the talk in 30 minutes" → a 30-minute timer that NOTIFIES, 2/2 (was the closing
  slide). It started with the line about a timer asked for on its own. Whether a
  notification is a fair reading of "end the talk" is a spec question — the probe expects
  the closing slide, which is itself read from the slide titles.
- "Email me in ten minutes" → a notification once (1/2), despite "sends nothing anywhere
  else".
- Replies 2/4: "In the evening" → EVERY day at 20:00 once; "Tonight, just once" → "What time
  tonight?" once.

## 2026-09-29 — steered in words: one paragraph on times (`LYCEUM_PART=tide`)

What changed, and nothing else: tide's reflex agent prompt gained one paragraph on how
people say times — *"a time of day that could fall in the morning or the evening, with
nothing in the words saying which, is two different times — ask which. A request that
names a day, a date or a length of time from now happens once; one that says it repeats,
repeats; one that names only a time of day could be either — ask which. Never write a time
that has already passed."* (reviewed against the package rule; its first draft's examples
were the probes' shapes with the numbers changed, and went). Lyceum hands the agent one
line of its own beside the deck: only the clock can set an automation off here. The
question's description was cut back to the rule. Same probes, not rewritten: **33/38**
over 2 runs (26 before the conversation, 29 after it).

- Asked about **8/8** — "Do you mean 08:00 or 20:00?", "Do you mean 09:45 or 21:45?",
  "When should the talk end?" (it no longer writes a trigger lyceum cannot fire).
- Timers **9/10**, refusal **2/2**, once vs every day **4/4**.
- Misses:
  - "Put the register up at 21:00" asked "today, or tomorrow night?" once (1/2). By the
    new paragraph a bare time of day "could be either" — the probe, written before the
    paragraph, says it is clear. A SPEC question, not settled here.
  - The replies **2/4**: "at eight" / "In the evening" → "What exact time in the evening?"
    once; "at nine" / "Tonight, just once" → "What time tonight?" 2/2 — the earlier
    number is lost once the reply names a part of the day. (The probe replays no reasoning
    with the earlier question; in lyceum the turn now keeps it.)
  - "Set a timer for 3 minutes" refused once — "neither can set a timer".
- A trial of the paragraph's first draft on the same probes, before any code change,
  asked 7/8 and over-asked none of the clear four.

## 2026-09-29 — the reflex agent answers, asks, or refuses (`LYCEUM_PART=tide`)

What changed before this run: the agent's answer is ONE of three shapes — a draft, a
`{ question }`, a `{ refused }` (tide's `ReflexAnswerSchema`; lyceum's own `cannotSatisfy`
tool is gone); every trigger kind and both clocks carry a description ("repeats … only for
a request that says it repeats; one that might mean either is a question"); effects carry
a `description`, and `timer.ring` became `notify` (a message in the live shell of whoever
saved the automation, only if they are connected). The SPEC changed with it, so four
expectations changed — each marked in `model-check.ts` — and probes were added BEFORE the
run: two that must NOT be asked about, once against every day, and two replies to a question.

- **Replies as a field** (`exchange: [{ request, question }]` beside the new words): the
  agent asked the SAME question again, 4/4 — it read the earlier request as the request and
  the reply as noise. Its own reasoning: *"ambiguous between morning and evening, so we must
  ask."*
- **Replies as the conversation** (`reflexConversation`: the request, the question as its
  own earlier answer, the reply — the turns of a chat, which cortex passes through as they
  are): **29/38** over 2 runs.
  - Replies **4/4** — "Put the register up at eight" / "In the evening" → 20:00 once.
    One of them wrote the evening as a TIMER of 1 h 55 min — right only because this check
    anchors at the moment of writing; saved later, it would fire late.
  - Words that decide: timers **10/10**; must-not-ask **4/4**; once vs every day **3/4** —
    "Today at 21:00, remind me to stretch" was once a 2-hour TIMER (21:05).
  - Refusal ("Email me in ten minutes") **2/2**.
  - The four that must be ASKED about: **0/8.** "at eight" → every day at 08:00, 2/2;
    "quarter to ten" → once at 21:45, 2/2; "drink water at nine" → every day at 09:00, 2/2;
    "End the talk" → a trigger that is not a clock at all (lyceum runs only clocks), 2/2.
    (The run before the conversation change asked about "drink water at nine" 2/2 and
    nothing else.)
  - Not tuned. Open: the descriptions alone do not make it ask; it is offered trigger
    kinds lyceum cannot run; it writes a time of day as a timer.

## 2026-09-29 — two measurements below are VOID, and what replaced them

**The leak.** Tide's reflex agent prompt carried lyceum's own probe as its lesson: *"'in 30
minutes' from now '2026-09-27T19:05' is a one-shot clock at '2026-09-27T19:35'"* — the talk's
opening sentence, worked out against this check's fixed clock. Vex's query agent carried a
rule written after "How many people arrived after me?" failed, quoting it. Both were in
PACKAGE prompts, which serve every app (`/STYLE_GUIDE.md`, "Package prompts serve every app",
written the same day because of this). So two numbers below are void, kept as they were
so the mistake stays readable: the reflex agent's **13/16** (2026-09-27) and "after me"'s
**2/2**. Both leaks are gone; the package edits were reviewed by a subagent against the
new rule before they landed.

- **Tide, clean prompt, old grammar** (the leak removed and nothing else; same eight
  probes, 2 runs): **11/16**. "End the talk in 30 minutes" 2/2 without its answer in the
  prompt. Misses: "at eight" at 19:05 → 08:00 (2/2, as before); "End the talk" with no time
  scheduled for now (2/2, not refused); "the slide where the room asks questions" → the
  closing slide once.
- **Tide, the draft grammar** (a timer is a length, anchored at Save to the second;
  `timer.ring` offered beside `deck.show`; the worked example replaced by a neutral weekly
  one after the review; five timer probes ADDED before the run, the eight kept): **16/26**.
  - The five timer probes **10/10**, each written as a `timer` ("a 90 second timer" →
    `{ minutes: 1, seconds: 30 }`), never as clock arithmetic.
  - The eight kept: **6/16**, down from 11/16. Three new kinds of miss:
    - "End the talk in 30 minutes" and "Go back to the title slide in 5 minutes" were each
      REFUSED once — "requires a delayed timer effect". The effect is named `timer.ring`,
      and the model read the effect list for the delay instead of the trigger.
    - "At quarter to ten, wrap it up" → a DAILY clock at 09:45, 2/2 (21:45 2/2 before).
      "At eight" is daily at 08:00 as well. What changed: the only worked example used to be
      a one-shot at a time of day ("remind the team at five" → today 17:00); it is now a
      weekly recurring clock.
    - "Remind me to drink water at nine" → a daily `timer.ring` at 09:00, 2/2 — before, no
      offered effect could remind. The probe still expects a refusal; not rewritten.
  - Not fixed yet. Each has a candidate fix in the grammar or the host's vocabulary, and
    none has been tried.
- **Vex, "after me" out of the prompt** (the technique stated once, generally, on the DSL's
  subquery source: joined by key, or paired with every row): **13/16**, 1 run. "How many
  people arrived after me?" → 39, right. Misses as known: "Which department is the
  biggest?" (step limit), "each department" counts once (an invalid field path), "who can
  sign in as the speaker?" answered `[]` instead of refused.

## 2026-09-27 — the model check (`pnpm models`)

Vex's query agent + shape mapper against lyceum's schema, a seeded room of 40, a member's
policy, one generation per question (`src/dev/model-check.ts`).

- **Groq, this org: 250k tokens per minute per model.** Four qwen generations at once hit it.
- **gpt-oss-120b caches the prompt prefix on Groq; qwen 3.8 27b does not.** A repeat of
  the same ~5.9k-token request came back 5,632 tokens cached, prompt time 1.1 s → 0.03 s,
  and barely moved the rate budget. Qwen pays every call in full. Every generation starts
  with the same instructions, schema and DSL spec, so on 120b the room shares that prefix.
- **Qwen takes a tool's parameter schema as the whole contract** for its arguments, and
  does not look the argument's shape up in the system prompt; 120b does. `testQuery`
  declared an empty object, so qwen sent `{}` until the step limit (0/10, ~150k tokens a
  question); declaring `from` and `fields`, it wrote only those. Vex's `testQuery` now
  declares every top-level DSL key, shallow (Groq refuses the full recursive DSL schema as
  tool parameters — 400), and qwen at reasoning `none` answers 30/36. Merging the system
  messages into one, and a `respond` tool, changed nothing.
- **The reflex agent writing timers** (`LYCEUM_PART=tide pnpm models`), from a fixed 19:05
  in Vienna, given the deck as facts (ids, numbers, titles) and an effect that says only
  what it does. The first measurement (12/12) was not honest: the effect's description
  said "the talk ends on the last one", and every probe but one ended the talk. Probes
  rewritten BEFORE the next run — slides by title, requests to refuse, a request with no
  time: **13/16**. "End the talk in 30 minutes" 2/2 from the titles alone; slides by
  title 4/4; "email me…", "remind me to drink water…" refused 4/4. Misses: "put the
  register up at eight" at 19:05 → 08:00 TOMORROW, 0/2; "end the talk" with no time
  refused 1/2 (the other run scheduled it for now — arguably a reading, not an error).
- **The one assistant, live** (`pnpm probe:assistant`), four people, probes written
  first: **16/16** on what was PROPOSED — a question answered, Forms offered its rename
  pre-filled, Records asking the same offered nothing, the speaker's "end the talk"
  written as a timer, a member's "end the talk" and the speaker's question (no `ask`
  tool) and a reminder no effect can do all given nothing. The REPLY TEXT is not held to
  that yet: once the speaker's assistant, with no tool for it, answered "who is in the
  room?" with an invention; its timer reply says "recorded" of what is only proposed.
- **The one assistant, screen aware** (`pnpm probe:assistant 2`, one probe added BEFORE
  the run: the speaker's "What slide is on screen right now?" must name the slide in the
  reply): **15/18**. The screen 2/2 ("The current slide on screen is slide.title – 'The
  talk is an application'"). Misses, all one kind: a question the `ask` should answer
  given an `open` button instead — Forms' "Which department has the most people?" 0/2,
  the waiting member's "How many people are in the room?" 1/2. Not tuned: a routing
  quality problem, to be fixed in the tools' contract, not by naming these sentences.
- **The one assistant, one way to each thing** (2026-09-27, after `ask` became `query`,
  its result opening over the screen, and `open` no longer offering the query desk to
  whoever holds `query`; same nine probes, `query` read off the overlay; prompt text
  otherwise untouched): **16/18**, plus a separate 1-run pass at 9/9. Misroutes to a
  button: **0 of 27 turns** (were 3 of 18) — the structural fix, measured. Both misses
  are Forms' "Which department has the most people?": run 1 the query GENERATION failed
  (vex's query agent hit its 20-step limit) and the reply called that "not authorized";
  run 2 the model refused without querying, citing the failed turn in its conversation.
  Reply text is still unheld: "Okay, we'll wrap up in 30 minutes" (a member with no
  automate tool — a promise it cannot keep), "Automation request recorded" (only
  proposed), "Press the button…" after a result opened by itself (seen in the browser).
  Steering, next. The probe hangs on exit after printing its total at 2 runs (not at 1).
- **The one assistant, one prompt** (2026-09-28: the query desk gone — vex queries only
  through the assistant, opened as what they are; one system prompt for behaviour,
  per-person facts as knowledge; the screen as the text kit draws it; tool results as
  facts; same nine probes): first run **17/18** — the speaker's timer reply said "has been
  saved" of a tool result reading `saved: false`, and the next run repeated its own false
  line from the conversation instead of calling the tool. The result now says "NOT saved
  and NOT running": **18/18**, and that reply reads "created but is not yet saved or
  running". Replies now report, not narrate: "There are 3 people in the room" (from the
  query), "Slide 1 – 'The talk is an application' is on screen" and, for the speaker with
  no query tool, "There are three people in the room" read off the controller's own screen.
  Still weak: Forms' "which department has the most people?" opened its query and replied
  "I don't have that information right now" both runs — the generated query's rows vary
  (a replay of the same intent returned `[{Forms, 1}]` and a right answer); the room is a
  three-way tie, which "the most" does not survive. Before the table comments (migration
  10), "who is in the room?" was REFUSED by the query writer: "schema does not have
  information about room occupancy".
- **Jev routing the ask** (`LYCEUM_PART=route pnpm models`): 16 probes against six
  earlier questions — paraphrases that must replay, the same words about another subject
  that must not, new questions whose shape is the test. **48/48** over three runs, ~250 ms
  a decision. Two things made it so, both structural: the earlier questions go in the
  STATE, the options only name them (written into the option text, Jev chose "new" at
  0.94 even for the identical question); and a replay must agree with the shape Jev picks
  for the new question ("How many people are in Archive?" matched the per-department
  counts at 0.73 — they contain the answer, but it wants one number).
- **Questions about the asker** ("what's my name?", "which department am I in?", "how
  many people arrived after me?"): refused until vex could say who "me" is; now the
  generating engine gets lyceum's behaviors (`members.member_id`, `asks.member_id` ←
  `userId`) and the agent writes them against `{ $scope: 'userId' }`. On 120b, 2/2 each,
  with the right answers for the asking member; "after me" needs the caller's row as an
  aliased subquery source — the DSL could always express it (proved), the agent was told
  how.
- **Three rounds of twelve questions:** qwen 27b (`none`) 30/36, 2–30 s, 14–117k tokens;
  gpt-oss-120b (`low`) 30/36, 0.4–9 s, 6–85k tokens. Vex skips the mapping agent for rows
  that already are a flat shape. Both struggle with "which department is the biggest"
  (aggregate + sort + limit into an array shape). Qwen spends more calls (it re-fetches
  the schema it already has) and pays each in full.
