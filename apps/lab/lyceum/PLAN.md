# Lyceum — the plan

Lyceum is the talk. Not an app demoed during a talk about nisc — the talk itself, built
as a nisc application: the slides, the projector, the speaker's controller, the
audience's phones. At the close the speaker points at this folder and says: everything
you saw today is in here, and it was live.

The talk is about the framework: how software should work, and what it should look like,
now that language models exist. Lyceum does not argue that on slides. It shows it on the
room's own phones.

## Status — 2026-09-26

Rewritten 2026-09-26. The first version of this plan told a different story (houses, a
sorting hat, headmasters, personas with secrets); that story was dropped. What was
decided under it and still holds is kept below; what was only ever part of it is under
"Ideas from the first plan" — not decided, not to be built from this file.

**The story is the Ministry** — a thin skin over the framework's own concepts, in plain
words nobody has to learn:

| In the room | In nisc |
|---|---|
| you step in and get an **ID card** | a session, a principal |
| you are **assigned to a department** | a role |
| your department's **clearance** decides what exists on your phone | the charter (ring 1) |
| everything you can do is a **form** | an action |

Four departments, four clearances, four different phones: **Records** reads the register;
**Forms** can change their own record (a write pinned to their own row by the personal
reach); **Inquiries** puts stored questions to the records (vex replays, reactive);
**Archive** sees the history. A department is a MARK (a pattern) and a SIGIL (a shape) on
its row, not a colour. Wording rule: no invented vocabulary, nothing whimsical; names on
ID cards are ordinary names.

The talk's text, its title and the order of its slides are **open** — to be written with
the speaker. The seven slides in `src/db/seed.ts` and their notes are placeholders.

## What is built

**The room.**
- **The door.** Anyone opening the address gets the door; "Step in" mints a real session
  for a fresh principal, who then writes their own member row as themselves (`public` may
  insert a member only with the engine stamping `member_id` from their `userId` —
  `src/app/vex/behaviors.ts`).
- **The ID card.** Qwen on Groq (signal `stepStream`) writes `{ name, title, quirk }`;
  solid parses the stream into an always-valid partial card, written to the member's row
  as it grows by the `registry` principal. The phone and the projector's register are
  reactive reads, so the card types itself in everywhere at once. Groq is too fast to
  watch, so the stream is replayed at a reading pace (~1.5 s) — said so in code and on
  stage. `LYCEUM_ISSUER=groq|fake`; the checks always use the fake.
- **Assignment.** The speaker assigns everybody waiting to the emptiest department — one
  write per person, as the speaker over their own session, then `invalidateIdentity`:
  the phone changes department without reconnecting or signing in again.
- **The way in.** The first slide shows a QR code of the room's address and the address
  in words; the projector's strip shows the address on every slide. The address is the
  deployment's (`PUBLIC_URL`), handed out by the `room.address` server function.

**The deck.** Slides are actions only the stage is granted; their order is rows
(`slides`); the slide on screen is one row (`deck`). The stage's `stage.deck` mounts the
slide the row names — on mount (a restart lands on the same slide) and on `deck-moved`,
the one reaction left (`src/server/reactions.ts`): mounting a new slide is navigation,
which no data update can do. Everything that only *displays* the deck is a reactive read.

**The controller** (`speaker.console`) is an arrangement of four canvases in its own
layout — a canvas slot inside an action's layout, tested in nova and moss — so what stays
the same stays where it is:
- **head** — the room (in it, assigned) and the slide on screen;
- **tools** — a list canvas holding the slide's tools (`slide_tools` rows, in order);
  the speaker's deck reconciles it to them (nova's `reconcile` step), so a tool two
  slides share stays mounted, and a slide with none says so;
- **notes** — the speaker's notes for the slide (`slide_notes`);
- **controls** — All slides (a panel over the controller), Back and Next, each saying
  which slide it goes to.
Only the speaker is granted it; phones and the projector keep the frame's plain stack.

**The look — "the poster"** (`src/ui/`, the only renderer code). A screen is a `Sheet`, a
ruled grid whose areas are named in the layout; everything on it is a `Cell` with an ink
or a mark. Four colours, each with a job, on paper and ink: `signal` (blue) the fact that
matters, `alert` (orange) what to do next, `live` (green) a number that changes on its
own, `highlight` (yellow) what the pointer is on — every hover — and what the eye should
find. "Not yet" is the hatch. Type: Unbounded, Space Grotesk, Space Mono (Google Fonts,
nothing hosted). Components are configured, never styled (AGENTS.md rule 2). The kitchen
sink is `kit.sink` — `/dev/as/kit`.

