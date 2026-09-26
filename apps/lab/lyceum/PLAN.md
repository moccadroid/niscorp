# Lyceum — the plan

Lyceum is the talk. Not an app demoed during a talk about nisc — the talk itself, built
as a nisc application: the slides, the projector, the speaker's controller, the audience's
phones, the houses, the headmasters, the ending. At the close the speaker points at this
folder and says: everything you saw today is in here, and it was live.

The talk's subject is how software should work, and what it should look like, now that
language models exist. Lyceum does not argue that on slides. It shows it on the room's
own phones.

## Status and handoff — 2026-09-26

Where to pick up. Read this section, then "Vex is never hidden behind a function" and
"Reactive reads" below — they record decisions made after the plan was first written.

**Built (order of work steps 2–3), committed with this plan:**
- The scaffold: manifest (`src/app/app.ts`, artifacts only; the code seams are injected
  by `src/server/boot.ts`), dev runtime on PGlite with moss's real `sessions` credential,
  vite dev plugin with a dev-only `/dev/as/<principal>` for the speaker and the stage,
  a DOM terminal on nova's default kit (lyceum's own kit is step 4).
- Roles resolve from rows through moss's `identity` seam (`src/server/identity.ts`): a
  member wears their `house_id` (or `unsorted`) plus rows in `grants`; the speaker and
  the stage wear only their grants. No raw SQL.
- Five placeholder actions (door, member card, house crest, speaker console, stage
  roster) and the sorting.
- `src/dev/sorting-check.ts` (28), `deck-check.ts` (17) and `serve-check.ts` (13) pass
  over a real websocket; `src/dev/harness.ts` is the headless terminal they drive.

**Proven — the claim the talk stands on.** A member's phone, connected before the
sorting and never reconnected, receives its house the moment the speaker sorts
(`invalidateIdentity` → `shells.reset` carries the open connection across). Checked
headless and in a real browser with the controller in a second tab.

**Reactive reads — built 2026-09-26** (see "Reactive reads" below). The last red
assertion ("the stage shows their house") is green, unedited: `members/roster`,
`members/counts` and `members/me` declare `refresh: 'reactive'`, and the roster, the
controller's counts and the member card follow the room on their own. The reactions
seam, the `grants/watchers` entry and every `members-changed` channel are deleted.

**The deck — first cut, built 2026-09-26** (order of work step 6, stage and controller
only). Slides are actions (`src/app/actions/slide/`, plus `stage.roster` as the room
slide); their order is rows in `slides`; the slide on screen is the `deck` row. The
controller's Back/Next replay `deck/go` with a position clamped to the deck in Prism; the
controller's "Slide n / N" is a reactive read. The stage's `stage.deck` (on its own
`deck` canvas, shows nothing) replaces the stage's `main` with the slide the row names —
on mount, so a restart lands on the same slide, and on `deck-moved`, the one reaction
left (`src/server/reactions.ts`): mounting a new slide is navigation, which no data
update can do. `src/dev/deck-check.ts` (14 assertions): rows and charter agree, both ends
clamp, the stage follows the controller, the live slide counts the room unannounced.
`sorting-check` gained two assertions (the stage opens on the first slide; Next moves it
to the room) — the room is a slide now, so the check reaches it before asserting on it.
Not yet: what a slide puts on the audience's phones, the streamed agenda composing the
order, and the talk's real words (the slides carry provisional ones).

**Dev seats.** Every tab of one origin shares localStorage, so every tab was the same
person. `?seat=<name>` gives a tab its own session (`src/main.ts`); `/dev/new` opens a
fresh seat at the door; `/dev/as/stage` and `/dev/as/speaker` land on `?seat=stage` and
`?seat=speaker`. A phone at `/` has the one seat it needs.

**Deployable — built 2026-09-26.** `docker compose up --build -d` in this folder stands up
the app and its Postgres (`docker-compose.yml`; the image is `Dockerfile`, built from the
repo root). One process, one port (8796): moss (`/api`, `/catalog`, `/socket`), the
one-time sign-in (`/login`), and the built terminal (`vite build` → `dist/`, everything
else, no client routing). `DATABASE_URL` selects `src/server/postgres-runtime.ts`;
schema and seed are idempotent, so a restart keeps the room, the deck's position and
every session — verified in Docker: a restarted app container reattached the speaker,
the stage and a member where they were, and the deck moved on from there.
- **The speaker and the stage sign in with a one-time link**, for testing:
  `docker compose exec app pnpm mint speaker` prints `PUBLIC_URL/login?token=…`, used up
  on the first click, expiring after 15 minutes, into the principal's own seat. Redeemed
  as the `gatekeeper` machinery role (`login/redeem`). **A mailed link replaces how the
  link travels, not how it is redeemed** — that is the next step for sign-in.
