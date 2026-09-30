# The talk — everything agreed so far

The working record for the nisc talk that lyceum runs. It holds what we agreed, what is built, what is not, and the ideas we discussed and kept, parked or dropped. The deck itself is data in `src/db/seed.ts` (`SLIDES`: order, controller tools, speaker notes) and `src/app/actions/slide/`; this file is the reasoning behind it. Updated 2026-09-30.

---

## 1. What the talk is

- **A technical talk first.** Lyceum is the live demo beside it, not the story. Everything the room sees runs in one app on one server: the slides, the projector, the speaker's controller, the audience's phones, laptops and SSH terminals.
- **Audience:** meetups and conference rooms, 50–100 software engineers who work with AI. A tough crowd, not impressed by shiny pictures. Nothing may assume a venue, a schedule or a speaker list.
- **Length:** about 40–45 minutes.
- **The claim:** nisc is an architecture for applications that language models write and operate. Everything the app does is a document in a closed grammar, checked by a schema and run by a runtime; code lives only at the edges.
- **Nova is the centrepiece.** Everything revolves around actions, layouts and shells, and every later question and every problem nisc had to solve follows the principles set in Nova and Prism. Moss is the logical conclusion (a server for the shell), not the start.
- **Lead with problems before solutions.** Never "code lives in five places" before anyone knows why that matters. A demo only once the audience has a reason to care.
- **Whimsical in the demos, plain in the words.** Pushing silly things to phones is good; slide copy stays engineer-to-engineer.

## 2. Rules for slides and notes (hard rules)

- **Language:** plain, engineer-to-engineer, short factual sentences. Never aphoristic or literary, never patronizing, never stage directions dressed as slides. Never the old app vocabulary ("the door", "step in", "the room", "ID card" as a concept, "clearance", "departments").
- **Banned word: "hold"** ("actions you hold", "which role a person holds"). Say "has", "is granted", "can use".
- **A slide is an anchor:** the name of the thing, one claim, one picture. What is argued is *said*.
- **Notes are bullets**, each one a line the speaker can say as written; actions in `[brackets]`. Never uneven prose with facts buried in it.
- **Design each slide on its own.** Never stamp one template (big headline + blue sentence bar) across slides. A picture where a sentence would go. "The core statement" means the point in a few words, not a paragraph.
- **Don't crowd, don't waste space.** The better answer gets its own slide rather than sitting beside the worse one.
- **Name things before showing them** — Nova is introduced as the answer before any mechanism.
- **Never show internal mechanisms nobody cares about** (stack vs list canvases) or internal names (the "poster" kit).
- **Every claim on a slide must be true of the code** — verify before writing. Never show rewritten or shortened "real" output as if it were real.
- **The strip across the projector's top:** the join address and the joined count, nothing else.
- **Don't trade a layout that works for more room** — re-wrap the content to fit it.
- Look: the poster kit (Unbounded / Space Grotesk / Space Mono; blue = the fact that matters, orange = what to do next, green = live, yellow = highlight; hatched = not yet). Each new slide's cells wipe in once when the slide arrives; updates never replay it.

## 3. The story (the spine)

