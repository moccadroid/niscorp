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

### From the first talk conversations (Sep 23–25)

- The pitch problem: people resist nisc not with hostility but with endless "but what if…" — the talk has to answer those before they are asked.
- It is not "another library that lets you do X". The cool things are side effects of an architecture shift; sell the architecture, not the features.
- AI makes it magical, but it solves other problems too (apart from generation): a charter, seeds, operators — and a simple UI can edit all of that data, because it is data.
- "Open data" sounds dangerous — with a browser shell the user holds all the data. Moss is where it becomes safe: a server-rendered shell, so all that open data can be digested however we want.
- An integration can ship its own UI and interactions into the host app — nobody else can do this.
- Two questions to answer: why was this only built now (the pieces existed — why did none of it take off?), and why is this a future of software architecture?
- Dropped then: killing the model provider live, inviting the room to attack the app. Hosting must be real; if it fails there is no talk.

## Appendix — in your own words

Your messages from the talk-planning threads, verbatim (images left out), so the background history and the reasoning survive in your words, not only in my summaries. Oldest first.

### Thread "Nisc presentation opening strategy" (Sep 23–25): why nisc, the architecture, how lyceum began

**2026-09-23**

> so... I was just asked to give a talk on Nisc ... 
>
> about 45 minutes... I'd like to do live demos... 
>
> it's always been hard when someone asks me "what are you working on", to pitch them nisc... because while I don't think it's hugely complicated... it's different... and it's a paradigm that not many people have used and understand... 
>
> so usually there's a lot of resistance... not hostility... but more the... "but... what if ... but... but..." I usually can answer all the questions... but well... it's a tedious process... 
>
> so... start by talking to me about nisc... 
>
> run me through the opening of the presentation, that lays out the land... we need some good hooks, some good underlying questions, some good answers... 
>
> I don't need a word for word play by play... I'm good at public speaking... I can make up a lot on the spot... but we need come up with a plan... 
>
> go talk to me

**2026-09-23**

