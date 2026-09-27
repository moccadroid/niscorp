# Lyceum — what was measured

What the models actually did against lyceum, measured before each seam's design was
settled. Not a plan: the choices these led to are recorded in `PLAN.md` ("Decided").
Probes are written before a run and not rewritten to pass.

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