- **The audience needs nothing minted:** the QR code points at `PUBLIC_URL`; the door and
  "Step in" do the rest.
- `/dev/as/*` and `/dev/new` stay dev-only in vite. `src/dev/serve-check.ts` (11) checks
  the served shape and the link against the dev runtime.
- The `pg` adapter is lyceum's own (`src/server/pg.ts`); the next app on Postgres is when
  it moves into vex.
- **Authored rows converge on every boot; the talk's state does not.** The slides (order
  and titles) and the houses' words become what `src/db/seed.ts` says — edit, restart,
  done — while the room, the grants and the slide on screen are left alone (a deck left
  on a slide that was cut goes back to the first). When the streamed agenda composes the
  order at runtime, the order becomes room data and stops converging.
- **Not yet:** the VPS, the domain and Caddy (TLS + websocket upgrade in front of 8796).

**`executeAs` is gone from lyceum's writes — 2026-09-26.** The sort and the unsort run
as the speaker over the speaker's own session (`src/server/vex-over.ts`; the charter
grants the speaker `members.write.update`). Stepping in mints the person first and has
them write their own member row as themselves: `public` may insert a member only with
the engine stamping `member_id` from their `userId` (`src/app/vex/behaviors.ts`) —
`serve-check` asserts a request cannot name somebody else's row. The `hat` and
`doorkeeper` machinery roles are deleted. What remains: the `/login` link's redemption
(`gatekeeper`) — credential plumbing like moss's own `sessions`, which moves into moss
beside `mintSession` when the mailed link lands — and moss's own identity resolution.

Consequence: the moss gap this plan used to lead with — `executeAs` writes never reach
`onWrite`, so reactions and tide miss them — no longer touches lyceum. It is still a
discrepancy with moss's DESIGN.md ("every write passes the observer"), to be fixed or
documented in moss, not here.

**The kit — built 2026-09-26** (order of work step 4). The look is "the poster":
`src/ui/` holds lyceum's own DOM kit (tokens, components, registry, render target) —
the only renderer code in the app. A screen is a `Sheet` (a ruled grid whose areas are
named in the layout, e.g. `['kick kick count', 'head head count']`); everything on it is
a `Cell` with an ink or a mark. Four colours, each with a job, on paper and ink:
`signal` (blue) the fact that matters, `alert` (orange) what to do next, `live` (green)
a number that changes on its own, `highlight` (yellow) what the pointer is on — every
hover — and what the eye should find (marked code lines). Houses are not colours: each is a MARK (stripes, dots,
bars, checks) and a SIGIL (triangle, circle, cross, square), stored on the house's row
and read as data — no layout names a house. "Not yet" is the hatch. Type: Unbounded for
the back row, Space Grotesk for sentences, Space Mono for code (Google Fonts, nothing
hosted), sized to the cell's width. Components are configured, never styled (AGENTS.md
rule 2): closed sets of names, no style or class from a layout. Slides use four layout
shapes (title, statement, code, live); the stage's strip (slide n/N, the room) is its
own canvas above the slide canvas. The kitchen sink is `kit.sink` — `/dev/as/kit`.

**Next:**
1. **The UI, continued** — the look is locked on the kitchen sink and the screens that
   exist; the talk's real slides and the persona screen are written against it.
2. **The ending.** "Start the talk" writes a `talk` row (`ends_at`) through the speaker's
   own vex. One tide reflex is derived from that row — a clock trigger at `ends_at`,
   rebuilt from the row on boot, so a restart before minute 40 still ends the talk and a
   server down at 40 fires on restart. Its effect is one vex write (`talk.ended_at`, the
   deck to the closing slide) made as a `clock` principal — a real principal in `grants`
   granted only those writes, through the normal door with its own session, like Lyra's
   automation actors. Phones and the controller read the talk's state reactively; the
   stage moves on the existing `deck-moved` reaction. No notification system.