> hmm... talking to you right now almost feels like talking to them... 
>
> you're getting hung up on some highlights, but you yourself with access to the code, don't fully understand the fundamental architectural shift that nisc is doing compared to classic architecture... 
>
> and that's what this is about... 
>
> the way you're trying to sell it, is ... like we've done a million times... it's yet another library that let's you do "insert cool thing here" ... 
>
> the cool thing here is a side effect of nisc... it comes for free because of the new architecture... an architecture that was practically useless pre-llm, because nobody would write their code in json... that's why we had react, typescript, java, etc... but it made the data opaque... you can't just dump a 2mb minified javascript bundle into the assistant context... you can't let an assistant modify or adapt, load, etc your UI ... not because it would be dangerous... but because that's just not how "modern" frameworks work... even if you do components everywhere... the way react code "encodes" complexity ... makes it impossible to pull apart and display each component or resulting higher order components outside... everything lives in react code, so _EVERYTHING_ gets shipped in that opaque bundle... 
>
> the other idea is "generation" .. .but it's not "generating" UI ... yes this is possible, but SPEED of models makes this prohibitive... but it makes claude code sessions pretty cool if all you can create is JSON ... that's a fairly easy to test and check thing via some linters, or scanners, or git rules... whatever... 
> no it also allows for "vex" ... and vex queries was something that wasn't easily possible before... a fully dynamic db endpoint, that is _safe_ ... is insane... 
>
> again.. it's not about selling the feature... I want to talk to people about the architecture... and why we need to think a LOT more like this... structured output is a thing llms are good at... 
>
> I believe open claw is fun, but an ultimately STUPID idea... it uses an LLM as the decision tree... to do _everything_ ... wtf? 
>
> the better solution would be to give the llm a bunch of tools (and I'm NOT talking about function calling) ... but about tools it can safely generate... like "tide" ... like "prism"... like "nova" etc... 
> it can't break anything, and anytime it _built_ something that actually works... the problem stays solved, because the resulting json is cached... from now on that vex query that took 10s to figure out? 20ms roundtrip ... done... 
>
>
> so... no... your approach was fundamentally wrong and flawed... 
>
> read the repository again... read anything you can find... and then report back and tell me what's what 🙂

**2026-09-23**

> better... but now you just took what I said, read a bit of md shit... and pretend to _understand_ exactly what I mean... by effectively regurgitating every word I just told you... feeling smug and good about it? 
> I thought so... 
>
> useless... you didn't add anything new to the conversation, you made it less interesting instead... 
>
> what I need you to do, is _read_ the actual project... _understand_ nisc... understand what it can do, how it is different, WHY it is different... 
>
> strong parts, weak parts, ... then explain yourself why these weak parts aren't weak... you just didn't read enough yet... you still didn't understand what this is... 
>
> look at the apps we built in labs... 
>
> this is what a new _ai first_ architecture looks like... where everything is data, everything is inspectable, everything can be made into an agent, read by an agent, hot swapped live etc... 
> you can deploy an entire new feature without any downtime if planned well... there are SO many cool things... 
>
> jev comes out (new system 1 model), and it perfectly slots in, as we've shown with encore... 
>
> vex feels like it shouldn't be possible... 
>
> everything is done with small but fast models... not huge juggernauts... and it all works... 
>
> do it again... you're being lazy... and we have no use for laziness here...

**2026-09-23**

> that's a lot better... it's not all of it... but it's a lot better... the best thing is, that you stepped away from "this only makes sense with ai models" ... no... ai models truly make this magical... but (apart from generation), it solves a HOST of other problems that exist... as you said... charter, seed, operator... or a simple ui can edit all that data... 
>
> "open data" sounds dangerous, but that's where moss comes in...

**2026-09-23**

> and you lost it again... STOP TRYING TO BE CLEVER here... you ALWAYS reach for the simplest and most stupid conclusions... 
>
> "open data" means "the user has access to all the data, so they could change it, a hacker could read it, change it... etc..." 
> that's true for nova with a browser shell... in most cases, this might not even be an issue... but
> _moss_ comes in at that point... with a server rendered shell... NOW this is safe, and we can digest _all_ the open data however we want... 
>
> the fact that an integration/addon can ship its own UI and interactions is _insane_ nobody else can do this... but you again fail to see this... you fail to see _why_ that is trivial in nisc, impossible everywhere else, and yet still _not_ the most important feature of nova... 
> but it falls out of the architecture...
>
> "every writer is a principal" ... again... you don't get it... the fact that every writer is a principal comes out because that's just how security should be designed in a system... but nobody set out to build "every writer is a principal" ... it's a (not the only) logical  conclusion to the architecture... as before... it falls out of it if done well and brought to conclusion... 
>
> you focused on features again... not on the architecture and _why_ it is important... 
>
> yeah... as with everything else you said in your last message... all your assumptions about when the room will flinch... you're a sycophantic bitch right now... I don't know why... benchmarks have said you'd be the cleverest model... I'm fairly underwhelmed and disappointed right now... 
>
> it seems like you're almost unwilling to think this through, and resort to kissing my ass...

**2026-09-24**

> binding everything by name is _not_ the root... but your thinking is more focused now... let's see for how long... 
>
> now investigate _each_ package... (don't worry about the showroom and labs) and explain why they exist, and how they fit into nisc... what they allow us to do, and how they enable other parts of nisc etc... 
>
> go

**2026-09-24**

> good rundown... now... if binding by name isn't the thing... and effectively your "what shows up across all ten" is true mostly... 
>
> what is nisc? why is it unique? and why did I build it?

**2026-09-24**

> better... 
>
> to answer the question of "why" this was built... 
>
> answer another question first: "why was this only built now?" ... if all the pieces kinda existed before... why did none of this actually ever take off? why is it suddenly a thing? 
> and why do I believe it is the future (or one of them) of software architecture... ?

**2026-09-24**

> you didn't just put pglite on the "look what nisc can do" page right? omg... 
>
> but generally... you're very close now... 
>
> but why this architecture? what does this actually give us that other "AI native" software can't do? I'm not looking for features, I'm looking at architecture and possibilities...

**2026-09-25**

> so.... what app would we build that shows all the cool things about nisc in a live environment... ?? 
>
> the app would be demoed during the talk, and prove the things the talk is about... 
>
> some ideas:
>
> * start the talk by creating a tide reflex for a notification in 40 minutes... we can have a countdown somewhere, or whatnot... but at a specific point in the presentation suddenly the notification comes in and sort of _ends_ the talk... in the meantime we've shown multiple things, maybe even restarted moss (to show how trivially tide survives restarts)... 
> * we have a QR code up on the slide, where everyone can join in on their phone... they all get a shell, and we can live demo pushing actions, charters, etc to them... from them... etc... 
> * things like "solid" _always_ create "ahh" and "ooh" whenver I show their showroom demos... nobody else really does streaming json into uis ... 
>
>
> many more... talk to me

**2026-09-25**

> okay... 
>
> first, yes we need to deploy this somewhere, otherwise even the QR code would be difficult... we don't want to rely on something like ngrok and shaky wifi at the venue... 
> this will be live... 
> we will have some fallbacks, but to be fair, if the hosting fails, there's just no talk... and if the AIs go down... then wtf is the purpose of this framework? then all the cool features are dead... maybe... we could think about having a fallback to switch to luna, which is hosted by openai... in case groq goes down... but... well... tough luck I guess... same goes for jev, which I want to integrate a LOT stronger into the demo app... 
>
> let's go over your ideas some more... 
> I like the idea of opening up vex via an action to the people... we'll create a demo db, with some data in there... and at some point in the talk I explain roughly what's in the db, maybe show a graph that explains the schema... and then push an action to all their phones to try it out... 
> the action is essentially just an intent input... if people want to also edit the shapes, sure but that will be tricky on a phone... if they entered via their computers, they'll have an easier time... 
>
> what I'd like to do then is put _jev_ in FRONT of vex... so jev then reads all the cached intents (we need to save them together with the cached stuff even though we don't use it for cache), and can decide if any of the current fingerprints we have (together with their intents and potentially shapes etc) already fulfills this... and then just routes either to an existing fingerprint OR to a fresh one... 
> maybe users have a normal "ask" and a separately hidden "ask fresh" button... to  circumvent the caching via jev... 
> this obviously only happens if someone sends an intent... a fingerprint always goes directly and is very fast... 
>
> splitting the room is good... we might want to play around with this... 
>
> I would integrate solid very heavily from the get go... so for example we could have the llm answer with a UI action/layout that contains multiple long form texts... we choose a slower model for this, and watch the UI build itself around the answer, while the answer is still streaming... 
>
> as you said, the entire "presentation" will be a nisc app... so our "slides" are this interactive, and each slide is an action...  or multiple actions ... working together via bus... also something that is cool... 
>
> I like that people can just push questions to a message board during the demo... I can either react live to those OR collect them at the end... I might also just auto feed them to a model that answers them 🙂 
> that model just has all the relevant md files loaded, or access to them (rag-type) so it can try to answer any question the user has and I might jump in... 
>
>
> okay... more please... what else? refine!

**2026-09-25**

> good... demo database can't be the conference, because for one, this needs to be portable, and second for many talks here, there's no predefined list of speakers and things might change very quickly...also often it's at meetups, so no "tomorrow" etc... 
> we need something else here... maybe every user when logging in gets their own profile auto generated... images, names, personality and they're encouraged to explore who they are etc... we'll just do some generation on QR scan and login... 
>
>
> I like your risks, and we should be aware of them... but I expect the rooms not to be bigger than 50-100 people and likely only a fraction of those will _actually_ type or even login... you know how lazy fucks are... 
>
> fallbacks as configurations... very much so... the app doesn't fail it just gets dumber... 
> maybe that means we _could_ kill signal in the middle... and prove that... 
>
>
> for the long-form solid answer... we don't need to do this for everyone... this happens only on the big screen... we can ask any clever model... I personally would use the newest 27b qwen model on groq and just artificially slow it down... things come in as a stream and we just buffer and replay that slowly... to make a point... 
> we could have it generate the things that we'll show in the talk... obviously pre-prompted to answer exactly like we want, with example etc... but live, and we ask "hey assistant, what should we do today?" and then it streams in the things we'll do... 
>
> red-teaming is cool... but we should be very fucking solid in our assumptions, because if someone breaks the system, the talk is over... which would be a shame... and at talks like these, maybe there aren't people better at ai and engineering than me... but definitely at security... there's some weird dudes out there 😃 
>
> okay... talk to me more... what else?

**2026-09-25**

> okay, let's drop signal killing for now, and let's drop the red teaming... those both are things that could easily break the entire things, are hard to show, and the pay-off is minimal if real, and basically the same if faked... 
>
> we'll go through the list of red-teaming things when we build it and test those anyway, but won't be inviting anyone to fuck with it... 
>
> now... I like your idea of having interconnected data for the users... let's come up with some scenarios that would be fun and interesting, and also feed into the demos we want to show... "the ravens have just earned..." etc... 
>
> I like having an agent come in and fuck with us... it could be the one asking inappropriate questions, it could be the one that does the "pseudo red-teaming" stuff... heavily pre-prompted and supervised, but feels real and interesting... 
>
> I like having the app explain itself... I think this is easily possible, and the nova part of it is something I always show people.. ."what's on my screen" is a cool thing... but "what's IN my app" is even better... 
> giving the assistant safe access to charter, actions, users etc... is very nice... 
>
> personal summaries yes... effectively all the reflex does is push the summary action, and that summary action has a clever vex query, that is personalized to each connection... 
>
>
> then... why wouldn't people be able to change part of their persona? again, we supply the action for reading it, we could have some forms in there... maybe name, maybe simple things, just so they see this is real and goes both ways and not scripted... 
>
> if there IS a game, it can't be _on_ screen... that would be a mega component which kinda defeats the open data promise... the game would be more like a collective room game... where we split the room into "houses" like harry potter, and they each get different tasks... or just click, ask questions, simple things... nobody wins at the end... maybe just our summary is constantly updated to show which house is currently in the lead... 
>
> simple stuff, nothing that would break the flow and story of the talk... 
>
> the topic of the talk is still something along the lines of "this is how software should work and look like in the age of llms" ...

**2026-09-25**

> no... they don't get split when they join... again think harry potter... a major thing is the sorting of the houses... we'll do that too... 
> we have a counter of people joining... we'll encourage people to join and if there's... let's say 10 out of 50 people... or 15 20 something... then we do the sorting... push a button, see all users being "sorted" into their houses live... which is a charter update... and a profile update... that's it... 
>
> the rest is pretty good... I think the trickster should be something we add if there's time and fun left at the end... let's not make that a central character... 
>
> I would like to show how modern chat interfaces should look like using nova... so the assistant doesn't just answer with text, and it doesn't just answer with "layouts" ... it can answer with actions... which is a thing all the other shit assistants can't do, because what they can show is just predefined bullshit from a bundle... 
> I don't need assistants to _make up_ new actions or layouts, but select and fill them with data... custom data... 
>
> like "change my name to xxx" and the assistant comes back with some text confirming it, and an action that says rename from yyy -> xxx okay? the user presses that and that's the story... 
>
> the agent doesn't do it for you, it's safe, YOU click the button, but the assistant gets you all the way there... 
>
> I also want users to feel the difference between classical websites and apps and nova built ones... where the assistant can just push action onto the screen instead of routing you somewhere... 
> show me my profile -> profile action ... or as we do in some apps the assistant replies with a goTo action... that has the loading behind the button click... 
>
> refine some more please

**2026-09-25**

> the question will not be to the users... this will all be automatic... I do like the "layout" change though for each house... 
>
> then we also need to make sure, that you don't have to logout and back in to get the changes... changes then need to be propagated to all clients... I think moss currently doesn't do this... but we have shell.invalidate() or something like that... 
>
> cool... the assistant will be granted to them _after_ the sorting... bit of ceremony, now you're in your houses... here's your headmaster/assistant... they each have a bit of a different persona, a logo, etc... and access to the assistant is being granted by me... on the live screen... 
>
> the button suddenly pops up, and then you encourage them to talk to it... 
>
> we can then add different functionality over time... so vex, maybe enable jev as a pre judge to insta-stream potential actions, etc... we'll see... 
>
> maybe vex comes first... that all depends on what the story will be... but I think the harry potter inspired thing makes sense, and allows us to show a lot of cool stuff and take the people with me... 
>
>
> we obviously need to make sure we don't hardcode anything (or little) in our app... because the app will be part of the repo at the end, and we'll point people at it, and say "look at the sourcecode, anything you saw today was real and live" ... 
>
> also... don't remember the "slides" actions... so we need a two fold screen for the presenter... a controller screen, where they can see stuff that is relevant to the demo, like countdowns, timers, insider info, "next", back, etc... 
>
> and the presentation thing... they should likely be two different principals/logins ... and this way... very clean... we just need to figure out how to affect the screen from the controller... maybe it's the same principal, we just show a different canvas? think about this... 
>
>
> let's get this into shape...

**2026-09-25**

> good...
>
> let's not touch charter, we prepare it and assign... 
>
> overall yes... 
>
> the hat will display probability, and we might add the current house balances to jev, and instruct to make a decision based on that so we end up with roughly well balanced houses at the end... 
>
>
> first... give me a name... after we agree on that, we'll create the folder and plan

**2026-09-25**

> nah... this is the app that literally _reflects_ the talk... this IS the talk... it holds all of it... 
>
> it needs a better name

### This thread (Sep 27–30): the history, the outline, the Nova reframe, slide feedback

**2026-09-27**

> great... so... what will it be about? how will it go? currently lyceum is just a bunch of nisc features... that's cute, but actually I want to talk about what makes nisc so different, special, and a proposal for future code architecture in the age of llms ... 
>
> lyceum is a proof of concept and a nice idea to put the talk into people's hands... 
>
> the things we show via lyceum (apart from just being the talk with slides etc), should be things that are either impossible/very difficult with other frameworks, OR very trivial in nisc, because of its architecture... 
>
> we currently have that "sort into rooms" concept... the idea here is to show off charter... but just sorting people into rooms is... trivial in ANY framework... that's literally just sql... 
> but charter + nova + moss allows us to gate actions... so they don't even exist on your end... 
>
> but for that we first need to introduce what actions are... etc... 
>
> or we don't ... oh my... 
>
> we also had the idea of the tide reflex being created at the beginning and timing the talk to 30 minutes... maybe? 
>
> I think the underlying concept of "everything is ultimately data" is very important, but we need to show off the why! ... 
>
> we have a running version under lyceum.moccadroid.com so the deployment is finally proven and it works well... 
>
> now... give me your thoughts... don't be weird, stay on topic... the audience is AI nerds that understand how code works etc... so... expect a tough crowd not one that's easily awed by shiny pictures...

**2026-09-27**

> hmm... I don't think this works at all... this sounds a lot like a feature demo... showing off things is nice, but there's zero proof that any of this wasn't build in react... top to bottom... 
> there's zero understanding after the talk of _what_ and _how_ people should now go out and build things... 
>
> "your card is data" means _nothing_ .... 
>
> I told you to drop this weird shtick you do, where everything is extra fancy, and you use _too few_ words to describe something... 
>
> this is engineering... a room full of software engineers, and you try to wow them with "problem -> reveal" ... your card is data? really? 
>
> point 6, is so fucking shady... this can go wrong so many times, and the generation is only part of the story... 
>
>
>
> 7. you give up expressiveness? what? did you read our code? wtf? a kit you have to build? like in _EVERY_ single app you build? the difference being that if you auto generate this via ai, this already forces you into a proper architecture with components... so... wtf? a grammar you have to evolve? wtf? NONE of these things is true... a _user_ of nisc doesn't fucking evolve its grammer... 
>
>
>
>
> this was a considerably bad take at nisc

**2026-09-27**

> this is better... still weak though, because it still doesn't drive the everything is data point home enough... 
>
> historically, everything started with my trying to get gpt3 and gpt3.5 to return json, to do a _very_ early version of nova... 
> then I build a very early version of prism... then the rest kinda followed to make this a fully fledged framework over time... 
> signal + cortex obviously... then solid followed to allow for streaming... 
>
> then vex became the first truly dynamic db endpoint proves safe queries for llms... I still think "intent + shape" is insane... the fact that this works well... is... crazy... 
>
> then the whole thing had to come together... that's how moss was born to provide an application server (based on hono for no reason other than it's lean) ... moss deeply integrates the different parts to do something very unique... you can use all parts individually, but using moss makes this really powerful... 
>
> but instantly it was obvious that an acl was required... so following the same principle again we built charter... which follows the same concept of everything is data, and with moss being the central hub and every principal having their own shell controlled by charter... the auth concept actually became a strong point for moss instead of just a feature... 
> auth via charter is stronger than in most other systems where all of this comes via another library, has to follow certain conventions, be implemented right, etc... charter and moss just work and are tight... 
>
> then we needed automation, and again, following the same principles we built tide... we will demo this, just to prove that it exists... and tide again proved something very cool... namely that even automations should be pure data... yes there is some grammar, yes there's some custom code possible, but overall most things in your project are the same and expressible via a closed grammar... 
> we'll start the talk off by asking an agent to set a timer for 30 minutes... and the model, instead of just calling a function, will write the tide reflex itself, show it, we review it, and then save it... starting the timer... 
>
> the idea here is, openclaw uses skills that the model has to "learn" everytime it does a thing... being non-deterministic, every fucking openclaw session looks entirely different... running a few million tokens through a massive model, just to check if there's something to notify me about is _insane_ ... 
> instead, if the model has grammars it can use and safely write and deploy, it can create automations, uis, etc for itself and just run those if the problem resurfaces... 
>
> finally... with all these grammars we needed something that would stop the drift... so we created strata... which uses known methods of versioning... but most importantly, it makes use of the fact that all the things it versions ... are DATA... so we can verify, check, and even migrate everything... safely... 
>
> you can't "safely" migrate code... maybe with a very good test coverage, and even then it's some sort of scary prospect to do this without human intervention... 
> but migrations are different... we've been doing it with sql for a long time, now we do it with nisc grammars... 
>
> so... that's the history... and I think we should show these off... you get hung up way too much in the "story" of the talk and the lyceum shit... 
> it's a talk first and foremost... TREAT IT LIKE A TECHNICAL TALK ... we just also provide a live demo via lyceum to drive the points home even more...

