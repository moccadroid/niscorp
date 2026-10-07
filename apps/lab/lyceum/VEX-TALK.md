# The Vex talk — the plan, and what was built

Written 2026-10-07 as a proposal; built the same day. **The record of what was built is `TALK.md` §15** — read that; this file keeps the plan and says where the build left it.

No package changed for any of it. Every mechanism is lyceum's own, against `@niscorp/vex`, `@niscorp/vex/agent`, moss and nova as they are on `main`.

## Where the build left the plan

- **Slide ids are flat**, not `slide.vex.*`: `slide.vex` is already a nisc slide, and the charter's leaves-only rule refuses an id that is another's namespace. The vex talk's slides are `slide.sixtools`, `slide.joined`, `slide.sql`, `slide.request`, `slide.document`, `slide.shown`, `slide.tools`, `slide.writer`, `slide.name`, `slide.value`, `slide.locked`, `slide.folder`.
- **`deck/go` stays**, talk-aware (it names a talk and a position), because the nisc talk's Prism slide shows Next's position arithmetic live. Picking a talk is `deck/go` to position 0 of it; no first-slide lookup, no `prev_slide_id`/`next_slide_id`.
- **The picker re-reads the deck before a pick.** It is mounted fresh each time it opens, and a press before its first read answered named an empty talk.
- **The clock reads slides**: `deck/show` looks up the slide's talk, and a lookup reads.
- **The speaker is granted `query.*` and the querying verbs**: the speaker could not ask or open a result before. A push of an action the principal is not granted is dropped silently, which is how that showed.
- **The ask is `ask.records`** under a role `asker` (`ask.*`), not `query.ask`: `query.*` is every member's already, and the give on stage is the point.
- **The trace carries the answer's shape kind**, so the fingerprint slide draws a replay with the same layout the phones use.
- **The search reads the engine directly** (`room.search`): the governed wire hands an action the result and drops the meta, and the slide shows `missingContext`. The stage draws the search tool's data through the mirror, which now mirrors a list of the speaker's actions (`speaker.mirror`, channel `speaker-mirror`).
- **`ask-check` became `vex-check`**: one check drives the whole vex talk's live beats.
- **`pnpm rehearse` exists and has run only as a dry run** with no model (six phones, every question generated, about 170 ms each). The live rehearsal, against Groq's limit, is still owed before a date.
- **The slides were re-set in nisc.dev's reading grammar** after the first cut broke on 16:9 (`TALK.md` §15, "The reading grammar"): `lyceum.kit` 13 adds `Sheet scale: 'page'`, `Text size`, `Exhibit`, `Pair`, `Stack` and `Stats`, drawn by all five kits; highlight.js colours the documents.
- **The talk's question is "Who joined last?"**, measured 3/3 live; the questions over `queries` are refused for want of a foreign key, and one over `questions` cannot be replayed by the stage. A tally that showed zeros on the fingerprint slide was that replay failing and stopping the mount; the tally reads first now.

---

## The plan as proposed

What the talk is: twenty minutes on Vex alone, told the way the essay tells it. A person asks in words and gives the shape of the answer. A model fills in a form, not a statement. The engine joins, scopes, compiles, tests and stores. The stored document is replayed by anyone, under their own rights, with no model. The rules of `TALK.md` §2 hold for every slide and note.

Two assumptions, both taken: the audience's phones are in, and the room's own data (members, questions, queries, presses) is the database the talk queries. There is no second demo schema.

### 1. Talks are rows, and the controller loads one

A `talks` table and a `talk_id` on `slides` and on the deck row; the slide id stays the key; positions unique within a talk; the deck's reads walk the talk that is on; a Talks sheet in the head's menu; Reset keeps the talk; `deck-check` walks every talk.

### 2. Watching a query being written, with no change to vex

Lyceum's own `GenerateDsl`: vex's agent, tools and caller line from `@niscorp/vex/agent`, with a listener on the run; a trace keyed by intent and expected inside the asker's session; a stage mirror by channel and function; the fake writer probing the engine so the checks see real messages.

### 3. The way to ask

A direct ask on the controller and on the phones through the one `routeQuery`, opening `query.result`.

### 4. A value in the request

`members/search` with `q`, a controller tool that sends it with and without the value, the stage showing the request, the statement with `$1`, the rows, or the key it missed.

### 5. Slides that read the code

Tools, grammar, tables, caller line, entry counts, the locked refusal, the write operations — derived, never typed in.

### 6. The deck

Twelve slides; see `TALK.md` §15 for the table as built.

### 7. Checks and the rehearsal

`deck-check` over both talks; the vex talk's check; the model check gains the talk's intents; `pnpm rehearse` for the full room.

### 8. Dangers

The rate limit; single-flight; the stage's rights on the fingerprint slide; timers across talks; the Q&A integration not on the vex phones; `queries` readable by every member.