**Versions (strata).** Lyceum's tables are the `lyceum.app` sequence, applied once and
recorded in the ledger: migration 1 is the original DDL (so a database from before the
ledger adopts with its rows), migration 2 turns a slide's one tool into `slide_tools`
rows. The source is locked at `nisc.nova` 1, `nisc.prism` 1 (`strata.lock.json`), and the
kit's props are a grammar of their own, `lyceum.kit` (`src/ui/kit.props.ts`,
`src/app/grammars.ts`) — `kit-check` refuses a kit change the sequence does not record.
Proven on real Postgres in Docker: a pre-ledger database adopted both migrations with
its rows kept, a second boot ran nothing.

**Deployable.** `docker compose up --build -d` stands up the app and its Postgres. One
process, one port (8796): moss (`/api`, `/catalog`, `/socket`), the one-time sign-in
(`/login`), and the built terminal. The speaker and the stage sign in with a one-time
link: `docker compose exec app pnpm mint speaker`, used up on the first click, expiring
after 15 minutes. A mailed link will replace how the link travels, not how it is
redeemed. Authored rows (departments, slides, their tools and notes) converge on every
boot; the room, the grants and the slide on screen are left alone.

**Dev.** `pnpm dev` (port 5197) keeps one in-memory database for its whole run and lends
it to every re-boot, so an edit keeps everybody signed in; restart it for a fresh room.
`/dev/as/speaker`, `/dev/as/stage` and `/dev/as/kit` sign a tab in; `/dev/new` opens a
fresh seat at the door; `?seat=<name>` gives a tab its own session. Vite listens on this
machine only — on the wifi, `/dev/as` would sign anybody in as the speaker. To try a real
phone, `pnpm dev --host` with `PUBLIC_URL` set to this machine's address, knowing that.

**Checks** (`pnpm check`, each in its own process over its own database): `kit-check`,
`tables-check`, `assignment-check`, `deck-check`, `serve-check`.

## Decision points

| # | Decision | Tier | Answer |
|---|---|---|---|
| D1 | Posture | answered | Moss server app, deployed on a VPS. No tunnels, no venue wifi dependency for the server. If hosting fails there is no talk. |
| D2 | Environment | answered | Postgres in Docker beside the app (docker compose, the same here and on the VPS; not PGlite: state must survive a restart). Vex's Postgres cache. Sessions via moss's `sessions` credential. The audience signs in at the door; the speaker and the stage by a one-time link minted on the server, a mailed link later. Dev (derived): one in-memory PGlite per `pnpm dev`, lent to every re-boot; the checks get a fresh one per boot. |
| D3 | Reads | answered | Vex entries, locked, for everything the app itself reads; reactive where a screen follows the room or the deck. A generative path, if the talk gets one, runs under the asker's own policy. |
| D4 | Writes | derived | Vex mutation entries, fired by a click or made by a server function as the principal it acts for. |
| D5 | Routing | derived | None. The talk's state is a row (`deck`), not a URL. |

## Answered, and still holding

- **Audience.** Meetups and conference rooms, 50–100 people, of whom only some will join.
  Nothing may assume a venue, a schedule or a speaker list — the app is portable and the
  data is generated by the room.
- **The demo data is the room.** No fixture dataset.
- **The charter is written once and never edited live.** Every change the speaker makes on
  stage is a row — a person's department, a line in `grants` — applied with
  `invalidateIdentity`, which carries the open connection across.
- **Not in the talk:** inviting the room to attack the app, killing the model provider
  live. Both risk the talk for a payoff that looks the same faked. The hardening list is
  still tested (see Risks).
- **Fallbacks are configuration.** Every model seam can be reassigned; the app gets dumber,
  it does not fail.
- **Nothing is hardcoded.** The source is the proof, and it will be read.

## Principals and roles

| Principal | Roles | What exists for them |
|---|---|---|
| a stranger | `public` | the door |
| audience member | `unassigned`, then one of `records`, `forms`, `inquiries`, `archive` | the ID card; after assignment, the department badge and the department's own tool |
| `stage` (the projector) | `stage` | the slides, the strip, the register. No controls. |
| `speaker` (the controller) | `speaker` | the controller and its tools, All slides |
| `registry` | `registry` | writes ID cards as the model writes them |
| `kit` | `kit` | the kitchen sink (dev) |
| machinery | `identity` (resolves roles), `gatekeeper` (redeems a sign-in link) | a machinery role exists only where NO principal exists yet |