**2026-09-27**

> this is _much_ better... 
>
> we should also show nova more... I think it's one of the most fascinating pieces, because it can render into _anything_ ... we already have terminal, pure html, etc... we should show that off... for example I switch on the controller to pure html, and suddenly all their phones change and it's pure html rendering now... the few who join from their notebooks can check and prove... 
> I might bring up a terminal and show off the guest app in a terminal... or we have an endpoint where people point their terminal at... and it runs the guest app there as well... 
>
> prism is also fairly relevant, as it is one of the core underpinnings... if everything is data, then data to data transformations are paramount... we don't have to go into the grammar deeply... but it's made for llm generation, no human should write them, but as always... verification, schemas, etc... 
>
> when we get to signal/cortex... we want to emphasize that nova, prism, and vex ship their own agents... that are preloaded with grammar etc... and can just be asked to generate... that's how they all fit together... 
>
> vex then proves both of these...by using its own vex cortex agent + the prism agent... to deliver something magical... 
>
> moss doesn't need to much time, I think most people understand what an application server is, maybe the websockets and shell stuff should be explored a tiny bit... combined with charter... these two kinda go together... 
>
> tide needs some explanation, but honestly, not that much, because people understand what automations are, and if we did our job right, the whole "everything is data" point should be driven home by now, and people should be comfortable with the statement: "every reflex is pure data" etc... every fact is a row etc... 
>
> strata... needs a place... short but poignant, because I'm sure the question comes up "how do you deal with nisc updates, if I have that data everywhere in my db etc" ... strata is _a_ solution for this... and the fact that everything is data allows us to safely migrate... which is key... 
>
> overall... we can go 40 minutes... maybe we'll adapt depending on the format of the talk... one reason for the tide reflex is as well, that I have a timer always running in my controller... so I know when I should be where... 
>
>
> I agree that we should take a look at the tide agent... don't think it exists... so tide needs a very similar treatment as for example prism has... 
>
> we'll likely use qwen on groq... for fast inference... but the main point about models I want to drive home is, that all of this was built to work with oss-120b ... the idea being, if you reduce the problems, and provide proper grammar and context, you can use tiny and fast models instead of always relying on frontier models... that are expensive and slow... 
>
> also... one of the major benefits with the whole nisc architecture is, that you can at any time dump whatever you need into an agent's context... 
> we should build an agent for the phones... that replies with nova, explains what's on screen, opens actions, suggests actions, etc... one of the nova things is, that the agent doesn't "change" your name, it gives you an action that changes your name and has you press "ok" ... this way hallucinations are reduced to a minimum, and the human always stays in the loop... 
>
> finally... I think we can give people a vex action... if it fails, it fails, I don't care 🙂 that just means we need to make it stronger... but also... if our db model for this vex endpoint is simple enough, it shouldn't matter... we can on stage talk about joins, and complex queries... but our demo is 1 or 2 tables, and very simple relations... so it's unlikely that it will break...