3. Later, in moss: **identity as a reactive read.** Identity resolves from vex reads; if
   moss re-resolved a principal when those rows change, writing somebody's house would
   BE the role change, and the sort would not call `invalidateIdentity` at all.

**Working-tree notes.** `.claude/launch.json` has a `lyceum` entry (port 5197).

## What the room experiences

1. **Arrival.** A QR code on the projector. Scanning it signs the phone in (a session
   token, no password) and builds a persona for that person — name, archetype, traits,
   a backstory, a secret, and relationships to the people already in the room — streamed
   onto their phone field by field as the model writes it. They can edit parts of it
   (name, motto, look). The projector shows the roster filling and a join counter.
2. **The sorting.** When enough people have joined, the speaker presses Sort. Each persona
   is sorted into a house, one at a time, on the projector, with the hat's probabilities
   shown. Each phone changes into its house — skin, crest, house actions — without anybody
   reloading or signing in again.
3. **The headmasters.** The speaker grants each house its headmaster: an assistant with its
   own name, crest and voice. The button appears on that house's phones. The headmaster
   answers with text *and actions* — the app's own actions, chosen from what that person
   holds and filled with their data. "Change my name to X" comes back as a rename action
   showing *old → new* with a confirm button. The headmaster never writes anything; the
   person does.
4. **Unlocks.** Over the talk the speaker grants capabilities — asking the data, the
   headmaster pre-judging while you type, house rewards won in challenges. Each grant is
   one write; each appears on exactly the phones it was granted to.
5. **The board.** Anyone can post a question during the talk. An answering agent that has
   read the nisc docs drafts answers; the speaker can pin, override, or take it live.
6. **The ending.** A tide reflex armed in the first minute fires at the scheduled time and
   ends the talk: the closing action lands on every phone, and each person gets their own
   summary — their persona, their house, what they asked, what they unlocked, the final
   standings.

## Decision points

| # | Decision | Tier | Answer |
|---|---|---|---|
| D1 | Posture | answered | Moss server app, deployed on a VPS. No tunnels, no venue wifi dependency for the server. If hosting fails there is no talk. |
| D2 | Environment | answered | Postgres in Docker beside the app (docker compose, the same here and on the VPS — answered 2026-09-26; not PGlite: state must survive a moss restart). Vex's Postgres cache. Sessions via moss's `sessions` credential. The audience signs in at the door; the speaker and the stage by a one-time link minted on the server (testing), a mailed link later. The lab `dev-open` runtime is never deployed. |
| D3 | Reads | answered | Vex entries, locked, for everything the app itself reads. The **ask** action is the one generative path: live generation under the asker's own policy (`generateDsl(request, schema, caller)`), with Jev routing in front of it. |
| D4 | Writes | derived | Vex mutation entries. Every write is a confirmed click or a server function; the headmaster never writes. |
| D5 | Routing | derived | None. The talk's state is a row (`deck`), not a URL. |

D2, D4 and D5 follow from D1 and D3 and are recorded for review.

## Answered in the interview

- **Audience.** Meetups and conference rooms, 50–100 people, of whom only some will join.
  Nothing may assume a venue, a schedule or a speaker list — the app is portable and the
  data is generated by the room.
- **The demo data is the room.** Personas are generated at sign-in; relationships pick
  from personas that already exist. No fixture dataset.
- **Houses are sorted, not assigned at join.** People join as `unsorted`; the sorting is a
  ceremony the speaker triggers when enough have joined. Late joiners are sorted on
  arrival.
- **The hat is Jev.** One `choice` question per persona, the houses' characters as
  criteria, the persona as state — and the current house sizes in the state too, so it
  decides with the balance in view. The probabilities are shown.
- **The charter is written once and never edited live.** It declares the house roles and
  the capability roles. Every grant during the talk is an assignment write, applied with
  `invalidateIdentity(principal)` — which forgets the identity and resets that person's
  shell, carrying their connections across, so the phone receives its new frame.
- **Each house has a served layout variant** (ring 2): its own colours and crest.
- **The headmaster is granted after the sorting**, per house, by the speaker, on the live
  screen.
