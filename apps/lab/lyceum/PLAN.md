# Lyceum — the plan

Lyceum is the application a technical talk about nisc runs on: the slides, the projector,
the speaker's controller, the audience's phones and terminals. The talk comes first; lyceum
is the live proof beside it. At the close the speaker points at this folder: everything
the room saw was running here.

## Status — 2026-09-27

Rewritten 2026-09-27. The talk is no longer a feature tour inside a story (the "Ministry"
skin is kept only as the room's furniture: ID cards and departments). It is a technical
talk about an architecture, told in the order nisc was built, with lyceum showing each
piece running. What is built stays below; what the talk needs is under "To build".

## The talk

**The claim.** Code lives in five places — renderer primitives, endpoints, setup,
authored data, checks. Everything else is a document in a closed grammar, validated by a
schema and executed by a runtime. That is the architecture to build when models write and
operate software: a model given a narrow problem, a precise grammar and the right context
writes documents that a program can check, store, replay and migrate — and a small, fast,
open model is enough to do it.

**The order is the history.** Each package came from the same move — take something that
is normally code, give it a grammar, let a runtime run it — and each proved the move in
one more domain. About 40 minutes:

| # | Section | What is said | What the room sees in lyceum |
|---|---|---|---|
| 0 | The timer (3) | nothing yet | The speaker, screen shared, asks their assistant for a 30-minute timer that closes the talk. It answers with a tide reflex document and a Save button; the speaker reads it and saves. The controller's countdown is that reflex's due time. |
| 1 | Nova (7) | GPT-3 could fill a schema, not write React. An action: data, endpoints, triggers, a layout. The server holds the shell; events go up, trees come down; the core is surface-blind. | Everyone joins (door, ID card). One real action file. The speaker switches the room from the poster kit to plain HTML and back — laptops check the DOM and the socket. `ssh` into the same app from a terminal. |
| 2 | Prism (3) | If everything is data, data-to-data transforms are the core operation. Written by models, checked by schemas, no code strings. | One real transform. |
| 3 | Models (5) | signal, cortex, solid. nova, prism and vex each ship an agent preloaded with their own grammar. Everything here runs on qwen 27b with reasoning off; routing on Jev, smaller still. | The ID cards streaming in (solid). |
| 4 | Vex (6) | Intent + shape → a DSL, never SQL → compiled under a scope policy the model never sees → a mapping into the shape → cached under a fingerprint, replayed forever. Joins and complex queries are talked about; the demo schema stays simple. | Everybody asks the records their own question. Jev routes each question to an existing fingerprint or to generation and picks its shape; the projector counts replayed vs generated. |
| 5 | Moss + charter (6) | One durable shell per principal, the socket. The charter is policy as a document that compiles into two enforcement points: which actions exist in a shell, and the scope policy on every query. | Departments are assigned; neighbours compare phones; the projector shows the charter beside two resolved catalogs. |
| 6 | The assistant (5) | Anything can go into an agent's context, because it is all data: the screen as a tree, the catalog, each action's input schema. It never acts: it proposes a pre-filled action and the person presses OK. It can only offer what exists for you. | Everybody's assistant on their phone. |
| 7 | Tide (3) | Back to the timer. A reflex is a row, a fact is a row. A skill-based agent re-reads its instructions on every run and burns tokens to find out there is nothing to do; an agent with grammars writes the automation once and it runs without a model. | The reflex, again. |
| 8 | Strata (3) | What happens to data in your database when nisc changes: ledgered sequences for tables, grammar migrations for documents — safe because what is migrated is data. | lyceum's own kit grammar migration in the repo. |
| 9 | Close (2) | The five places; the folder. | The reflex fires and the deck moves to the last slide on its own. |

The text of each slide is written with the speaker; the list in `src/db/seed.ts` is a
first draft to iterate on.

## To build

In order; each lands with its check.

1. **The model check** — `pnpm models` (built 2026-09-27; results under "Measured"). Vex's
   seams are measured; each new seam (the tide agent, Jev's routing, the assistant) joins
   it as it is built. A seam that does not pass is fixed in its grammar's descriptions or
   its tool contract, not by a bigger model.
2. **Tide agent** — `@niscorp/tide/agent`, built like `@niscorp/prism/agent`: a cortex
   agent whose output is tide's reflex schema, validated in the loop; inputs are the
   intent, the host's effects (names + input schemas), fact kinds and the timezone.
3. ~~**The ask**~~ — built 2026-09-27 (see "What is built"). Not yet: parameterised
   replays (Jev choosing a fingerprint's context values), the ask on the controller.
4. **The assistant** — Midas's rulings (`midas/docs/assistant-structure.md`): the thread
   is a nova action, the turn runs on the server, replies stream over the shell wire; the
   charter is the only gate; it never calls anything, it proposes pre-filled actions.
   Context: the screen's tree (`reflect`), the principal's catalog with each action's
   `input`. The opening timer runs through the speaker's own assistant.
5. **The timer** — the reflex saved from the assistant's proposal; the countdown on the
   controller; the effect is one vex write moving the deck to the closing slide.
6. **The look switch**, inside lyceum, moss untouched: a `room` row holds the look
   (`poster` | `plain`); a small action granted to everybody reads it reactively and
   renders a `Look` marker; lyceum's DOM target wraps two kits and paints with the one
   the marker names. A plain-HTML kit implements `lyceum.kit` with unstyled semantic
   HTML. The speaker's controller writes the row.
7. **The SSH door** — an SSH server in lyceum's process (`ssh2`), any user, no auth; each
   connection opens its own moss client wire to the local socket and is a stranger at
   the door; moss's ink target draws it with an ink kit for lyceum's components (relay's
   ink terminal is the reference). The VPS's admin SSH moves off port 22 so the room types
   `ssh lyceum.moccadroid.com`.
8. **More actions per department**, so four clearances show four visibly different phones.
9. **The slides**, for all of the above.
10. **The full-room rehearsal** — 100 headless phones against the deployed shape, every
    phone asking the records and its assistant at once; Groq's per-model token limit is
    shared by every seam.

## What is built

**The room.**
- **The door.** Anyone opening the address gets the door; "Step in" mints a real session
  for a fresh principal, who then writes their own member row as themselves (`public` may
  insert a member only with the engine stamping `member_id` from their `userId` —
  `src/app/vex/behaviors.ts`).
- **The ID card.** Qwen on Groq (signal `stepStream`) writes `{ name, title, quirk }`;
  solid parses the stream into an always-valid partial card, written to the member's row
  as it grows by the `registry` principal. The phone and the projector's register are
  reactive reads, so the card types itself in everywhere at once. The stream is replayed
  at a reading pace (~1.5 s) — said so in code and on stage. `LYCEUM_ISSUER=groq|fake`;
  the checks always use the fake.
- **Assignment.** The speaker assigns everybody waiting to the emptiest department — one
  write per person, as the speaker over their own session, then `invalidateIdentity`:
  the phone changes department without reconnecting.
- **The way in.** The first slide shows a QR code and the address in words; the
  projector's strip shows the address on every slide. The address is the deployment's
  (`PUBLIC_URL`), handed out by the `room.address` server function.

**The ask** (`ask.desk`, every member's; `server/functions/ask.functions.ts`,
`server/asking.ts`). A question typed in your own words. `ask.route` — a function, for
the two things that cannot be data: a model's choice and a generation — reads what was
asked before (as you), and Jev decides in one call whether an earlier question asks for
the same information and which authored shape the answer takes
(`app/actions/ask/ask.shapes.ts`: a list, one number, counts per group, people). A match
whose stored shape agrees is REPLAYED; anything else is GENERATED by vex's agents on
gpt-oss-120b under your policy, against the same cache moss replays from; a generation
the model or the engine refuses is REFUSED. The function records the ask as you
(`asks`, migration 3) and returns the fingerprint and how to show it; the phone then
replays the fingerprint through vex itself — the answer never comes from a function.
The projector's `slide.ask` counts replayed / generated / refused (a reactive read);
the questions never go on the wall. `LYCEUM_ASK=live|fake`; the checks use the fake,
which writes real DSL so the engine, the policy and the replay are the real ones.

**The deck.** Slides are actions only the stage is granted; their order is rows
(`slides`); the slide on screen is one row (`deck`). The stage's `stage.deck` mounts the
slide the row names — on mount and on `deck-moved`, the one reaction left
(`src/server/reactions.ts`): mounting a new slide is navigation, which no data update can
do. Everything that only displays the deck is a reactive read.

**The controller** (`speaker.console`) — four canvases in its own layout: **head** (the
room, the slide on screen), **tools** (a list canvas the deck reconciles to the slide's
`slide_tools`), **notes** (`slide_notes`), **controls** (All slides, Back, Next). On a
phone it narrows to a remote: head, tools, controls.

**The look — "the poster"** (`src/ui/`, the only renderer code). A screen is a `Sheet`, a
ruled grid whose areas are named in the layout; everything on it is a `Cell` with an ink
or a mark. Four colours with jobs: `signal` (blue) the fact that matters, `alert` (orange)
what to do next, `live` (green) a number that changes on its own, `highlight` (yellow)
hover and what the eye should find. "Not yet" is the hatch. Type: Unbounded, Space
Grotesk, Space Mono. Posters scale with their sheet; reading text has a floor in rem.
Components are configured, never styled (AGENTS.md rule 2). The kitchen sink is
`kit.sink` — `/dev/as/kit`.

**Versions (strata).** Lyceum's tables are the `lyceum.app` sequence. The source is
locked at `nisc.nova` 1, `nisc.prism` 1 (`strata.lock.json`); the kit's props are the
grammar `lyceum.kit` (`src/ui/kit.props.ts`, `src/app/grammars.ts`), at 1 — `kit-check`
refuses a kit change the sequence does not record.

**Deployed** at lyceum.moccadroid.com. `docker compose up --build -d`: the app and its
Postgres, one process, one port (8796): moss, the one-time sign-in (`/login`), the built
terminal. The speaker asks for a link at `/speaker`, mailed through Resend to
`LYCEUM_SPEAKER_EMAIL` (`pnpm mint speaker` is the fallback); `/stage` gives any device a
stage session. Authored rows converge on every boot; the talk's state is left alone. The
vex cache is tiered: loaded into memory at boot, writes land in Postgres.

**Dev.** `pnpm dev` (port 5197) keeps one in-memory database for its run and lends it to
every re-boot. `/dev/as/speaker`, `/dev/as/stage`, `/dev/as/kit`, `/dev/new`,
`?seat=<name>`. Vite listens on this machine only.

**Checks** (`pnpm check`, each in its own process over its own database): `kit-check`,
`tables-check`, `assignment-check`, `deck-check`, `serve-check`, `ask-check`. The ask
check also passes live (`LYCEUM_ASK=live node --env-file=.env --import tsx
src/dev/ask-check.ts`).

## Decision points

| # | Decision | Tier | Answer |
|---|---|---|---|
| D1 | Posture | answered | Moss server app on a VPS. If hosting fails there is no talk. |
| D2 | Environment | answered | Postgres in Docker beside the app; vex's tiered cache; moss's `sessions` credential. The speaker signs in by a mailed link, the stage at `/stage`. Dev (derived): one in-memory PGlite per `pnpm dev`; each check a fresh one. |
| D3 | Reads | answered | Vex entries, locked, for everything the app itself reads; reactive where a screen follows the room. **Everybody** also gets a generative path — the ask — under their own policy (answered 2026-09-27). |
| D4 | Writes | derived | Vex mutation entries, fired by a click or made by a server function as the principal it acts for. |
| D5 | Routing | derived | None. The talk's state is a row (`deck`), not a URL. |

## Decided 2026-09-27

- **Models** (revised 2026-09-27, after the model check below). The agent seams — vex's
  query agent and mapper, the tide agent, the assistant — run on `openai/gpt-oss-120b` on
  Groq at reasoning `low`: as accurate as qwen 27b on the ask (30/36 each), several times
  faster, and Groq caches its prompt prefix, so a room's generations share it. The ID
  cards stay on qwen 27b (one streamed call; the join burst stays out of 120b's budget).
  Routing — which fingerprint answers a question, which shape — is Jev (TypeSafe,
  `decide()`). The claim on stage: open models, sized to each job, with narrow problems
  and precise grammars.
- **The look switch stays inside lyceum.** Moss is not changed for it; its terminal's
  render target is client chrome, and lyceum's own target does the switching.
- **SSH** is the terminal door.
- **Vex for everybody**; other actions are gated per department to show the charter.
- **The speaker shares the controller's screen** at the start, so the room sees the
  timer being asked for and saved.

## Measured 2026-09-27 — the model check (`pnpm models`)

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

## Answered, and still holding

- **Audience.** Meetups and conference rooms, 50–100 people, software engineers who work
  with AI — a tough crowd. Nothing may assume a venue, a schedule or a speaker list.
- **The demo data is the room.** No fixture dataset.
- **The charter is written once and never edited live.** Every change on stage is a row,
  applied with `invalidateIdentity`.
- **Not in the talk:** inviting the room to attack the app, killing the provider live.
- **Fallbacks are configuration.** Every model seam can be reassigned.
- **Nothing is hardcoded.** The source is the proof, and it will be read.

## Principals and roles

| Principal | Roles | What exists for them |
|---|---|---|
| a stranger (browser or SSH) | `public` | the door |
| audience member | `unassigned`, then one of `records`, `forms`, `inquiries`, `archive` | the ID card, the ask, the assistant; after assignment, the department's badge and its own tools |
| `stage` (the projector) | `stage` | the slides, the strip, the register. No controls. |
| `speaker` (the controller) | `speaker` | the controller and its tools, All slides, the look switch |
| `registry` | `registry` | writes ID cards as the model writes them |
| `kit` | `kit` | the kitchen sink (dev) |
| machinery | `identity`, `gatekeeper` | a machinery role exists only where NO principal exists yet |

## The tables

| Table | Holds |
|---|---|
| `departments` | name, remit, mark, sigil |
| `members` | one per person: name, title, quirk (the ID card), department (null until assigned) |
| `asks` | every question put to the records: the asker, the words, the shape, how it was answered (replayed, generated, refused), the fingerprint |
| `slides`, `slide_tools`, `slide_notes` | the deck: order and titles, the controller's tools, the speaker's notes |
| `deck` | the talk's state: the slide on screen |
| `grants` | roles beyond a person's department, and the roles of the principals that are not people |
| `login_links` | one-time sign-in links (hashes only) |

## Vex is never hidden behind a function

Decided 2026-09-25. Actions talk to vex directly through their endpoints. A server
function exists only for what cannot be data: a model's choice, session lifecycle, an
outside call, the deployment's address. When a function touches data, it does so AS the
principal it acts for, over `session.wire`. `executeAs` is for surfaces with no principal.

## Reactive reads

Built 2026-09-26 (vex "Reactive reads", moss "A read that keeps answering", nova "Later
bodies"); lyceum is the first consumer. A reactive entry sorts, reads time from `$scope`,
and is a direct vex read. Channels remain for signals that are not data — the deck moving
on. Raw-SQL writes do not invalidate; the TTL (60 s) heals them.

## Risks

- **Scale is unmeasured** — To build, 10.
- **Groq's per-model token limit** is shared by every seam; the ask and the assistant
  for a whole room in one minute is the heaviest load of the talk. Jev routing to
  replays is the first relief; the rehearsal measures the rest.
- **The ask is a generative path for everyone.** A question like "show me the login
  links" will be typed; the refusal must be shown, not discovered.
- **Session tokens** in the websocket URL; **statement timeout** unset on the pool;
  **event flooding** per connection unconfirmed.
- **Projector content.** Anything a person wrote passes moderation before the projector.
