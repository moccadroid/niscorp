# Encore — the scenarios

One demo, about four minutes, six scenes. Each scene names what **Jev** does in ~300 ms,
what the **agent** (120b) does in ~2 s, what the operator does, and what has to exist
that does not yet. Scenes are ordered so each one needs the mechanics of the one before.

The thing being shown, every time: **two models, two clocks, one screen** — and the
operator presses every button.

## First: the answer is not a chat

The thread-as-log is the weakest surface in the room. It reads like a chatbot bolted onto
an ops console, the newest answer sits *below* its own status line, and the words and the
cards beside them do not know about each other. Replace it:

- **The answer is a briefing, and every sentence cites its card.** The agent's reply is
  `response` plus `claims: [{ text, card, row? }]` — spans of the answer that point at a
  card on screen (and optionally a row in it). Hover or arrow through the answer and the
  card it came from lights; hover a card and its sentence lights. A sentence with no card
  to stand on is visibly unsupported. The words and the room become one object.
- **The current exchange is the surface; the thread is a rail.** Question and streaming
  answer are large, directly under the line. Earlier turns collapse to one-line entries on
  a thin rail — including the turns Jev handled alone ("moved Nova Kestrel → The Tent,
  21:00"), which is what makes the rail a log of the *shift*, not of a chat.
- **Follow-ups are chips.** The agent proposes up to three next sentences; pressing one
  types it into the line (so Jev routes it like anything else). Jev ranks them.
- **"Done" is not a status.** The status line says what happened in the operator's terms:
  "read the running order and the weather · 2.1 s".

## Scene 1 — The storm (the hero scene)

> `storm at 9`

- **Jev, 300 ms:** tone → elevated, the frame goes amber. Radar aimed at 21:00. Running
  order for the evening with **every exposed set lit** (open-air stage, 20:00–23:00).
  Route: `ask` — it is a statement of a problem, not a command.
- **Agent, 2 s:** "Three sets are exposed. Nova Kestrel is the one that matters: Main
  Stage, 21:30, 22,000 expected. The Tent is covered but holds 6,000 and Velvet Arcade has
  it until 22:30." Each sentence cites its card. Follow-up chips: *what are our options* ·
  *who needs to know* · *how full is the arena*.
- **New:** `exposure` on the running order (a computed flag per slot from stage cover ×
  weather window); an **impact card** (`move.impact`: capacity vs expected draw, clashes on
  the target stage, changeover time) that both models can aim.

> `what are our options`  ← a follow-up; Jev alone recognises nothing

- **Jev:** mounts nothing → computed fallback → agent.
- **Agent:** a plan of three steps, each a prefilled form: delay Nova Kestrel 45 min ·
  move Velvet Arcade to The Grove · push to attendees. The impact card sits beside each
  step and turns red where a step does not fit (Grove: 4,000 for a 22,000 draw).
- **Operator:** presses a step, reviews the form, presses **the button**. The write lands;
  every card reading that table reloads; the rail records it; the plan ticks 1 of 3.

## Scene 2 — Say it once

> `move the headliner to the tent at 9 and tell everyone`

- **Jev:** two intents in one sentence — a `noul` per `do` action, not one `choice`. Both
  forms mount in `doing`, aimed.
- **Agent:** writes the push body **from the other form**: "Nova Kestrel moves to The Tent,
  21:00." Change the time in the swap form and the draft follows — unless the operator has
  touched the message, in which case it never does.
- **New:** cross-card authored fields (the writer is told what the sibling forms hold).

## Scene 3 — Change your mind mid-sentence

> `move headliner to the tent` … `no, the grove`

- **Jev:** the to-stage field flips from The Tent to The Grove **in place** — no remount,
  no flicker, the rest of the form untouched. The impact card goes red.
- **Agent:** does not run. This is the scene that shows what 300 ms is *for*.
- **New:** nothing but a correction-aware `none` wording; `reconcileCanvas` already writes
  in place.

## Scene 4 — The room watches the festival

Nobody types. A **director** plays Saturday evening at 60×: the clock advances, the storm
cell moves in, gate scans arrive, the Food Court climbs 91% → 96%, a scanner at West Gate
goes down.

- **Jev, per event:** the same pass, with the *event* as the state instead of a sentence —
  which card belongs on screen, how urgent, who should be told. At ~$0.0001 and 300 ms a
  decision, **every event in the festival gets triaged**. Most answer "nothing"; the ones
  that matter raise a card in a new `attention` canvas and move the tone.
- **Agent:** one line on the card worth a line: "Food Court is at 96% and West Gate's
  scanner is down — the queue has nowhere to go." It runs only for events Jev scores
  critical.
- **Operator:** can type at any moment; the sentence and the event stream share the room.
- **New:** moss `reactions` → the event pass; an `attention` canvas with dismissal (a
  dismissal is a label); the director script; a clock that moves.

## Scene 5 — Same sentence, different person

Two windows side by side: the operator and the vendor liaison, both typing `storm at 9
move the headliner to the tent`.

- **Operator:** the room from scene 1.
- **Liaison:** no swap form — not disabled, **absent**: the action is not in their catalog,
  so Jev was never asked about it and the agent was never offered it. The agent says so
  and drafts what they *can* do: a note to ops and a vendor warning.
- **New:** nothing. This is the charter doing what it already does; the scene is the proof.

## Scene 6 — X-ray

Hold a key and the room shows how it decided: on every card, the question Jev was asked
and its probability; across the top, the budget of the last pass — parse 0.3 · rows 9 ·
**Jev 320** · render 4 — and of the last run. One sentence, 33 questions, $0.0001.

- **New:** an overlay arrangement swapped with `shell.setLayout`; the data already exists
  in the trace.

## Under everything (not scenes, but felt)

- **The frame rearranges.** One more `choice`: `calm` · `focus` · `analysis` · `warroom`.
  "storm" opens the war room (map large, running order wide); "how were the bars on
  friday" opens analysis (charts lead). `shell.setLayout`, authored arrangements, no
  generated layout.
- **Speculative mounts.** A card Jev rates 0.55–0.80 mounts on the hidden `warm` canvas so
  its reads are done; if it crosses the line it appears instantly.
- **Voice.** Interim speech transcripts are keystrokes. Hold space, talk, and the room
  assembles while you speak. One renderer primitive.
- **Two passes in flight** on two warm sockets, so the room trails typing by a constant
  300 ms instead of stuttering.

## Order of work

1. The answer surface (citations, rail, follow-up chips) — it is in every scene.
2. The cards the scenes stand on: `move.impact`, exposure on the running order,
   `situation.now`, `incident.feed`, and the rest of PLAN.md's roster.
3. Scene 1 and 2 end to end, on the real providers.
4. The director, the event pass and the `attention` canvas (scene 4) — the biggest single
   piece and the one people will remember.
5. Arrangements, x-ray, speculative mounts, voice.
6. Scene 5 needs no code; rehearse it.
