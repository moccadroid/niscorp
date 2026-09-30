# Lyceum — the plan

Lyceum is the application a technical talk about nisc runs on: the slides, the projector,
the speaker's controller, the audience's phones and terminals. The talk comes first; lyceum
is the live proof beside it. At the close the speaker points at this folder: everything
the room saw was running here.

## Status — 2026-09-30

Rewritten in place 2026-09-30. Since 2026-09-27 the room lost its furniture: no
departments, no ID cards, no model writing anybody a profile. A person chooses a name at
the door; their phone is that name and a list of the actions they hold. The room's Q&A
is Acme, somebody else's integration, installed on stage. One small decider (Jev) routes
queries and judges whether what a person wrote may be shown. Each surface is drawn by a
renderer of its own (DOM, React or Vue). The talk's argument and its history are in
`TALK.md`; the deck is `src/db/seed.ts`.

## The talk

**The claim.** Code lives in five places — renderer primitives, endpoints, setup,
authored data, checks. Everything else is a document in a closed grammar, validated by a
schema and executed by a runtime. That is the architecture to build when models write and
operate software: a model given a narrow problem, a precise grammar and the right context
writes documents that a program can check, store, replay and migrate — and a small, fast,
open model is enough to do it.

**The deck** is 30 slides in three parts (`src/db/seed.ts`, each with the speaker's
notes; the controller's tools per slide are rows):

| Part | Slides | What the room sees in lyceum |
|---|---|---|
| The opening | the title, the register, the timer, where nisc started, the problem, the answer, Nova, an action, the X-ray, the button, renderers, json-render, what a button does, where the state lives, is JSON enough | Everyone joins by choosing a name; the register fills. The speaker asks their assistant for a timer that closes the talk and saves it. The X-ray is given to every phone: the screen as the actions it is made of. The speaker switches each surface between DOM, React and Vue; the trees do not change. |
| The worst a model can write | the question, we tried to break it, three lines froze the server, review the result | Intake refusing a loop, and what the budgets stop. |
| The rest of nisc | Moss, the charter, checked in two places, Vex, asked in words, 18,000 cups, it prepares / you press, Tide, no agent loop, Strata, the end | Acme installed live: the broken bundle refused, Acme approved and on every phone, questions sent through it and judged before the speaker sees them. Everybody queries the records through their assistant. The timer fires and the deck moves to the last slide on its own. |

**Not built yet** — cues on the controller, drawn hatched, so the deck can be walked
with every missing beat visible (`src/app/actions/tools/cue.actions.ts`):
- `tools.button` (slide 10): three people get a button that plays a sound. Needs an
  action, a grant to give it with, and a place on the phone's list (`server/phone.ts`).
- `tools.renderers` (slide 11): the projector as a terminal, typing out the SSH command.
- `tools.order` (slide 26): an order form the assistant fills in and nobody presses.
  Needs an action, a grant, a place on the list.

## To build

In order; each lands with its check.

1. **The model check** — `pnpm models` (built 2026-09-27; results in `MEASURED.md`). Vex's
   seams are measured; each new seam joins it as it is built. A seam that does not pass is
   fixed in its grammar's descriptions or its tool contract, not by a bigger model. Its
   seeded room was rewritten 2026-09-30 — chosen names and the queries they ran, the
   app's own shapes — so numbers recorded before then are against the old room.
2. ~~**Tide agent**~~, ~~**Vex queries**~~, ~~**The assistant**~~, ~~**The timer**~~,
   ~~**The renderers**~~, ~~**The SSH door**~~, ~~**The X-ray**~~, ~~**Names and
   moderation**~~, ~~**Acme**~~ — built (see "What is built"). Not yet: parameterised
   replays (Jev choosing a fingerprint's context values); streaming replies.
3. **The cues above** — the button, the terminal projector, the order form.
4. **The full-room rehearsal** — 100 headless phones against the deployed shape, every
   phone asking the records and its assistant at once; Groq's per-model token limit is
   shared by every seam.

## What is built

**The room.**
- **The door** (`door.join`). Anyone opening the address gets the door: "Choose your
  name", twelve names nobody has yet, and a line to type your own. Offered names are an
  adjective and an animal (`server/names.ts`, 50 × 50) — plainly nobody's real name, so
  they need no moderation. A typed name is asked of the moderator first; refused, it is
  kept in `refused_names` and the person is told and handed an offered name instead.
  Entering mints a real session for a fresh principal, who then writes their own member
  row as themselves (`public` may insert a member only with the engine stamping
  `member_id` from their `userId` — `src/app/vex/behaviors.ts`). A name is taken once
  (`members.name` is unique).
- **The way in.** The first slide shows a QR code and the address in words; the
  projector's strip shows the address on every slide. The address is the deployment's
  (`PUBLIC_URL`), handed out by the `room.address` server function.

**The phone** (`member.phone`). The name the person chose across the top, and under it
`body`, a LIST canvas: every action they hold that belongs on a phone, one under another,
each its own block. What is on it is derived when their shell is built
(`server/phone.ts`, the shell's `inputs`): the assistant; every integration screen
installed, approved and attached to the phone (`member.phone`); the X-ray once given. Ring 1 decides; the phone
only reads it. A grant or an install rebuilds the shell (`invalidateIdentity`), and the
list follows — so through the talk, things arrive on everybody's phone as they are given.

**Moderation** (`server/moderation.ts`, `server/decider.ts`). Everything a person writes
that the room could see — a typed name, a question for the speaker — is one yes/no
question to the decider: fit to show on a projector in front of a hundred people? Yes at
0.5 and above. The `moderator` is a principal that is not a person: it writes
`question_verdicts`, a table of its own, so nobody who asks can approve their own
question. The speaker reads every question and every verdict. The stage reads verdicts
at its own reach, `projector` (`app/vex/behaviors.ts`), which the engine limits to
`appropriate = true` whatever an action asks for, and it reads no question at all — so
nothing unjudged or unfit can reach the projector, by the engine, not by which query a
screen calls. A question is not edited or taken back: it is judged once, as it was sent.
`LYCEUM_MODERATION=live|fake`; the fake refuses a few words and passes everything else.

**Acme — the room's Q&A** (`apps/lab/lyceum-vendor-demo`; `tools.integrations` on "Checked
in two places"). A third party's integration, published as a static file on GitHub
Pages (`LYCEUM_VENDOR_URL`); lyceum knows only its address. The controller's tool
installs it through moss's operator routes: moss fetches the bundle and intake checks it
— every component and prop is one lyceum's kit has, every endpoint a fingerprint lyceum
serves, no chain of steps that never ends. Its broken twin (`LYCEUM_VENDOR_BROKEN_URL`)
is refused with the loop's path. Acme ships three screens and says where each goes
(moss `attachments`), against the seats lyceum offers (`app/attachable.ts`), and intake
refuses any other: `ext.member.acme.ask` on the phone (ask, and see what you asked);
`ext.speaker.acme.questions` on the controller, a region of its own on every slide
(every question, its sender, and fit / not fit / not checked yet — two of lyceum's reads
joined in a `$prism` binding); `ext.stage.acme.questions` on the last slide (the fit
ones, by their words, no names). Installed, Acme is pending; approved, every shell is
rebuilt and each seat reads what rides it (`server/attached.ts`). A question asked
there is a row in lyceum's `questions`, as the person who asked. Remove takes it off
every seat again, for the next rehearsal. Lyceum's own `questions.send` is held by
nobody: it is the action slide 8 shows as code, and its layout is that slide's preview.

**Vex queries** — run by the assistant, never typed at (decided 2026-09-27: vex is not
something anybody talks to; a query is an INTENT and a SHAPE). The assistant's `query`
tool hands over an intent; `routeQuery` (`server/assistant/vex-query.ts`, over
`server/querying.ts`) does what cannot be data — a model's choice and a generation: it
reads the earlier intents (as the person), and the decider says in one call whether one
wants the same information and which authored shape the result takes
(`app/vex/query.shapes.ts`: a list, one number, counts per group, people; each drawn by
`actions/shared/answer.layouts.ts`). A match whose stored shape agrees is REPLAYED;
anything else is GENERATED by vex's agents on gpt-oss-120b under the person's policy,
against the same cache moss replays from; a generation the writer or the engine refuses
is REFUSED, and the reason says which. Every query is recorded as the person
(`queries`). The query then OPENS over their screen as what it is — `query.result`: its
intent, its shape, its fingerprint, its result (replayed through vex as them), and
whether it was replayed or generated. The query writer knows what the tables MEAN from
their comments (vex reads `COMMENT`s as descriptions). The projector's `slide.query`
counts replayed / generated / refused (a reactive read); the intents never go on the
wall. `LYCEUM_QUERY=live|fake`; the checks use the fake, which writes real DSL so the
engine, the policy and the replay are real.

**The assistant** (`assistant.thread` — on every phone's list, a tool on the controller on
three slides; `app/assistant/assistants.ts`, `server/assistant/`). One assistant,
assembled per person from DECLARATIONS, each applying to whoever holds its action: `room`
(`member.phone`) and `controller` (`speaker.console`). A declaration says what a grant
means about the person (`context` — a fact, never an instruction), what to read as them
(`grounding`), and which host tools they get. So the charter's grants build it.
Declarations naming an action, a read or a tool that does not exist refuse to boot.

ONE PROMPT (`server/assistant/orchestrator.ts`), the same for everybody, says how it
behaves: answer from what you are given when it holds the answer; otherwise use the tool
that fits; report only what the sections or a tool result say; a refusal passes on its
reason. What differs per person is KNOWLEDGE, assembled each turn
(`assistant.functions.ts`): THE PERSON, NOW, ON THEIR SCREEN, THEIR ACTIONS, THE
CONVERSATION SO FAR. Their screen is the served tree moss sends their phone, drawn as
words by lyceum's text kit (`src/ui/text.kit.ts`) — only what is on it, only what the
charter put there. Their actions are the charter's that declare an `input` (rule 14: the
openable contract), less the assistant itself.

The host's three tools are the only code: `open` opens one of THEIR ACTIONS (an enum of
exactly those) over the screen, pre-filled — opening changes nothing, the action still
waits for its own press; `query` runs a vex query and opens it over the
screen at once (it changes nothing); `automate` (controller only) hands the request, with
the deck as facts, to tide's reflex agent — which can refuse. What CHANGES something
waits for a press. A tool's result is facts, never how the screen works.

Every turn is a row (`assistant_turns`) written as the person; the screen shows the last
five turns, each with the vex queries it ran as buttons that open them again (replayed
now), and the model is handed the same five. Acting on a proposal writes its outcome
("Saved · fires at 18:56") and the proposal leaves the screen. `assistant-check` and
`query-check` assert it with the deterministic stand-in; `pnpm probe:assistant` measures
it live.

**The timer** — the talk's first minute and its last. On slide 3 the controller's tool is
the speaker's assistant: "Show the last slide in 30 minutes" is routed to `automate`, and
tide's reflex agent (`@niscorp/tide/agent`, gpt-oss-120b; `LYCEUM_TIMER=live|fake`) writes
a tide reflex DRAFT — shown as the document it is, to be read, its when in words ("30 min
after you save"). A draft's trigger may be a TIMER, a length (tide's sugar, never stored);
Save (`timers.save`) anchors it AT THE PRESS — the one thing that cannot be data, the
clock — to a one-shot clock to the second, rounded up, so reading time is never taken off
it; then it is the speaker's own vex write (`timers/save`, the reflex as a JSONB row,
`saved_by` stamped) over their session, and the saved timers are loaded into tide
(`server/timing.ts`: moss's durable store and driver, and at every boot as the `scheduler`
machinery role — a restart loads the same instant). Every timer runs as the `clock`
principal — stamped by the host whatever the document said. Two effects: `deck.show`
replays `deck/show` over the clock's own session, so the stage follows it like any other
deck move; `notify` shows a message to whoever saved the automation, in their live shell
only. Tide's ledger records what came of each run. The clock holds `deck.write.update`,
nothing else. The writer answers with a draft, a QUESTION or a refusal — each with its
reasoning, which the proposal shows. A reply to a question, or a correction of a draft
not yet saved, goes back to the writer as the conversation. The controller's head counts
down (`Countdown`, a kit primitive ticking on the viewer's clock). Tide's tables are
migrated with lyceum's before the server starts (`LYCEUM_SEQUENCES`). `timer-check` runs
it end to end, restart included.

**The X-ray** (`tools.xray` on "Your screen is data"; `xray.switch`, `xray.document`).
Give writes a grant row per member; their shells are rebuilt and the X-ray is a block on
their phone's list with a switch. On, the browser outlines every action on the screen
with its id; an id tapped opens that action over the screen as the JSON document it is —
data, triggers, layout. Take it back deletes the grants. `xray-check`.

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
Grotesk, Space Mono. Components are configured, never styled (AGENTS.md rule 2). No
brand colour. The kitchen sink is `kit.sink` — `/dev/as/kit`.

**A renderer per surface** (`tools.look`, `server/renderers.ts`, `src/ui/target.ts`).
Each surface — the phones, the projector, the controller — is drawn by nova's DOM
adapter, React or Vue, all three wearing the same stylesheet. One row per surface
(`renderers`; both columns closed sets held by the table). The renderer is not an action
on anybody's screen: the frame carries a `{ ref }` whose `Look` names it, set on every
living shell from its surface's row, and the browser draws with the renderer it names.
The controller's switch writes a row; every screen of that surface is drawn again and
the trees do not change. `look-check`.

**The SSH door** (`src/server/ssh-door.ts`, `src/ui/ink.kit.ts`). `ssh` into the room:
any user name, no password, and you are a stranger at the door, as a phone that opens
the address is. The door is a TERMINAL HOST, not a second server: each connection opens
its own moss wire to the room's socket, and moss's ink target draws the same trees a
phone gets with a terminal kit (a sheet is a column of ruled cells, an ink a coloured
rule, everything pressable a typed `[n]`). The host key is made on first start and kept
(`LYCEUM_SSH_HOST_KEY`; a volume in the compose file). `pnpm serve` opens it with
`LYCEUM_SSH_PORT`; under `pnpm dev`, `pnpm ssh` opens it against the dev server
(`ssh -p 2222 localhost`). `ssh-check` drives it with a real SSH client.

**Versions (strata).** Lyceum's tables are the `lyceum.app` sequence (15 migrations). The
source is locked in `strata.lock.json`; the kit's props are the grammar `lyceum.kit`
(`src/ui/kit.props.ts`, `src/app/grammars.ts`), at 8 — `kit-check` refuses a kit change
the sequence does not record.

**Deployed** on Railway, from `main` once CI passes: the Dockerfile, one process, one
web port (8796) — moss, the one-time sign-in (`/login`), the built terminal. SSH goes
through Railway's TCP proxy (`ssh -p 26466 sakura.proxy.rlwy.net`; `LYCEUM_SSH_ADDRESS`
puts it on slides 1 and 11). `docker-compose.yml` runs the same image beside its own
Postgres anywhere else. The speaker asks for a link at `/speaker` — a sign-in desk (`lectern.signin`),
the only thing that device's own principal holds — mailed through Resend to
`LYCEUM_SPEAKER_EMAIL` (`pnpm mint speaker` is the fallback); `/stage` gives any device a
stage session. `pnpm dev` mounts the same ones. Authored rows converge on every boot; the
talk's state is left alone. The vex cache is tiered: loaded into memory at boot, writes
land in Postgres.

**Dev.** `pnpm dev` (port 5197) keeps one in-memory database for its run and lends it to
every re-boot. `/dev/as/speaker`, `/dev/as/stage`, `/dev/as/kit`, `/dev/new`,
`?seat=<name>`. Vite listens on this machine only.

**Checks** (`pnpm check`, each in its own process over its own database; the list is
`src/dev/suite.ts`): `artifacts-check`, `kit-check`, `tables-check`, `deck-check`,
`serve-check`, `access-check`, `query-check`, `timer-check`, `assistant-check`,
`look-check`, `xray-check`, `door-check`, `integration-check`, `questions-check`,
`ssh-check`. The query check also passes live (`LYCEUM_QUERY=live node --env-file=.env
--import tsx src/dev/query-check.ts`).

## Decision points

| # | Decision | Tier | Answer |
|---|---|---|---|
| D1 | Posture | answered | Moss server app, hosted (first a VPS, now Railway). If hosting fails there is no talk. |
| D2 | Environment | answered | Postgres in Docker beside the app; vex's tiered cache; moss's `sessions` credential. The speaker signs in by a mailed link, the stage at `/stage`. Dev (derived): one in-memory PGlite per `pnpm dev`; each check a fresh one. |
| D3 | Reads | answered | Vex entries, locked, for everything the app itself reads; reactive where a screen follows the room. **Everybody** also gets a generative path — vex queries their assistant runs — under their own policy (answered 2026-09-27). |
| D4 | Writes | derived | Vex mutation entries, fired by a click or made by a server function as the principal it acts for. |
| D5 | Routing | derived | None. The talk's state is a row (`deck`), not a URL. |

## Decided

- **Models** (revised 2026-09-30). The agent seams — vex's query agent and mapper, the
  tide agent, the assistant — run on `openai/gpt-oss-120b` on Groq at reasoning `low`.
  Every narrow question with a fixed set of answers goes to ONE decider — Jev (TypeSafe,
  `decide()`), gpt-oss-120b without `TYPESAFE_API_KEY`: which earlier query a request
  matches and in which shape, and whether something a person wrote may be shown. Qwen is
  gone with the ID cards; so is solid from the talk's demos. The claim on stage: open
  models, sized to each job, with narrow problems and precise grammars.
- **Names, not profiles** (2026-09-30). A person chooses a name — offered, or typed and
  moderated. Nothing else about them is written.
- **The phone is a list canvas** (2026-09-30). Everything on it is an action on `body`,
  one under another; no tabs, no bar. A new thing given or installed is a new block.
- **The Q&A is Acme** (2026-09-30), a third party's integration installed on stage — not
  offered until it is installed. Lyceum's own Q&A actions are gone. Acme puts a screen on
  three seats: every phone, the controller (every question, even the unfit ones, with the
  verdict), the last slide (only the fit ones).
- **The renderer switch stays inside lyceum.** Moss is not changed for it; its terminal's
  render target is client chrome, and lyceum's own target does the switching.
- **SSH** is the terminal door.
- **The speaker shares the controller's screen** at the start, so the room sees the
  timer being asked for and saved.
- **One assistant, built per person by the charter** (answered 2026-09-27). The same
  `assistant` action on every device; what it knows and can do is assembled from
  DECLARATIONS, each keyed to an action. A declaration applies to whoever holds its
  action, so the charter's grants select it — no new charter section, no second list.
  Grounding reads run as the person, under their policy. Tools are the only code:
  `open`, `query`, `automate` (controller only). Replies in one piece for now; nothing
  runs without a press.

## Measured

What the models did against lyceum — the model check (`pnpm models`), the assistant
probe, Jev routing queries — is in `MEASURED.md`. The Qwen and ID-card numbers there are
for a feature that is gone.

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
| audience member | `member`, and `xray` while it is given | the phone: the assistant, integrations installed for members (Acme), the X-ray once given |
| `stage` (the projector) | `stage` | the slides, the strip, the register; an integration's screen on the last slide. No controls. Verdicts at the `projector` reach: only the fit ones, and no question |
| `speaker` (the controller) | `speaker` | the controller and its tools, All slides, the renderer switch, an integration's screen on the controller; every question and every verdict (`room` reach) |
| a device at `/speaker` | `lectern` | the speaker's sign-in desk and nothing else; a principal per device |
| `moderator` | `moderator` | judges typed names and every question; writes `question_verdicts` and `refused_names`, nothing else |
| `clock` | `clock` | what a saved timer runs as: it can put a slide on screen, nothing else |
| `kit` | `kit` | the kitchen sink (dev) |
| machinery | `identity`, `gatekeeper`, `scheduler` | a machinery role exists only where NO principal exists yet |

## The tables

| Table | Holds |
|---|---|
| `members` | one per person: the name they chose (unique), when they joined |
| `refused_names` | typed names the moderator found not fit to show — kept, never shown |
| `queries` | every query run from words: who ran it, the request, the shape, how it was answered (replayed, generated, refused), the fingerprint |
| `questions` | questions for the speaker and who sent them |
| `question_verdicts` | the moderator's verdict on each question: fit to show or not, and its score |
| `slides`, `slide_tools`, `slide_notes` | the deck: order and titles, the controller's tools, the speaker's notes |
| `deck` | the talk's state: the slide on screen |
| `renderers` | which renderer draws each surface: phones, stage, controller |
| `grants` | roles beyond `member` (the X-ray), and the roles of the principals that are not people |
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

- **Scale is unmeasured** — To build, 4.
- **Groq's per-model token limit** is shared by every seam; the assistant and its queries
  for a whole room in one minute is the heaviest load of the talk. The decider routing to
  replays is the first relief; the rehearsal measures the rest. Moderation adds one
  decider call per typed name and per question.
- **Vex queries are a generative path for everyone.** A request like "show me the login
  links" will be typed; the refusal must be shown, not discovered.
- **Acme is fetched from GitHub Pages at install.** If Pages is down on the night, the
  install fails and says why; `LYCEUM_VENDOR_URL` can point at any other copy.
- **Session tokens** still travel in the websocket URL (a moss case, open).
- **Moderation is a model's judgement.** A question it wrongly finds fit goes up on the
  last slide. The speaker sees every question and its verdict on the controller first.
  A question the model cannot judge (the provider down) is "not checked yet" on the
  controller and never on the projector; moderation tries again on the next question.