Stage and speaker are separate principals on separate devices. The projector never holds
a control; the controller can be a phone.

## The tables

| Table | Holds |
|---|---|
| `departments` | name, remit (what the clearance lets you do, in plain words), mark, sigil |
| `members` | one per person in the room: name, title, quirk (the ID card), department (null until assigned) |
| `slides` | the deck's order and titles; each slide id is an action |
| `slide_tools` | a slide's tools on the controller, in order |
| `slide_notes` | the speaker's notes per slide, in order |
| `deck` | the talk's state: the slide on screen |
| `grants` | roles beyond a person's department, and the roles of the principals that are not people |
| `login_links` | one-time sign-in links (hashes only) |

## Vex is never hidden behind a function

Decided 2026-09-25.

- Actions talk to vex directly through their endpoints. A server function exists only
  for what cannot be data: a model's choice, session lifecycle (`grant`/`revoke`), an
  outside call, the deployment's address.
- When a function does touch data, it does so AS the principal it acts for, over
  `session.wire` — the same governed door their actions use.
- `executeAs` is for surfaces with NO principal: the identity read, the stranger at the
  door, a webhook, an effect nobody is driving.

## Reactive reads

Built 2026-09-26 across nova, vex and moss; lyceum is its first consumer. The design
record is in the packages' DESIGN docs (vex: "Reactive reads"; moss: "A read that keeps
answering"; nova: "Later bodies").

**An entry declares when its answer is refreshed**: `refresh: 'snapshot'` (the default)
or `'reactive'` (answered again whenever a write lands on a table the query reads, on
every screen that has it open).

**Rules for authors:**
- Only direct vex reads can be reactive — a server function reading through the wire is
  not, by design.
- A reactive entry should `sort`: an unordered read can come back in a different order
  after a write and count as changed.
- A reactive entry reads time from `$scope`, never from context.
- Channels remain for signals that are not data — the deck moving on.
- Raw-SQL writes do not invalidate; the TTL (60 s) heals them.

**Not built, on purpose:** cross-process invalidation, pausing a shell's follows while
nothing is attached, `refresh: 'clock'`.

## Next

1. **A rehearsal with a full room** — headless terminals as the room — 100 phones and some margin — against the
   deployed shape: reactive reads answering on every screen, one server shell per person,
   ID cards through Groq at once. Nothing has run at that size.
2. **The VPS, the domain and Caddy** (TLS and the websocket upgrade in front of 8796).
3. **The talk's content** — its text, title and slide order, with the speaker.
4. **The ending.** "Start the talk" writes a `talk` row (`ends_at`) through the speaker's
   own vex. One tide reflex derived from that row — a clock trigger at `ends_at`, rebuilt
   from the row on boot. Its effect is one vex write (the deck to the closing slide) as a
   `clock` principal granted only that. No notification system.
5. Later, in moss: **identity as a reactive read** — re-resolving a principal when the
   rows it reads change, so writing somebody's department IS the role change.

## Ideas from the first plan — not decided

Written for the first story; none is decided under the Ministry, and none should be
built from this list without talking it through first.

- **Replies with actions.** An assistant answering with text *and* the app's own actions,
  chosen from the asker's resolved catalog and filled with their data — it never writes;
  the person confirms.
- **The ask.** A question put to the data: routed to a stored entry (Jev chooses the
  fingerprint and its parameters) or generated fresh under the asker's policy, with the
  projector tallying replay vs generation.
- **The board.** Questions from the room, moderated and de-duplicated before the
  projector; drafted answers streamed into their card.
- **Badges** from a tide reflex armed live, with the causal chain walked back.
- **"What's in my app"** — the app explaining itself from the charter, the catalog and
  `reflect`.
- **The agenda composing the deck** from the deck's catalog.

## Risks and things to verify first

- **Scale is unmeasured** — see Next, 1.
- **Model choice per seam must be measured, not assumed.** qwen 27b on Groq at effort
  `default` looped to its step limit on encore's agent (0/6); `low` and `medium` passed
  (6/6). Groq's per-model token limit is shared by every seam on one model.
- **Session tokens.** The case of a token riding in the websocket URL must be closed or
  understood before the address goes up on the wall.
- **Statement timeout.** Nothing sets it; set it on the pool.
- **Event flooding.** Confirm whether moss throttles events per connection.
- **Projector content.** Anything a person wrote passes moderation before the projector
  (today: ID cards are written by the model, not by people).