**2026-09-27**

> we can't hack that render target switch into lyceum/moss? I'd rather not touch moss for this... 
>
> ssh tty endpoint for the win!!
>
> we'll need to work on this... but let's get to the points you raised:
>
> 1. tide agent, let's go
> 2. html + tty kits... BUT... as above, can't we hack that into lyceum?
> 3. see above
> 4. we'll need a lot more actions, but the vex action is good... we'll have to think about how to make that work, because people can't type in the shape... so... maybe we have jev decide on possible shapes? with a default shape that kinda takes everything? can we include jev into that somehow? would jev be in the action? or in vex? 
> 5. phone agent, yes... but we've built many of them by now... midas has a pretty good one... maybe check that out... keep it light for now
> 6. yeah... throw something up, I'll likely not be happy with it, but we'll iterate 🙂 
>
>
>
> decisions:
>
> 1. 120b is a great sell... but qwen is 27b ... and it's about the same speed if we go reasoning default... so... no reasoning on 27b but everything fucking works? on an opensource model? even the fucking assistant is on that? nobody else does that... 
> 2. everyone should get vex... we'll gate other things behind the rooms or departments to show different actions for different charters... 
> 3. see above... 
>
>
> go again, no code yet 🙂

**2026-09-27**

> 1. okay... maybe I'll share my controller screen at the beginning to prove I'm actually doing this... 
> 2. let's try... 
> 3. so sexy... ssh into this via your terminal and follow along :)
> 4. okay... I like... prove it to me
> 5. yes
>
>
> Decisions:
>
> 1. yes... 27b! well... jev doesn't contradict anything... it makes it stronger... because jev is even smaller and dumber 😃 as we agreed on in the vex point, adding jev as a classifier for existing fingerprints... is fire... so... no... we'll use jev... 
> 2. vex for everyone... we will do a full rehearsal ... and maybe cache or do something here... again, very likely that jev can already solve most of it... 
> 3. yes
>
>
>
> I'd say... go?

