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
| 4 | Vex (6) | Intent + shape → a DSL, never SQL → compiled under a scope policy the model never sees → a mapping into the shape → cached under a fingerprint, replayed forever. Joins and complex queries are talked about; the demo schema stays simple. | Everybody queries the records in their own words. Jev routes each request to an existing fingerprint or to generation and picks its shape; the projector counts replayed vs generated. |
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
2. ~~**Tide agent**~~ — built 2026-09-27 (`createReflexAgent({ effects })`, see "What is built").
3. ~~**Vex queries**~~ — built 2026-09-27, run by the assistant (see "What is built"). Not
   yet: parameterised replays (Jev choosing a fingerprint's context values).
4. ~~**The assistant**~~ — built 2026-09-27, reworked twice the same day (see "What is
   built"). Not yet: streaming replies.
5. ~~**The timer**~~ — built 2026-09-27 (see "What is built").
6. ~~**The look switch**~~ — built 2026-09-27 (see "What is built", "Two looks").
7. ~~**The SSH door**~~ — built 2026-09-27 (see "What is built"). Not yet on the server:
   the VPS's own sshd moves off port 22, then `SSH_PORT=22` in the compose file.
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

**The phone** (`member.phone`, the controller's pattern — one action whose layout places
canvases). Three regions, and only the middle one scrolls: `self`, the ID card as one
line (name, department or "Waiting"); `body`, one thing at a time; `tabs`, a bar of one
tab per thing the person HOLDS. The bar is not authored per department: `member.phone`
lists every candidate (the card, the four tools, Q&A, the assistant) and nova's `reconcile` places
each, skipping what the shell does not hold — ring 1 made visible, and a neighbour's bar
differs because their charter does. Each of those actions renders itself as a tab when
loaded with `{ tab: true }` (`actions/shared/tab.layouts.ts`) and, pressed, resets the
body to its full self. Assignment rebuilds the shell, so the department's tool arrives
as a tab without a reload (`assignment-check`). The department badge is gone: the strip
and the card carry the department. The open tab is ink: the tabs agree among themselves over a payload-less
`tab-opened` channel, each taking its own `nextInk` (`shared/tab.layouts.ts`).

**Vex queries** — run by the assistant, never typed at (decided 2026-09-27: vex is not
something anybody talks to; a query is an INTENT and a SHAPE). The assistant's `query`
tool hands over an intent; `routeQuery` (`server/assistant/vex-query.ts`, over
`server/querying.ts`) does what cannot be data — a model's choice and a generation: it
reads the earlier intents (as the person), and Jev decides in one call whether one wants
the same information and which authored shape the result takes (`app/vex/query.shapes.ts`:
a list, one number, counts per group, people; each drawn by
`actions/shared/answer.layouts.ts`). A match whose stored shape agrees is REPLAYED;
anything else is GENERATED by vex's agents on gpt-oss-120b under the person's policy,
against the same cache moss replays from; a generation the writer or the engine refuses
is REFUSED, and the reason says which ("the records do not hold that: …" / "that reaches
records your clearance does not cover"). Every query is recorded as the person
(`queries`, migration 7 renamed it from `asks`). The query then OPENS over their screen
as what it is — `query.result`, in the sheet: its intent, its shape, its fingerprint,
its result (replayed through vex as them, never from a function), and whether it was
replayed or generated. Green (`live`). The query writer knows what the tables MEAN from
their comments (migration 10; vex now reads `COMMENT`s as descriptions — "members" did
not say "the people in the room", and "who is in the room?" was refused for it). The
projector's `slide.query` counts replayed / generated / refused (a reactive read); the
intents never go on the wall. `LYCEUM_QUERY=live|fake`; the checks use the fake, which
writes real DSL so the engine, the policy and the replay are real. Jev's own words still
say "question" — they are the measured contract (48/48).

**Q&A** (the `questions.desk` tab; `tools.questions` on the controller's last slide).
The tab places two actions on canvases of its own: the form (`questions.send`) and the
person's own questions (`questions.mine`), newest first — two and not one, so the
assistant can offer the form alone, pre-filled. A question pressed opens over the screen
(`questions.edit`): change its words, or delete it. A question is a row written as its
sender (`questions`, migration 8); a member reads, edits and deletes their OWN only (the
table's default behaviour), and the speaker reads everybody's (the speaker's `room`
reach — `scoping` on the role, every other table at its default). Replaying the
controller's read, a member gets their own and never anybody else's; nothing goes on the
projector. Orange. Enter sends and the field empties.

**The assistant** (`assistant.thread` — a tab on every phone, a tool on the controller's
first slide; `app/assistant/assistants.ts`, `server/assistant/`). One assistant, assembled
per person from DECLARATIONS, each applying to whoever holds its action: `room`
(`member.card`), one per department tool, `controller` (`speaker.console`). A declaration
says what a grant means about the person (`context` — a fact, never an instruction), what
to read as them (`grounding`), and which host tools they get. So the charter's grants
build it, and it says so at its top: "built from room · forms · it can query · open".
Declarations naming an action, a read or a tool that does not exist refuse to boot.

ONE PROMPT (`server/assistant/orchestrator.ts`), the same for everybody, says how it
behaves: answer from what you are given when it holds the answer; otherwise use the tool
that fits; report only what the sections or a tool result say; a refusal passes on its
reason. What differs per person is KNOWLEDGE, assembled each turn
(`assistant.functions.ts`): THE PERSON (their declarations' context, their grounding read
as them), NOW, ON THEIR SCREEN, THEIR ACTIONS, THE CONVERSATION SO FAR. Their screen is
the served tree moss sends their phone, drawn as words by lyceum's fourth kit
(`src/ui/text.kit.ts`) — only what is on it, only what the charter put there; their own
conversation is left out, its tab is not. Their actions are the charter's that declare an
`input` (rule 14: the openable contract), less the assistant itself; what can be pre-filled
is that input less how the phone draws an action (`tab`, `tabInk`, `strip`).

The host's three tools are the only code: `open` offers one of THEIR ACTIONS (an enum of
exactly those) as a button, pre-filled; `query` runs a vex query and opens it over the
screen at once (it changes nothing); `automate` (controller only) hands the request, with
the deck as facts, to tide's reflex agent — which can refuse. What CHANGES something
waits for a press. A tool's result is facts, never how the screen works — an automation's
is "NOT saved and NOT running", because "saved: false" was reported as "saved".

Every turn is a row (`assistant_turns`, migration 5; what it ran, migration 9) written as
the person; the screen shows the conversation — the last five turns, oldest first, each
with the vex queries it ran as buttons that open them again (replayed now), the input
under them — and the model is handed the same five. Acting on a proposal writes its
outcome ("Saved · fires at 18:56") and the proposal leaves the screen. Blue (`signal`);
Enter sends and the field empties. `assistant-check` and `query-check` assert it with the
deterministic stand-in; `pnpm probe:assistant` measures it live.

**The timer** — the talk's first minute and its last. On slide 1 the controller's tool is
the speaker's assistant: "Show the last slide in 30 minutes" is routed to `automate`, and
tide's reflex agent (`@niscorp/tide/agent`, gpt-oss-120b; `LYCEUM_TIMER=live|fake`) writes
a tide reflex DRAFT — shown as the document it is, to be read, its when in words ("30 min
after you save"). A draft's trigger may be a TIMER, a length (tide's sugar, never stored);
Save (`timers.save`, 2026-09-29) anchors it AT THE PRESS — the one thing that cannot be
data, the clock — to a one-shot clock to the second, rounded up, so reading time is never
taken off it; then it is the speaker's own vex write (`timers/save`, the reflex as a JSONB
row, `saved_by` stamped) over their session, and the saved timers are loaded into tide
(`server/timing.ts`: moss's durable store and driver, and at every boot as the `scheduler`
machinery role — a restart loads the same instant). Every timer runs as the `clock`
principal — stamped by the host whatever the document said. Two effects, each offered
with a `description`: `deck.show` replays `deck/show` over the clock's own session, so
the stage follows it like any other deck move; `notify` shows a message to whoever saved
the automation — moss's `shells.deliver` into their live shell, only if a terminal of
theirs is attached right then, never later; `speaker.head` hears it and opens
`speaker.notification` over the controller. Nothing is stored for it: tide's ledger
records what came of each run (`shown`, or why not). The clock holds `deck.write.update`,
nothing else. The writer is offered only clock and timer triggers (`DRAFT_HERE`: tide
builds the draft from the host's choice) and answers with a draft, a QUESTION (a request
that can be read two ways) or a refusal — each with its reasoning, which the proposal
shows ("How I read it"). The turn keeps the answer and the reasoning
(`assistant_turns.writer_answer`, `writer_reasoning`, migration 12), so a reply to a
question, or a correction of a draft not yet saved, goes back to the writer as the
conversation (`reflexConversation`). The controller's head counts down (`Countdown`, a kit
primitive ticking on the viewer's clock — `lyceum.kit` 2). Tide's tables are migrated with
lyceum's before the server starts: created later, they changed the schema under moss's
engine, which then evicted every generated query as stale (`LYCEUM_SEQUENCES`).
`timer-check` runs it end to end, restart included.

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

**Two looks, one tree** (`src/ui/plain.kit.ts`, `room.look`, `tools.look`). The room's
look is one row (`room`, migration 6; `poster` | `plain`, the closed set held by the
table's CHECK). `room.look` — granted to everybody, the door included — sits on a `look`
canvas and renders only a `Look` marker from a reactive read of that row; lyceum's DOM
target (`src/ui/target.ts`) reads the marker on every update and paints with the kit it
names — the poster and its stylesheet, or plain HTML with none. Both kits are typed
against the grammar (`Kit`, `src/ui/kit.props.ts`), so neither can lack a component. The
switch is the controller's tool on "Everything is data": one write, and every screen in
the room repaints — nothing is sent to switch, and the trees do not change. Moss is
untouched. `look-check` asserts the marker on four kinds of screen, the switch reaching
all of them, the phone's tree unchanged, and a word outside the set refused.

**The SSH door** (`src/server/ssh-door.ts`, `src/ui/ink.kit.ts`). `ssh` into the room:
any user name, no password, and you are a stranger at the door, as a phone that opens
the address is. The door is a TERMINAL HOST, not a second server: each connection opens
its own moss wire to the room's socket, and moss's ink target draws the same trees a
phone gets with a third kit — the grammar in a terminal (a sheet is a column of ruled
cells, an ink a coloured rule, everything pressable a typed `[n]`). Stepping in grants
that wire a session for as long as the connection lasts. The host key is made on first
start and kept (`LYCEUM_SSH_HOST_KEY`; a volume in the compose file). `pnpm serve` opens
it with `LYCEUM_SSH_PORT`; under `pnpm dev`, `pnpm ssh` opens it against the dev server
(`ssh -p 2222 localhost`). Two package fixes came out of it: ink's console patching can
be turned off (several targets in one process must not hand a visitor the server's
logs), and a typed number now reaches its own instance on a list canvas — before, every
phone tab printed `[1]` and every number opened the last tab. `ssh-check` drives it
with a real SSH client: in, stepped in, each tab by its number, Ctrl+C out.

**Versions (strata).** Lyceum's tables are the `lyceum.app` sequence. The source is
locked at `nisc.nova` 1, `nisc.prism` 1 (`strata.lock.json`); the kit's props are the
grammar `lyceum.kit` (`src/ui/kit.props.ts`, `src/app/grammars.ts`), at 3 — `kit-check`
refuses a kit change the sequence does not record.

**Deployed** at lyceum.moccadroid.com. `docker compose up --build -d`: the app and its
Postgres, one process, one port (8796): moss, the one-time sign-in (`/login`), the built
terminal. The speaker asks for a link at `/speaker` — a sign-in desk (`lectern.signin`),
the only thing that device's own principal holds — mailed through Resend to
`LYCEUM_SPEAKER_EMAIL` (`pnpm mint speaker` is the fallback); `/stage` gives any device a
stage session. The sign-ins draw no pages: each hands a session into a seat. `pnpm dev`
mounts the same ones. Authored rows converge on every boot; the talk's state is left alone. The
vex cache is tiered: loaded into memory at boot, writes land in Postgres.

**Dev.** `pnpm dev` (port 5197) keeps one in-memory database for its run and lends it to
every re-boot. `/dev/as/speaker`, `/dev/as/stage`, `/dev/as/kit`, `/dev/new`,
`?seat=<name>`. Vite listens on this machine only.

**Checks** (`pnpm check`, each in its own process over its own database):
`artifacts-check`, `kit-check`, `tables-check`, `assignment-check`, `deck-check`,
`serve-check`, `access-check`, `query-check`, `timer-check`, `assistant-check`,
`look-check`, `questions-check`, `ssh-check`. The query
check also passes live (`LYCEUM_QUERY=live node --env-file=.env --import tsx
src/dev/query-check.ts`).

## Decision points

| # | Decision | Tier | Answer |
|---|---|---|---|
| D1 | Posture | answered | Moss server app on a VPS. If hosting fails there is no talk. |
| D2 | Environment | answered | Postgres in Docker beside the app; vex's tiered cache; moss's `sessions` credential. The speaker signs in by a mailed link, the stage at `/stage`. Dev (derived): one in-memory PGlite per `pnpm dev`; each check a fresh one. |
| D3 | Reads | answered | Vex entries, locked, for everything the app itself reads; reactive where a screen follows the room. **Everybody** also gets a generative path — vex queries their assistant runs — under their own policy (answered 2026-09-27). |
| D4 | Writes | derived | Vex mutation entries, fired by a click or made by a server function as the principal it acts for. |
| D5 | Routing | derived | None. The talk's state is a row (`deck`), not a URL. |

## Decided 2026-09-27

- **Models** (revised 2026-09-27, after the model check — `MEASURED.md`). The agent seams — vex's
  query agent and mapper, the tide agent, the assistant — run on `openai/gpt-oss-120b` on
  Groq at reasoning `low`: as accurate as qwen 27b on generated queries (30/36 each), several times
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
- **One assistant, built per person by the charter** (answered 2026-09-27). The same
  `assistant` action on every device; what it knows and can do is assembled from
  DECLARATIONS (data: instructions, grounding reads, named tools, starters — the shape of
  moss's bundle `assistants`), each keyed to an action. A declaration applies to whoever
  holds its action, so the charter's grants select it — no new charter section, no
  second list. Grounding reads run as the person, under their policy. Tools are the only
  code: `open` (propose an action they hold, pre-filled), `query` (a vex query, opened over the screen),
  `automate` (the tide reflex agent, handed the deck as grounding; it can refuse). Only
  the controller gets `automate`. Replies in one piece for now; nothing runs without a
  press. Lyceum uses only machinery that exists — no package changes for this.

## Measured

What the models did against lyceum — the model check (`pnpm models`), the assistant
probe, Jev routing queries — is in `MEASURED.md`. The choices it led to are above.

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
| audience member | `unassigned`, then one of `records`, `forms`, `inquiries`, `archive` | the ID card, Q&A, the assistant; after assignment, the department's own tool. `forms` reaches at `personal`: its update on `members` is pinned to the caller's own row |
| `stage` (the projector) | `stage` | the slides, the strip, the register. No controls. |
| `speaker` (the controller) | `speaker` | the controller and its tools, All slides, the look switch |
| a device at `/speaker` | `lectern` | the speaker's sign-in desk, in the room's look, and nothing else; a principal per device |
| `registry` | `registry` | writes ID cards as the model writes them |
| `clock` | `clock` | what a saved timer runs as: it can put a slide on screen, nothing else |
| `kit` | `kit` | the kitchen sink (dev) |
| machinery | `identity`, `gatekeeper`, `scheduler` | a machinery role exists only where NO principal exists yet |

## The tables

| Table | Holds |
|---|---|
| `departments` | name, remit, mark, sigil |
| `members` | one per person: name, title, quirk (the ID card), department (null until assigned) |
| `queries` | every query run from words (was `asks`): who ran it, the request, the shape, how it was answered (replayed, generated, refused), the fingerprint |
| `questions` | the room's Q&A: a question for the speaker and its sender |
| `slides`, `slide_tools`, `slide_notes` | the deck: order and titles, the controller's tools, the speaker's notes |
| `deck` | the talk's state: the slide on screen |
| `room` | the room's state: the look every screen paints with |
| `grants` | roles beyond a person's department, and the roles of the principals that are not people |
| `login_links` | one-time sign-in links (hashes only) |
| `timers` | automations the speaker saved: each a tide reflex as a document, who saved it, when it fires |
| `assistant_turns` | one row per assistant turn: the message, the reply, its proposals and what came of them — each person's own |
| `tide_fact`, `tide_run`, `tide_work`, `tide_reflex_state` | tide's durable store (moss `TIDE_TABLES`), migrated with lyceum's before the server starts |

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
- **Groq's per-model token limit** is shared by every seam; the assistant and its queries
  for a whole room in one minute is the heaviest load of the talk. Jev routing to
  replays is the first relief; the rehearsal measures the rest.
- **Vex queries are a generative path for everyone.** A request like "show me the login
  links" will be typed; the refusal must be shown, not discovered.
- **Session tokens** in the websocket URL; **statement timeout** unset on the pool;
  **event flooding** per connection unconfirmed.
- **Projector content.** Anything a person wrote passes moderation before the projector.