1. **Where it started (2020):** GPT-3 could not write a React app. It could fill in a JSON schema, most of the time — and JSON can be checked before anything runs. So: what if the UI is the JSON?
2. **The problem today:** models write code faster than anyone can review it. One answer (Lowdefy's): make the output small enough for a person to read. That still needs a person for every change.
3. **Our answer:** make it something a program can check. The UI, the queries, the permissions, the automations — each a document with a schema. A model writes it, a program checks it, a runtime runs it.
4. **Nova — the UI is data.** Actions (data, endpoints, triggers, a layout), shells that hold a person's actions, one tree drawn by any renderer. What that gives you, shown live: the screen as data, pushing actions to people, no front-end gate, the renderer swap.
5. **The obvious question:** isn't this json-render / A2UI? Two differences matter: behaviour is data too, and the state lives in the action (so it runs anywhere — which is why the demos worked).
6. **Is JSON enough for a real app?** This app, counted live.
7. **What's the worst a model can write?** We tried to break it; what broke; how a closed grammar let us find and fix it. Review the result, not the code.
8. **Then (not yet built as slides):** Moss + Charter, Prism, Vex (with Jev routing), the assistant, Tide (the timer's payoff, the OpenClaw contrast), Strata, the close.

The history order of the packages (Sep 27 outline) still holds as the background logic: nova (GPT-3 JSON) → prism (data-to-data) → signal/cortex → solid (streaming) → vex (intent + shape) → moss (the app server) → charter (policy, because moss needed it) → tide (automation as data) → strata (versions, because everything is data).

## 4. The deck as built (19 slides)

Status: ✅ built and checked · 🟧 slide built, demo not built (hatched cue on the controller) · ✏️ drafted, not yet looked at on the projector.

| # | Slide id | On screen | Controller tools | Status |
|---|---|---|---|---|
| 1 | `slide.title` | "nisc" + one line; join panel: QR, address, SSH command if `LYCEUM_SSH_ADDRESS` is set | assistant | ✅ |
| 2 | `stage.register` | "Everyone who has joined": live names and model-written titles, QR, joined count | — | ✅ |
| 3 | `slide.timer` | "First, a timer." — headline only (the controller is shared for this) | assistant | ✅ |
| 4 | `slide.origin` | 2020: "GPT-3 could not write a React app." / blue: "It could fill in a JSON schema." | — | ✅ |
| 5 | `slide.problem` | "Models write code faster than anyone can review it." + small: Lowdefy's answer | — | ✅ |
| 6 | `slide.answer` | full blue: "Our answer — Make it something a program can check." | — | ✅ |
| 7 | `slide.nova` | blue: "NOVA — The UI is data." Right: 1 the real Send button's JSON (from `send.layout.ts`), 2 "Valid", 3 that node rendered as the real button | — | ✅ |
| 8 | `slide.data` | "An action": `send.action.ts` source (click → `send` steps → endpoint marked) beside its layout rendered, on blue | — | ✅ |
| 9 | `slide.xray` | "Your screen is data." + blue "On your phone: X-RAY" | cue `tools.xray` | 🟧 |
| 10 | `slide.clearance` | "Three of you just got a button." + orange "On three phones: PRESS" | cue `tools.button` | 🟧 |
| 11 | `slide.looks` | "The server sends data. Your phone draws it." Styled / Unstyled / Terminal | `tools.look` + cue `tools.renderers` | ✅ look switch; 🟧 React/Vue/Terminal |
| 12 | `slide.compare` | "Isn't this json-render?" + Vercel · json-render, Google · A2UI | — | ✅ |
| 13 | `slide.behaviour` | "What a button does": json-render "Calls a function in your app." vs Nova "Is data." + the real trigger | — | ✅ |
| 14 | `slide.state` | "Where the state lives": "In your app's store." vs "In the action. So it runs anywhere." | — | ✅ |
| 15 | `slide.census` | "Is JSON enough for a real app?" Chart: Data / Renderers / Endpoints / Setup / Tests (lines of code, comments excluded, counted live by `server/census.ts`) + share (~52–54%) | — | ✅ |
| 16 | `slide.worst` | "What is the worst a model can write?" | — | ✏️ |
| 17 | `slide.broke` | "We tried to break it." Leak: Held (green) · Crash: Two holes · Explode: Broke (orange) | — | ✏️ |
| 18 | `slide.loop` | "Three lines froze the server." The echo action beside: found by reading it; limits: 64 hops / 1,024 per chain, 256 levels, a timeout on every endpoint and query | — | ✏️ |
| 19 | `slide.review` | full blue: "So — Review the result, not the code." | — | ✏️ |

The notes for every slide are in `src/db/seed.ts`.

## 5. The notes, in short (full text in `seed.ts`)

- **1 Title (2–3 min while people join):** ask everyone to join; the talk is an app running now on one server; laptops: open the address with devtools open; the SSH command works; a model writes your profile as you join; everything is in one folder, link at the end.
- **2 Register:** every line is a row; titles written by a model and streamed, valid at every step; wait until most are in.
- **3 Timer:** share the controller; type "Show the last slide in 30 minutes"; it returns a document, not a timer — read it out; Save; "I'll come back to this at the end."
- **4–6:** the origin, the problem, our answer — as in §3.
- **7 Nova:** a screen is made of actions; an action is JSON; a model writes it, a schema checks it, Nova runs it; Nova doesn't draw, a renderer does.
- **8 An action:** the Q&A form; data (the draft), layout (drawn on this slide from the same JSON), tap Send → trigger runs `send` → which calls the endpoint `send` by name; no fetch, no handler code.
- **9 X-ray:** give everyone the X-ray; press the big blue button; that's your screen as data; nothing on it is code — you, a program or a model can read all of it; take a minute; take it back.
- **10 The button:** give it to three people; raise your hand if it's you; volume up, press it; everyone else: it was never sent to you; laptops: search the websocket frames; no code changed — rows changed, shells rebuilt; take it back.
- **11 Looks:** switch to plain HTML; same data, different components; only one value was sent; switch back; terminal: the command is on screen — connect.
- **12–14:** json-render and A2UI are good and point the same way; they describe a view, the host keeps state and code; in Nova behaviour is data and the action keeps its own state — so it runs on a server, one shell per person, and any renderer can draw it.
- **15 Census:** the usual objection; this app is the slides, projector, controller, phones, SSH, assistant, timers; half of it is data; the code is in three places, each about a third the size of the data; counted live, comments don't count.
- **16–19 Safety:** see §7.

## 6. Demos: built, not built, and ideas

**Built and working:** joining + streamed profiles; the register; the timer (tide reflex written by gpt-oss-120b, read, saved, counting down; `notify` effect); the look switch (styled ↔ plain HTML — note: it still repaints the controller too); the SSH terminal (`ssh -p 26466 sakura.proxy.rlwy.net` on Railway); Q&A on phones; the assistant with vex queries; the census.

**Agreed, not built (hatched cues on the controller):**
- **X-ray** — arrives on everyone's *main screen* as a large blue button (not a tab); pressed, it shows their own screen as data: every action on it and each one's data. Taken back the same way.
- **The button** — given to three random people (a few in case one doesn't play along), on their main screen; pressed, it plays a sound. Not called "fart". The point is selective pushing: some have it, the rest were never sent it.
- **Renderer switch** — React, then Vue, then Terminal: the projector goes black and types out the SSH command, daring people to connect. Lyceum is pure DOM today; React/Vue need adapters (a Vue adapter is a sibling of nova's React one) plus kits. The earlier idea: all look identical except a thin border naming the renderer.
- **Giving/taking actions** — the controller gives an action to everyone / a group / a person by writing grant rows; shells rebuild live (the mechanism exists: grants + `invalidateIdentity`).

**Ideas discussed and kept for later:**
- **Build up their app slowly** — actions arrive on their main screen one by one through the talk (chrome is hard to add/remove; actions are easy: there, then gone).
- **Q&A on the controller permanently** — a region on the controller dashboard showing every question, not tied to a slide (the old slide-bound list was removed).
- **A purpose-built action for the drive-through beat** instead of the Q&A form — e.g. an order form: ask the assistant for "18,000 waters" and it opens the order pre-filled; the person doesn't press Send. Belongs in the assistant section.
- **The assistant reads your screen** — belongs in the assistant section, not the Nova section. Show it only with the real, unshortened context, or not at all.
- **A second, small model (Jev) checking what the assistant prepared** before it's shown — mention as a possibility.
- **"Iframe but native"** (from the safety research) — an integration's UI in another kit inside the host; for the talk, a third kit shipped by the host and chosen by namespace, never someone else's code in the browser.
- **A live loop demo** (push the looping action, watch it be refused) — decided *not* to do live (too much); mention it instead.

**Dropped:** the departments (four groups with one tool each — the old way to show ring 1); the rename example; comparing phones with/without the fart button as a slide; stack vs list canvases; the assistant slide in the Nova section; the drive-through slide using the Q&A form; the 33-slide draft; slide numbers/titles/brand in the strip.

## 7. The safety section (drafted as slides 16–19)

**The claim:** a schema-valid nisc document can't crash your app, can't leak data and can't explode; the worst it can be is *wrong* — and wrong is what testing is for, not code review. It carries "review the result, not the code" and the case against code generation.

**What we did (session "Nisc changes and Lyceum talk notes", merged `4dc9240`, pushed `c1ae91b`):** attacked it with schema-valid data only.
- **Leak — held.** Exfiltration by URL impossible under moss (endpoints dispatched in-process); denied tables refused however named (join, subquery, filter, compute); forged ids answered in the caller's scope; a shared fingerprint replays in the replayer's scope; ungranted actions and others' channels unreachable. *(Research counted 41/41 attack assertions — that count lives in the uncommitted research worktree, so it stays off the slides.)*
- **Crash — two holes.** A layout nested 20,000 deep made the parser throw (prism and vex at 2,000); a doubling loop ran the server out of memory.
- **Explode — broke.** A three-line action (a trigger on `x` that emits `x`) froze the whole server for everyone; loops that yield still ran forever; endpoints could hang; no vex statement timeout; a 119-character Prism config made a 134-million-character string; tide's fan-out allowed 2²⁴ runs.
- **The fixes** (each true of the code now): emit on the next task + a causal budget (64 hops deep, 1,024 per chain → `RUNAWAY_CHAIN`, `nova/…/cause.ts`) `0544867`; `chainCycles()` finds every loop by reading the actions — warns at boot, refuses at integration intake `b05592b`; a 256-level depth check before every parse (`strata/depth.ts`) `fbc6c7b`; a 30 s endpoint timeout (per-endpoint `timeoutMs`) `c2986c2`; vex `statementTimeoutMs` (10 s default; enforced on Postgres, only warned on PGlite) `62c6566`; a Prism budget `0daab2b`; tide's breadth ceiling (10,000 per chain) `b1ea6e6`. Tide already worked this way; everything else follows it now.
- **Limits to say out loud:** "can't leak" is proven *under moss* — in a browser-only app the policy is in the browser and is no security boundary; the vex timeout is real on Postgres, not on PGlite; budgets are defaults and can be changed.

## 8. Positioning (for the json-render slides and questions)

- **json-render (Vercel)** and **A2UI (Google):** a model writes a *view* from a catalog; handlers are functions in the host app; state lives in the host's store (Redux, Zustand…); runs in the browser. They are good and heading the same way — evidence the direction is right. Don't claim they lack streaming validation unless checked.
- **Nova:** a model writes an *action* (data, endpoints, triggers, layout); behaviour is steps in a closed grammar, code behind endpoints; each action owns its state → the same action runs in any host, on a server, in a terminal, with any renderer.
- **Lowdefy:** same problem statement ("AI can generate, humans can review"); its answer is config small enough for a human to review; it has `_js` escape hatches; it shipped a v3→v4 migration guide despite "one update upgrades all apps" — strata is the working version of that promise. Lowdefy moving toward nisc is validation, not a threat.
- **amis (Baidu):** its grammar *is* its component library (fat components that fetch). Nova's grammar sits above any component library — bring your own, or have a model write the kit.
- **Correct framings (never get these wrong):** nova has handlers — they are endpoints (HTTP with vex behind it, or registered functions); streaming exists (signal + cortex + solid, validated mid-stream); nova runs in any host, moss is just the preferred one; nova's bundled components are demo primitives; `nova/agent` is a cortex agent beside nova, not a nova feature; the recommended authoring tool is Claude Code / Codex. Nisc is judged as a framework for LLMs to write, not for humans to read.

## 9. Facts and numbers to keep true

- **Models:** agents on `openai/gpt-oss-120b` on Groq, reasoning low (more reliable now, and weaker than qwen — the argument gets stronger); the profile cards on qwen 27b; routing on Jev (TypeSafe `decide()`), smaller still. The model argument: narrow problems + precise grammars + the right context → small, fast, open models are enough.
- **Census (live):** ~3,400 lines of data (app/), ~1,200 renderers, ~1,100 endpoints (model calls included), ~860 setup, ~2,360 tests; ~52–54% of the app is data. Comments and blank lines not counted. It changes with the code — never type it into a slide.
- **Deployment:** Railway, deploying `main` after CI passes ("Wait for CI" on). SSH: `ssh -p 26466 sakura.proxy.rlwy.net` — set `LYCEUM_SSH_ADDRESS` to that on Railway so slides 1 and 11 show it.
- **Grammars:** lyceum source at `nisc.nova 2`, `nisc.prism 1`, `lyceum.kit 6` (Flow and Columns added for the slides).
- **The timer's target:** "Show the last slide" lands on the last slide of the deck — currently `slide.review`; the close needs rebuilding when the deck grows.

## 10. Still to build or decide

- **Slides for the rest of the talk:** Moss + Charter (one shell per person; policy as a document that compiles into two enforcement points — which actions exist, and the scope on every query), Prism, Vex (intent + shape, compiled under a policy the model never sees, cached by fingerprint and replayed; Jev picks a stored query or a new one and the shape), the assistant (screen as data, it prepares and the person presses, the drive-through examples: Taco Bell 18,000 cups of water, McDonald's/IBM 260 McNuggets), Tide (back to the timer; a reflex is a row; skills re-read every run and burn tokens, grammars write the automation once), Strata (what happens to your data when nisc changes; grammars migrate like tables), the close (the timer fires and the deck moves on its own; the five places code lives; it's all in the folder).
- **The demos in §6** (X-ray, button, give/take, renderer switch).
- **The look switch repaints the controller** — decide whether the speaker and stage should keep a fixed look.
- **`model-check`** still seeds departments; it can't run until its fixture room is rewritten (it's the recorded measurement behind `MEASURED.md` — rewriting changes what the numbers compare against).
- **`PLAN.md`** is out of date (departments, the old talk table, VPS vs Railway, "open offers a button", starters, kit version).
- **Slides 16–19** are drafted and committed, but not yet looked at on the projector.

## 11. Learnings from the other threads

### Competition research (thread "NISC alternative libraries research")

Nothing found does all of what nisc does. The field, by which part of nisc it overlaps:

| Project | Overlaps | Notes |
|---|---|---|
| **Lowdefy** | the whole idea | YAML config "interpreted, not executed", blocks, events → actions, requests, operators, auth + roles, agents in YAML (v5.3). ~3k stars, in production for internal tools. Has `_js` escape hatches; no canvases, no per-person server shells, no grammar versioning, no deterministic query cache. |
| **amis** (Baidu) | nova + prism | The most complete JSON UI grammar (~18.9k stars, runs Aisuda). Its grammar is its component library: fat components that fetch, an implicit scope chain, JS strings (`custom`, adaptors). Frontend only, no policy, no versioning. |
| **json-render** (Vercel) | nova's catalog/registry | ~18k stars, Jan 2026. Zod catalog → registry → specs; renderers for React, Vue, Svelte, Solid, RN, Ink, PDF, email. No data layer, no auth. |
| **A2UI** (Google) | moss → terminal protocol | The agent streams a component list + data model to a client that renders from a trusted catalog. A wire protocol, not an app framework. |
| **Frappe** (ERPNext) | charter + data | A DocType is JSON defining table, forms, lists and per-role permissions; behaviour is Python. |
| **DivKit** (Yandex) | nova as server-driven UI | JSON layouts + actions rendered natively on iOS, Android, Web, Flutter. UI only. |
| LiveView / Hotwire | moss's server-held UI | Per-session state on the server, streamed output — but views are code. |
| MCP Apps | — | Sandboxed iframe HTML: the opposite approach. |

**What nobody else has:** strata (every document stamped with its grammar version, upgraded where it is read, a grammar change is a migration); vex (replay by `{ fingerprint, context }`, a generated query becomes a locked artifact, the model path strictly opt-in); ring 1 (an ungranted action does not exist in the shell — everyone else uses `visible` conditions); canvases (stack/list, composed from rows); checked partial LLM output (solid); no code strings anywhere.

**What Lowdefy can that nisc can't (yet):** ship today (nisc's npm release comes before the talk); give non-Postgres data vex's guarantees (a `fn` or HTTP endpoint reaches anything, but replay, scope and reactive reads need Postgres). YAML, password login and JS escape hatches are irrelevant or deliberately absent. A ready-made agent-chat action with cortex tool approval is 2–4 hours of work (cortex already has the approval bridge).

**From Lowdefy's pitch, worth borrowing:** its problem statement ("AI generates code fast, the maintenance doesn't scale" — quote it, show where they stop); "secure by default, public only when stated" (ring 1 already works that way); "one update upgrades all apps" — make that claim, with strata as the evidence; putting numbers on it (the census does). The frame that matters: Lowdefy makes the output small enough for a human to review; nisc makes the reviewer a program.

### What lyceum's own documents say makes nisc special (thread "Lyceum fingerprint matching for Vex queries")

1. Everything the app does is a document with a schema, run by a runtime; code only at the edges; every package is the same move in one more domain.
2. That shape is what makes models useful: narrow problem + precise grammar + context → a mid-size open model is enough; output checked before it runs, stored, replayed, migrated; a failure is fixed in the grammar's descriptions or the tool contract, not with a bigger model.
3. A model's work is compiled once and replayed: "the model is a compiler that runs once, not an interpreter that runs every time". Jev only chooses between existing queries.
4. Policy the model cannot get around: generation runs as the asker and sees only their tables; what it writes compiles under the same policy; a request cannot name another person's id; one charter compiles into two enforcement points; a model-written automation runs as `clock`, which can do one thing.
5. Per-person UI by existence, not condition: "not hidden, not disabled — it does not exist for you".
6. The UI doesn't know what draws it: the same tree as a styled page, plain HTML, a terminal, or text for the assistant.
7. An agent's context is just data: the screen, the actions with input schemas, grounding reads — under the person's policy. It proposes; the person presses.
8. Screens stay current with no pub/sub: reactive reads ("the query knows what it reads").
9. Automations without an agent loop: a reflex is a row, written once, run without a model, surviving a restart.
10. Versions of documents: a framework change is a checked data migration.
11. Proof, not assertion: live, in the folder, nothing hard-coded, measurements (bad runs and void results included) written down.

The same review found the earlier plan had **no stated problem** and ordered the talk by the author's history rather than the audience's reasons — both fixed by the current opening (origin → problem → answer → Nova).

### From the deck review (thread "Lyceum talk outline and demo")

- **A useful frame for every demo:** *easy* (this takes real work elsewhere), *only here* (falls out of the architecture), *fishy but proven* (lyceum proves it). Name the "only here" moments out loud — "try this in yours" — instead of letting them pass as effects.
- **Show real code** where it converts experts faster than a slide: the charter (10–20 lines), `behaviors.ts` (identity stamped by the engine), a vex seed entry, the assistant declarations, `query.shapes.ts`.
- **Objections to answer on the way:** "JSON UIs always hit a wall" (the census); "the client can forge an id" (it has no field for one — the engine stamps it from the session); "why isn't Claude writing React enough?" (the problem slide).
- **Measured numbers (from `MEASURED.md` — re-check before they go on a slide):** Jev routing 48/48 over three runs, ~250 ms a decision; generated queries 30/36 on gpt-oss-120b (same as qwen 27b); Groq prompt-prefix cache 1.1 s → 0.03 s, shared by the room; the tide writer ~225/240 on clean timer requests but 1/12 correcting a draft; assistant proposals 18/18, its reply text the weak spot.
- **Jev's two structural lessons:** the earlier questions go in the *state*, not the options (as options: 0.94 "new" for the identical question); a replay must agree with the shape ("How many in Archive?" matched the per-group counts at 0.73 — it wants one number).
- **Stage the live-model risk:** the opening timer uses a rehearsed phrasing ("Show the last slide in 30 minutes"); decide before going on stage whether `LYCEUM_TIMER=fake` is the fallback, not in the moment.
- **Admit the stream pacing:** the profile stream is replayed at a reading pace (~1.5 s) — say so on stage.
- **The measurement culture is a selling point:** probes written before a run, void results kept, the prompt-leak incident admitted.