- **Assistant replies are text plus actions.** Chosen from the person's resolved catalog,
  `input` filled and admitted (row references must be real rows the person can read),
  rendered inline or as a go-to chip that pushes onto the main canvas and loads on click.
  The assistant selects and fills; it never invents actions or layouts.
- **Personas are partly editable** by their owner (name, motto, look). Anything a person
  wrote passes moderation before it reaches the projector.
- **The game is open data, not a component.** House points are rows; the standings are one
  vex aggregate on the projector. Nobody wins. Rewards are capabilities, not points.
- **Long-form streaming happens on the projector only.** A capable model (qwen 27b on
  Groq, pending measurement — see Risks) answers with an action layout holding long
  texts; the stream is buffered and replayed slowly, and the speaker says so.
- **The agenda composes the deck.** "What should we do today?" streams an answer whose
  items are slide actions chosen from the deck's catalog — the model can pick a slide, it
  cannot invent one.
- **Not in the talk:** inviting the room to attack the app, and killing the model
  provider live. Both risk the talk for a payoff that looks the same faked. The hardening
  list is still tested during the build (see Risks).
- **The Trickster** — an AI persona that joins as an ordinary principal and drives the app
  through the TTY adapter's interactives — is optional, for the end, if time allows.
- **Fallbacks are configuration.** Every model seam can be reassigned; the app gets dumber,
  it does not fail.
- **Nothing is hardcoded.** The source is the proof, and it will be read.

## Principals and roles