**2026-09-29**

> good one... not sure if we'll keep the departments thing... or the rename example... I think more important is that we can easily push actions to everyone... maybe instead of departments, we just make the app green for some, and blue for others, or edit their header, or push some funny fart actions etc... 
>
> let's be a bit whimsical instead of too serious... "too much story" drifts people's minds... the point at some point will be: "look nova is insane, because it can do this and that" ... together with charter, it allows is to push actions not just to everyone, but to individual people, or groups... for everyone on a laptop, go check... there is no frontend feature gate... you either have it, or you don't ... 
>
> then we give them the assistant... and there's "what's on my screen" ... which is really difficult with other frameworks... nisc gets it for free... 
>
> I think nova might actually be the center piece... and effectively it's the most impressive of the showcases... 
>
> everything revolves around actions, layouts, etc... and that principle then goes through everything... every question you might have about the system... every issue we needed to solve, follows the basic principles established in nova and prism... 
> moss is a logical conclusion to this... what other app server would you build? moss didn't bring the shell... nova did... nova runs without moss... just as well... but moving the shell to the server allows us to easily integrate AI, because we need a safe space for keys etc... and for editing... 
>
> moss is _not_ the solution for landing pages... that's pure nova... moss is the _app_ server... if you're building an app with it... 
>
> vex... it's magic... but it is again the logical conclusion of _everything is data_ ... we let an llm generate UI safely? so why not database queries? same principle, applied to another domain... and would you believe it? it works, and opens some really cool new things that weren't possible before when we just let LLMs either "write sql" or in general "have llms run _every fucking time_ a query came in"... with the nova, prism, vex approach, we can cache _everything_ ... 
>
> and... vex + nova allows us something even cooler... whether it's just vex mutations, or an endpoint... the LLM does NOT write anything anywhere... but it can prepare an action... it could even write one (though at present most models that do good UI are too slow), but it can easily fill out a form for you to press "send" on... 
>
> so even complex asks, could be filled out by an llm, and then handed over as a UI element via nova... 
>
> remember the famous example about some drive through, they used an llm, and someone ordered 10000 water bottles (I don't remember the exact example, research it)... whether that was malicious or the llm just made a horrible mistake... with nova, the person does the last step... so they can fact check... or we could have a separate decider (think jev) go over the _data_ of that nova action... because in nova _everything_ is potentially visible to the llm... we don't have to create special data packages that we inject into the context... we can just dump the entire shell... if we want to... 
>
>
> so... instead of just giving me an outline... reframe the entire talk around this... and write the first 10 slides of it... include both controller and stage, what actions will happen etc... 
>
> don't code... just write

**2026-09-29**

> okay... some general feedback... this isn't bad... the direction is good... but... 
>
> you still use "hold"... I forbade this before... it should be clear... DO NOT USE "HOLD" ... I HATE this with a fucking passion, and you keep coming back to it... PURGE IT... 
>
> then... the animation is nice... the timer thing is weird... and more importantly, a lot of the slide text reads like it should be speaker's notes... the speaker's notes on the other hand are prose... this is not how this works... either the speaker's notes are verbatim what we should say, or they're bulletpoints... now they are random prose that is almost impossible to properly read while talking (because they have a different style and length, and info is hidden inside them) ... 
> and the slides actually have a LOT of the stuff on them that should be _TALKED_ about... 
>
> then... the story is okay... but... where's Nova? it's weird how quickly you jump into things, without setting the stage... there are so many assumptions (which kinda makes sense, because you already have all the context), but reading through this... I felt lost at times... and I know all of it better than you... 
> people will _not_ follow if you don't give them anchor points... the NAME of the things we're showing is relevant... NOVA is relevant... it's the solution to the problems... 
>
> it's nice that you show some nova code... but actually, it would be nice, if we could _show_ all the things that nova does, prism does, moss with charter does, etc... literally by analyzing the screens they have... 
>
> we could push a fullscreen action that shows them the entire shell data... and then flip back... or we push xray to their phones and they can check themselves... etc... 
>
> showing the difference between the fart app and the others is entirely pointless.. that's why it's a fucking fart app... it should not be called "fart"... how stupid is that? we just want someone to do something... so we could ask that person to click the button... maybe push it to 2-3 people if that one person doesn't want to play ball... instruct them to turn up their volume then press a button... again... this is to show that we can push selectively... 
>
> again... slides 1-2 are boring... the speaker's notes here are... absent at best... this is shit... this is _EXACTLY_ the time when we can give people a bit of context about what will happen now... not going into detail etc... but explain to them what's going on... this will likely take 2-3 minutes... so people have some time... encourage people to open a laptop and connect this way too... 
>
> then the timer... why is it running? also why the fuck is all of this explained on the slide? see above for how shit this slide design is in general... 
>
> slide 4... answer one and two appear equal... but they're not... there's a lot of whitespace... we can make better use of the fact that _we_ have the better answer... it's fine if we put that on the next slide... this all feels incredibly crowded (that's a general issue with the slides you've built) ... 
>
> also... first screenshot... this header is fucking shit... the name is irrelevant, the slide number and name is 100% irrelevant, the url is relevant... and who joined... okay... but the rest... FUCK OFF... 
>
> but the headline "the problem" is tiny and easy to miss... again there's just SO much going on everywhere... 
>
> the thing that goes hardest here.. and sets everything up is the "where it started", but it comes at the end in a black box... why the fuck? 
>
> slide 6... yeah... there's animation... but really? this is what we're going with? some black boxes on a string... canvas - stack vs canvas - list ... really? this is the thing you want to showcase here? 
>
> now we're suddenly at "nova" in the header? yeah... not convinced... also... we're wasting SO much space, with bullshit... and then we just add WALLS of fucking text... 
>
> looking at this again infuriates me... stack vs list is the THING WE FUCKING show??? this can't be real... 
> you said you understood this... even I... had to read this a bunch of times before it made any sense to me... how the fuck would anyone understand stack vs list... and then again... WHO THE FUCK CARES???
>
>
>
>
> screenshot 3... this is an abomination... slide 7... it's just... whatever, I'm not even commenting on this... 
>
> screenshot 4: _every phone turns green... really... I hope you _do_ see the iron in that stupid statement in a fucking BLUE box... 
>
> "each is a row", "which role a person HOLDS", "what an action carries" ... AGAIN... FUCK THIS FUCKING LANGUAGE... 
>
>
> okay... slide 10 ... what the fuck is "Poster" and what is "Plain Html"? apart from the fact that it looks like someone threw up on my screen... it also changes MY FUCKING CONTROLLER!!! ... AND... I thought we're not using React... so what the fuck? WHAT THE FUCK IS POSTER!!! 
>
> aaaarrgh... the fucking assistant slide is so fucking stupid... why are we showing the assistant? WHY? ... if they want to see it... fucking use your phone... go to the fucking URL... 
>
> and the code on the right... is NOT what we show the assistant... that's a fantasy version of it that you just made up so it appears short and sexy... this IS... SHIT... 
>
> instead of using QA for the slide 12... we will create another action that makes more sense... 
> also... "drive-throughs" ... as the slide title? really? 
>
> oh I fucking hate all of this... so much :(
>
> last slide 13... it's okay... it looks pretty... but the bars are not properly aligned, because the text underneath is fucking shit... it also doesn't tell the correct story... what is "code - the rest" ... argh... I hate it... 
>
> fuck... 
>
>
> back to the drawing board... do NOT code... tell me why you were so close in some regards, and then just went ahead and fucked it up with a vengeance?

**2026-09-29**

> oh my... why do I have to yell at you before you do good work? can we skip that step the next time 😉 
>
> screenshot1: the name of the action is too much... send.action.ts is enough... 
>
> we have space, we should at least show what happens on ui:click... we have the endpoint, but how is it called? the ref isn't it... ref is the reference to the button... 
>
> also... the yellow on the right is a little jarring... maybe just white? or green? or blue? 
>
> slide 9, we're missing the "not implemented yet" step on the controller side... 
>
> and it should _not_ be a tab... it should be an action on their main tab... 
>
> maybe we should generally "slowly" build up their app on their phone... kinda cool... and chrome is difficult to add/remove from a UX perspective, but actions on their screen are easy... it's there, now it's not... 
>
> xray button could be a large blue button... invite them to click it... study it a bit... 
>
> slide 10, also missing the "not implemented yet" button on controller side... 
>
> ah I see, for some reason you added it to the slide... why? but removing that there leaves it empty... the core statement should be there... why are we showing/doing this? what's the point... for both 9 and 10 ... 
>
> slide 11 is more honest now (though we'll likely do react, vue here) ... but... terminal... should turn everything black, and type in the ssh url... and dare people to connect to it... 
>
> so I click react, then I click vue, and then... I click terminal... and the url pops up... 
>
> slide 12: they are _unlikely_ thinking of json-render and a2ui ... but it's good to bring them up... 
> I'm not convinced by the table... it's a lot of stuff to read... maybe add a new slide after it, that breaks some of it down... mayber 1-2 slides... take the main points of them... and make a better case with nova... instead of this... sad table... it's difficult to parse, and the arguments... aren't there... it's just a comparison... we want to show that nova is the better system... 
>
> finally slide 13:
> way better ... but... "code" isn't just code... component kit code is different from setup code is different from fn code is different from ... 
>
> I think this distinction is important... because data is data... but code isn't code... 
>
> overall... SO much better... 
>
> take my feedback and make it even better