| Principal | Roles | What exists for them |
|---|---|---|
| audience member | `unsorted` → one of the house roles, plus capability roles as granted | persona, roster, board; after sorting: house chrome; then headmaster, ask, rewards as granted |
| `stage` (the projector) | `stage` | slide actions, roster, the sorting, standings, the board, the ask tally. No controls. |
| `speaker` (the controller) | `speaker` | next/back, countdown, join counter, Sort, grants, moderation queue, notes, section timers, model seam status |
| Trickster (optional) | `guest` | nearly nothing — the point |
| machinery | `identity` (resolves roles, moss's own), `gatekeeper` (redeems a sign-in link, until links move into moss) — and only roles like these | a machinery role exists only where NO principal exists yet. Everything that acts for a person or for the speaker acts as them, over their session's wire (see "Vex is never hidden behind a function"). A stranger stepping in is minted first and writes their own row. |

Stage and speaker are separate principals on separate devices. The projector never holds a
control; the controller can be a phone.

## The deck

- **Slides are actions.** A slide may be several actions cooperating over the bus.
- **The talk's state is one row.** `deck` holds the current slide and phase. The
  controller's next/back are vex mutations. Moving to another slide mounts a
  different action, which a data update cannot do, so the deck moving on stays a
  signal: the write's reaction publishes to the stage, which re-reads the row and mounts that
  slide. The audience's phones react to the same row —
  a slide becoming current is what puts its action on their phones.
- **Consequences, all free:** a moss restart lands every screen back on the same slide;
  the speaker can close the laptop and continue from a phone; the projector can be any
  browser signed in as `stage`.
- **The deck order is rows**, composed at the start by the streamed agenda.

## The world

| Table | Holds |
|---|---|
| `personas` | one per signed-in person: name, archetype, traits, backstory, avatar (chosen from a pool), motto, house (null until sorted) |
| `secrets` | one per persona, readable by its owner and the speaker only |
| `relationships` | persona ↔ persona: rival, ally, owes-a-favour — picked from existing personas at join |
| `houses` | name, character (the hat's criteria), colours, crest, headmaster name and voice |
| `sortings` | who went where, with the hat's probabilities — what the projector plays back |
| `grants` | capability → principal or house, when, by whom — the log behind every unlock |
| `house_points` | one row per point earned: who, which house, why |
| `challenges` | the house challenges and their answers |
| `questions`, `answers` | the board, and the answering agent's drafts |
| `asks` | every ask: intent, routed or fresh, fingerprint, timings, tokens — the tally's source |
| `badges` | earned by reflexes |
| `deck` | the talk's state |

Scope: personas and relationships are readable by everyone in the room; secrets are
personal; writes to a persona are pinned to its owner by a `match` rule.

## The mechanics

**Persona generation.** Runs once the new member's own session exists, and writes AS
the member over their wire: a small model writes the persona as structured output,
streamed with solid onto their phone; relationships are a `choice` over existing
personas. A buffer of pre-generated
personas makes a join instant under load and keeps joins working if generation is down.

**The sorting.** A server function the speaker's controller calls; its only code is the
CHOICE. For each unsorted persona in join order: ask Jev (state: the persona, the house
sizes so far); write the persona's house and a `sortings` row as the speaker, over the
speaker's wire; `invalidateIdentity` their principal. The projector's sorting action
reads `sortings` reactively and plays each one back as the writes land. Until Jev lands, the choice is "the house with the fewest members" — which
stays as the fallback when Jev is down.

**The headmaster.** A cortex agent run per message, reading as the asker over their own
wire — it never writes. Its persona is the house's `houses` row. Its reply envelope is
`{ response, actions: { action, input, inline }[] }`, admitted against the asker's
resolved catalog and each action's `input` schema. Granting a capability role extends
what it can offer with no prompt change, because its options are the catalog.

**The ask.** An intent input. A fingerprint request goes straight to vex. An intent goes
to Jev first: retrieve the nearest stored intents (trigram or embedding over the
entries' `intent`), ask Jev to choose one of them or `none`, and for the chosen entry ask
one `choice` per key of its **derived context signature** over real values read under
the asker's scope — Jev picks the fingerprint and its parameters, invents neither. `none`
generates fresh. A hidden "ask fresh" skips Jev. The generating agent is instructed to
prefer `$context` over literals so entries are reusable. Every ask writes an `asks` row;
the projector shows routed vs fresh, replay ms vs generation seconds, tokens spent vs
saved.

**The board.** Questions are a mutation. Moderation (a Jev yes/no) and deduplication (a
Jev choice over existing questions — a duplicate becomes +1, not a new card) run before
anything reaches the projector. The `answerer` agent reads the nisc docs through
producers and writes drafts; answers stream into their card.

**Badges.** A tide reflex on `questions` inserts, armed live through a loom form built
from the reflex schema; its selection counts the asker's questions; the badge lands on
their phone. The projector walks the causal chain back from any badge.

**The ending.** A clock reflex armed in minute one. Its effect pushes the closing action
to every live shell; its settled run is a fact that a second reflex fans out `each` over
the personas. The summary action is one fingerprint, read under each viewer's scope.

**What's in my app.** An "ask the app" action whose tools are read-only views over the
charter resolution, the action catalog, nova's `reflect`, the roster and `shells.list`.
An audience member may ask about the app and their own screen; the stage version, under
the speaker's principal, may look at any screen.

## Vex is never hidden behind a function

Decided 2026-09-25, after the scaffold reached for `executeAs` twice.

- Actions talk to vex directly through their endpoints. A server function exists only
  for what cannot be data: a model's choice, session lifecycle (`grant`/`revoke`), an
  outside call.
- When a function does touch data, it does so AS the principal it acts for, over
  `session.wire` — the same governed door their actions use. Their charter grants the
  verbs, their identity stamps the write, and the write is observed like any other.
- `executeAs` is for surfaces with NO principal: the identity read, the stranger at the
  door, a webhook, an effect nobody is driving. Reaching for it on behalf of a signed-in
  person (the first scaffold's `hat`) hides vex behind a function and invents a
  machinery role to do what the charter should say the person may do.

## Reactive reads

Built 2026-09-26 across nova, vex and moss; lyceum is its first consumer. The design
record is in the packages' DESIGN docs (vex: "Reactive reads"; moss: "A read that keeps
answering"; nova: "Later bodies"). What lyceum needs to know:

**An entry declares when its answer is refreshed**: `refresh: 'snapshot'` (the default —
answered once, as every read was) or `'reactive'` (answered again whenever a write lands
on a table the query reads, on every screen that has it open). Opt-in per entry; nothing
else changes for an entry that does not say.

```ts
export const memberRoster: SeedEntry = { fingerprint: 'members/roster', refresh: 'reactive', … };
```

**How it works, in one pass:**
- **vex** keeps the rows of reactive reads in process memory, keyed by the compiled SQL
  and its bound values — scope is inside both, so callers share rows exactly when they
  would get the same rows. Every committed write invalidates the tables it changed (and
  what a delete cascades into); followed reads refetch once per burst, and each caller's
  own mapping decides whether their answer changed. Bounded by TTL (60 s, which also
  re-checks followed reads so a missed write heals), entries and bytes; `engine.rows.stats()`.
- **moss**'s session wire hands vex a follower with every shell read and offers nova the
  response's `onChange`.
- **nova** applies a later body exactly as it applied the first — `response`, then
  `target` — and nothing else. It never learns why. A newer call to the same endpoint
  replaces the followed one; unmount ends it.

**Rules for authors:**
- Only direct vex reads can be reactive — a server function reading through the wire is
  not, by design.
- A reactive entry should `sort`: an unordered read can come back in a different order
  after a write and count as changed.
- A reactive entry reads time from `$scope`, never from context: the date is taken when
  the read is made and is not re-taken. (`refresh: 'clock'`, time as a source of change,
  is the next mode — not built; do not declare it.)
- Channels remain for signals that are not data — the deck moving on, "the sorting has
  started".

**Not built, on purpose:** cross-process invalidation (the fabric gains an
`invalidate-tables` signal when a second process exists; until then TTL bounds it),
pausing a shell's follows while nothing is attached, and `refresh: 'clock'`.

## Timeline (40 minutes, adjustable)

| Minutes | What happens |
|---|---|
| 0–4 | The agenda streams and composes the deck; the ending reflex is armed; the countdown starts |
| 4–10 | QR code; personas stream onto phones; edits; the join counter climbs |
| 10–13 | The sorting |
| 13–18 | What's in the app — charter, actions, data, explained by the app |
| 18–25 | Headmasters granted; replies with actions; the first challenge and reward |
| 25–31 | The ask: Jev routing in front of vex, the live tally |
| 31–36 | Badges armed live; the causal chain |
| 36–40 | Board answers stream on the projector; the ending lands |
| if time | The Trickster |

## Build rules

- **Rows** hold houses, headmasters, deck order, challenges, rewards, the ending's time.
- **Artifacts** (`app/`) hold every action, layout, fragment, variant, entry, reflex
  template and the charter.
- **Functions** (`server/`) are the only code: persona generation, the sorting, the
  headmaster run, the ask router, the answerer, the effects. Each one function wide.
- The repo's AGENTS.md applies in full — rule numbers are how reviews report violations.
- Every feature ships a headless check under `dev/`.

## Risks and things to verify first

- **Live role change — proven 2026-09-25** (`sorting-check`, and in a browser). What it
  exposed is under Status: machinery writes are invisible to the write observer.
- **Model choice per seam must be measured, not assumed.** qwen 27b on Groq at effort
  `default` looped to its step limit on encore's agent (0/6); `low` and `medium` passed
  (6/6). Groq's per-model token limit (250k/min) is shared by every seam on one model.
  Probe each seam's model before committing to it.
- **Session tokens.** The open case of a token riding in the websocket URL must be closed
  or understood before a QR code hands out links.
- **Statement timeout.** Nothing sets it; set it on the pool.
- **Event flooding.** Confirm whether moss throttles `ui:model` events per connection; add
  a limit if not.
- **Token burn.** Rate-limit asks per person, cap concurrent generations, single-flight.
- **Projector content.** Everything a person wrote passes moderation first.
- **Row reach.** Audit the `secrets` behaviours the way atrium's folio leak should have
  been caught.
- **Frames under streaming.** Frame deltas on; throttle partial renders during solid
  streams.
- **The hardening list is tested during the build**, even though the room is not invited
  to attack.

## Open

- House names, characters and crests; headmaster names and voices.
- The avatar pool's source.
- The VPS provider and domain.
- The talk's title.
- Which unlocks, in which order — decided by the story.

## Order of work

1. This plan, reviewed. — done
2. Scaffold: manifest, runtime, terminal; canvases and an empty registry; one action
   renders on a phone against the VPS. — done locally (dev runtime); the VPS is Open
3. Prove the live role change end to end. — done; reactive reads built; the sort and
   the door write as the people they act for
4. Kit: primitives against a kitchen-sink action; the house variants; lock the look.
5. Data: schema, entries, behaviours; persona generation and the join.
6. The deck: controller, stage, the `deck` row.
7. The sorting.
8. Headmasters and replies with actions.
9. The ask and its router; the board; badges; the ending.
10. Checks per feature; a full rehearsal against the VPS with headless terminals as the
    audience.
