# The talk — everything agreed so far

The working record for the nisc talk that lyceum runs. It holds what we agreed, what is built, what is not, and the ideas we discussed and kept, parked or dropped. The deck itself is data in `src/db/seed.ts` (`SLIDES`: order, controller tools, speaker notes) and `src/app/actions/slide/`; this file is the reasoning behind it. Updated 2026-09-30.

**Read §14 first.** Sections 1–13 are the record as it was written; §14 lists what the app changed under them on 2026-09-30 (names instead of ID cards, the phone as a list, Acme as the Q&A, one decider for routing and moderation). Where they disagree, §14 and the code win.

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
- **Notes are terse cues** (keyword fragments: "charter enforces nothing → 2 checks"), at most six per slide, never enough to scroll; actions in `[brackets]`. Never sentences. (Changed 2026-09-30; was "a line the speaker can say as written".)
- **Say what is happening.** Every headline, label and line states literally what is going on, in words a newcomer gets on first read: "Another company wrote a screen for this app", not "Installing someone else's screen". No compressed, clever or slogan phrasing. Raw machine output only beside a plain sentence saying what it means.
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
8. **The rest of nisc (slides 20–30, drafted 2026-09-30):** Moss + Charter (one shell per person; who gets what is one document, checked in two places), Vex (a query is a document, replayed by name; asked in words, a small model picks), the assistant (18,000 cups of water; it prepares, you press), Tide (the timer from the start, as the row it is; automations without an agent loop), Strata (a grammar change is a migration), the end (the slide the timer puts up). Prism has no slide of its own: it is said on the Vex slide (the mapping is Prism) — its own slide was judged not worth the minute.

**Timing (estimate):** slides 1–19 run about 30 minutes, leaving 10–15 for 20–30 — about a minute a slide. Depth goes to Moss + Charter, the assistant and Tide; Vex, Strata and Prism get one beat each.

The history order of the packages (Sep 27 outline) still holds as the background logic: nova (GPT-3 JSON) → prism (data-to-data) → signal/cortex → solid (streaming) → vex (intent + shape) → moss (the app server) → charter (policy, because moss needed it) → tide (automation as data) → strata (versions, because everything is data).

## 4. The deck as built (30 slides)

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
| 9 | `slide.xray` | "Your screen is data." + blue "On your phone: X-RAY" | `tools.xray` (give / take back) | ✅ |
| 10 | `slide.clearance` | "Three of you just got a button." + orange "On three phones: PRESS" | cue `tools.button` | 🟧 |
| 11 | `slide.looks` | "The server sends data. Your phone draws it." DOM / React / Vue / Terminal | `tools.look` (3×3: phones, stage, controller × DOM, React, Vue) + cue `tools.renderers` | ✅ renderer switch; 🟧 projector terminal view |
| 12 | `slide.compare` | "Isn't this json-render?" + Vercel · json-render, Google · A2UI | — | ✅ |
| 13 | `slide.behaviour` | "What a button does": json-render "Calls a function in your app." vs Nova "Is data." + the real trigger | — | ✅ |
| 14 | `slide.state` | "Where the state lives": "In your app's store." vs "In the action. So it runs anywhere." | — | ✅ |
| 15 | `slide.census` | "Is JSON enough for a real app?" Chart: Data / Renderers / Endpoints / Setup / Tests (lines of code, comments excluded, counted live by `server/census.ts`) + share (~52–54%) | — | ✅ |
| 16 | `slide.worst` | "What is the worst a model can write?" | — | ✏️ |
| 17 | `slide.broke` | "We tried to break it." Leak: Held (green) · Crash: Two holes · Explode: Broke (orange) | — | ✏️ |
| 18 | `slide.loop` | "Three lines froze the server." The echo action beside: found by reading it; limits: 64 hops / 1,024 per chain, 256 levels, a timeout on every endpoint and query | — | ✏️ |
| 19 | `slide.review` | full blue: "So — Review the result, not the code." | — | ✏️ |
| 20 | `slide.moss` | kicker Moss, "Your shell runs on the server." + a blue Flow across the bottom: your shell on the server ↔ your phone, lanes "What to draw" / "What you pressed" | — | 👁 |
| 21 | `slide.charter` | "Who gets what is one document." across the top; blue "Charter"; two real roles from `charter.ts` (member, clock — clock marked) | — | 👁 |
| 22 | `slide.twice` | "Checked in two places." orange: 1 · Your shell — Which actions exist. / blue: 2 · Every query — Which rows it reaches. + the real `questions` rule from `behaviors.ts` | — | 👁 |
| 23 | `slide.vex` | kicker Vex, "A query is a document too." the real `members/counts` entry (intent + shape marked) beside, in yellow, what the strip sends: `{ fingerprint: 'members/counts', context: {} }` | — | 👁 |
| 24 | `slide.words` | "Asked in words." Asked before: Replayed. No model. (green) · New: Written once, then stored. (blue) · Past your policy: Refused, with why. | assistant | 👁 |
| 25 | `slide.water` | "18,000 cups of water." on orange; kicker "A drive-through AI took this order, 2025" | — | 👁 |
| 26 | `slide.press` | "It prepares. You press." The assistant: Reads your screen. Opens an action, filled in. / orange: Only you — Send | cue `tools.order` | 👁 (demo 🟧) |
| 27 | `slide.tide` | kicker Tide, "The timer from the start is a row." the saved timer's reflex document, LIVE (`room.timer` → `timers/document`, `effect` and `as` marked) + green countdown "Fires in" | — | ✏️ |
| 28 | `slide.once` | "Automations without an agent loop" An agent with a skill: Reads its instructions again, every run. / green: A reflex: Written once. Runs with no model. | — | ✏️ |
| 29 | `slide.strata` | kicker Strata, "A grammar change is a migration." + this app's real `strata.lock.json` + blue "A stored document — Upgraded where it is read." | — | ✏️ |
| 30 | `slide.end` | "It is all in one folder." + `apps/lab/lyceum` + blue "Questions — On your phone, under Q&A." The timer's target. | — | ✏️ |

👁 = looked at on the projector (1600×900) and fixed until it read right. 27–30 could not be looked at yet: another session was rewriting the kit and the page did not load.

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
- **11 Looks:** phones to React (same trees, same stylesheet, the corner says React; laptops: inspect the root element); stage to Vue — two frameworks at once; one row changed on the server; all back to DOM; terminal: the command is on screen — connect.
- **12–14:** json-render and A2UI are good and point the same way; they describe a view, the host keeps state and code; in Nova behaviour is data and the action keeps its own state — so it runs on a server, one shell per person, and any renderer can draw it.
- **15 Census:** the usual objection; this app is the slides, projector, controller, phones, SSH, assistant, timers; half of it is data; the code is in three places, each about a third the size of the data; counted live, comments don't count.
- **16–19 Safety:** see §7.
- **20 Moss:** everything tonight runs on one server; each of you has a shell there; your phone gets what to draw and sends back what you pressed; that is why only three phones got the button; laptops: the websocket frames.
- **21 Charter:** one document; roles list actions and data as patterns; member is you; clock is what the timer runs as — it can move the slide, nothing else, whatever a model writes; giving an action is a row.
- **22 Two places:** the charter enforces nothing, it compiles into two checks; your shell (not hidden, never sent); every query in the engine (stamped from your session; a request has no field for someone else's id); usually three places, three rule sets.
- **23 Vex:** this query is the joined count; intent, shape, query; the screen sends only its name; reactive — answers again when someone joins; policy applied in the engine; reshaping is Prism, a function as data, stored with it.
- **24 In words:** ask the assistant; a small model (Jev) only picks: asked before + which shape; replayed, or written under your policy and stored, or refused with why; "a compiler that runs once, not an interpreter that runs every time".
- **25 Water:** Taco Bell 2025, 18,000 waters; McDonald's/IBM 2024, 260 McNuggets; the model was not the problem — it was allowed to act.
- **26 Press:** it reads your screen, opens an action filled in, cannot press; [give everyone the order form]; ask for 18,000 waters; you see it, you don't press; a second small model could check it first.
- **27 Tide:** back to the timer; as stored; runs as clock — saving stamped it, not the model; no model running; survives a restart.
- **28 Once:** an agent with a skill (OpenClaw) reads its instructions every run, tokens every run, different every run; here a model wrote it once, I read and saved it, it runs with no model.
- **29 Strata:** what happens to all the documents when nisc changes; grammars have migrations; the check refuses a change without one; documents carry their version, upgraded when read; newer than the reader is refused; the lock moves only after a check.
- **30 End:** [if the timer put it up] that was the timer, as clock, no model; each part a document a program can check; it is all in one folder; questions under Q&A.

## 6. Demos: built, not built, and ideas

**Built and working:** joining + streamed profiles; the register; the timer (tide reflex written by gpt-oss-120b, read, saved, counting down; `notify` effect); the renderer switch (each surface — phones, stage, controller — drawn by nova's DOM adapter, React or Vue, all in the one stylesheet; React/Vue kits put their name in the corner; the plain kit is gone); the SSH terminal (`ssh -p 26466 sakura.proxy.rlwy.net` on Railway); Q&A on phones; the assistant with vex queries; the census.

**Agreed, not built (hatched cues on the controller):**
- **X-ray** — a first version (built 2026-09-30) was REMOVED the same day: it listed each action's data (later each whole action as JSON) on a separate page, so it did not show what is on the screen — pressing Q&A showed the same thing, the actions actually on screen were not there, and raw layout JSON with its conditionals is unreadable. Being redesigned. What stays from it: the phone's bar is the phone's own buttons (a person's granted list, `inputs`), every action exists once, the name across the top is the phone's. REBUILT 2026-09-30 as a mode of the real screen: given on stage (a grant row per member), it is an X-ray switch on the phone's bar. On, every action on the screen is outlined with its id, nested the way the screen is composed (all three renderers draw the box at the ActionSlot boundary; the switch sets an `Xray` in the frame). Tapping an id opens that action over the screen as its JSON document — the definition as the shell runs it, with its live data. Open Q&A and the outlines are Q&A's actions. `xray-check`.
- **The button** — given to three random people (a few in case one doesn't play along), on their main screen; pressed, it plays a sound. Not called "fart". The point is selective pushing: some have it, the rest were never sent it.
- **Renderer switch** — React and Vue BUILT 2026-09-30 (nova `adapters/vue` + moss `terminal/vue`; lyceum `react.kit.ts`/`vue.kit.ts`; a `renderers` row per surface). Still to build: Terminal — the projector goes black and types out the SSH command, daring people to connect.
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
- **The timer's target:** "Show the last slide" lands on the last slide of the deck — now `slide.end` (checked live 2026-09-30: gpt-oss-120b picked `slide.end` for "Show the last slide in 30 minutes"). **Timing risk:** set at ~minute 5, it fires at ~minute 35 and skips whatever is left — the talk has to reach slide 29 by then, or the phrase becomes "in 35 minutes".

## 10. Still to build or decide

- ~~Slides for the rest of the talk~~ (drafted as 20–30; kept for the reasoning): Moss + Charter (one shell per person; policy as a document that compiles into two enforcement points — which actions exist, and the scope on every query), Prism, Vex (intent + shape, compiled under a policy the model never sees, cached by fingerprint and replayed; Jev picks a stored query or a new one and the shape), the assistant (screen as data, it prepares and the person presses, the drive-through examples: Taco Bell 18,000 cups of water, McDonald's/IBM 260 McNuggets), Tide (back to the timer; a reflex is a row; skills re-read every run and burn tokens, grammars write the automation once), Strata (what happens to your data when nisc changes; grammars migrate like tables), the close (the timer fires and the deck moves on its own; the five places code lives; it's all in the folder).
- **The demos in §6** (button, give/take for three people, the projector's terminal view).
- ~~The look switch repaints the controller~~ — decided 2026-09-30: every surface has its own row on the switch, the controller included.
- **`model-check`** still seeds departments; it can't run until its fixture room is rewritten (it's the recorded measurement behind `MEASURED.md` — rewriting changes what the numbers compare against).
- **`PLAN.md`** is out of date (departments, the old talk table, VPS vs Railway, "open offers a button", starters, kit version).
- **Slides 16–19** are drafted and committed, but not yet looked at on the projector (18's code is now bottom-left instead of centred line by line). **27–30** likewise.
- **The order form** (slide 26's demo, cue `tools.order`): an order action given to everyone; the assistant opens it filled in; nobody presses. Not built.
- **npm:** all of niscorp is open source and public on GitHub (`github.com/moccadroid/niscorp`, on the end slide as a QR + words + `apps/lab/lyceum`); what is missing is the npm release. The end slide's note says "not on npm yet" — change it when it ships.
- **Prism** has no slide; say whether it needs one.

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

## 12. The architecture, as you approved it (Sep 23–25)

The answers from the first thread that you accepted after several rounds, verbatim, with your reaction to each. This is the architectural argument the talk sells; the talk's slides should never contradict it.

### What React taught us — composition in control flow vs. in data

*You: "that's a lot better... it's not all of it... but it's a lot better... the best thing is, that you stepped away from 'this only makes sense with ai models'"*

> I went back over what you told me and took it more slowly. Here's where I've landed.
>
> Your point about React wasn't really "code is opaque". It was that **composition lives in control flow.** A higher-order component isn't a thing; it's what happens when a function runs. The structure of the app only exists while the process is executing, inside the bundle. So the only moment the app's shape can change is the build, and the only one who can change it is whoever runs the build.
>
> In nisc, composition is data too: which actions sit on which canvas, which fragments wrap them, which fingerprint feeds them, which reflex fires. That moves the boundary. **A running nisc system is open at its seams.** Something can read it, recompose it and extend it *while it runs*, and it doesn't matter whether that something is the charter, a seed, an operator, Jev or the 120b agent.
>
> That's why Jev fits without anyone designing for it. Encore doesn't ask Jev to generate anything; it asks Jev to **compose**, choosing which existing pieces mount. Once composition is data, it becomes a selection problem, and selection is exactly what a 100 ms model is good at. In a React app there's nothing to select from at runtime, because the composition was compiled away.
>
> The same thing explains "the problem stays solved". A classic system only gains capability through the build. Here, when something works out a new read, a new screen or a new reflex, the result is a new piece in the catalog. So the fingerprint cache isn't really a performance feature. **It's the system's record of what it has learned to do**, and it grows through use rather than through deploys.
>
> That also answers my own metadata-platform question. Salesforce and XAML were *configuration*: people authoring in an editor, the running system still sealed, code as the way out. What's different here is accumulation. The grammars are targets that something can author against *at runtime*, and whatever works gets kept.
>
> So the room's mental model — software changes at build time and is fixed while it runs — is the thing to break. Is that closer to what you mean? Or is it still off?

### Each package: the problem it exists for, what it is, what it makes possible

*You: "good rundown..."*

> I've now read the design docs of all ten packages, and the source of the ones I hadn't gone through before. Here is each one: the problem it exists for, what it is, and what it makes possible in the others. I'll start with the packages that face the model, then the concern languages, then the one that composes them.
>
> ## signal: what a model says conforms, or you get the evidence
>
> **Why it exists.** Every other package treats model output as untrusted input. Something has to hold one contract across providers that each fail differently, and signal is that thing: "what comes out conforms to the schema that went in, on every provider — or you get a typed failure with evidence."
>
> **How it holds that contract:**
> - A provider's quirks are a registry row plus a wire strategy, never an `if (groq)` branch.
> - Repairs only count if they pass the caller's schema.
> - What a model can do is measured per model and recorded with the date it was measured.
>
> **`decide()` adds a second kind of model.** A decision model returns probabilities over options and writes no text. Its gate is derived from the questions it was asked. A chat model can stand in for it, but its answers are marked `calibrated: false`.
>
> **What it makes possible.** A model becomes a replaceable part. Cortex's loop is built on `step`/`stepStream`, and Jev was added as a new kind of adapter with no changes above signal.
>
> ## solid: only valid state exists, even mid-stream
>
> **Why it exists.** Structured output arrives as partial JSON, and the rest of the stack only accepts valid objects.
>
> **How it works.** Solid reverses the usual order. The state is a valid object from the start, built from schema defaults, and streamed fields overwrite it as they arrive.
> - Parsing is incremental, so each chunk costs only its own length.
> - Structural sharing means `===` tells you which subtree changed.
> - Fields are finalized left to right, following the order the model writes them.
>
> **What it makes possible.** A model's answer (an envelope, a layout, a form value) can be rendered while it's still being written without ever passing through an invalid state. It extends "only valid data exists" to the moment of generation.
>
> ## cortex: the model as an author with a typed exit
>
> **Why it exists.** Agents have to be something the rest of the stack can consume.
>
> **How it works:**
> - One tool loop, and every agent returns `{ response, data, reasoning }`, with `data` validated against a schema.
> - Context comes from **producers**, so knowledge is owned by whoever owns it: a library exports its own guide, a tool carries its own guide, an app exports its shared facts. Nothing is summarised into a prompt on someone else's behalf.
> - Gates run before every tool call, a run is an event stream, and suspended runs can be serialised.
> - v2 deleted v1's plan interpreter and rules engine, and the doc records why.
>
> **What it makes possible.** A library can offer "author me" as an agent whose output schema is *its own grammar*: `vex.query`, prism's mapping agent, nova's layout agent. The model's target language is the library's schema, so no library owns any model plumbing.
>
> ## prism: functions as data
>
> **Why it exists.** Every place two data shapes meet needs a function, and a function is code. Prism is where derivation lives: shaping, formatting, branching.
>
> **How it works.** About 50 operations as JSON, no code execution, compiled to a fingerprinted IR.
>
> **What it makes possible.** Every other package can hold a function without holding code:
> - **nova** doesn't know prism. An endpoint's `request`/`response` are opaque configs run by a `transform` the host injects.
> - **vex** stores a prism IR as the mapping of every cached entry, so turning rows into a shape is replayed, not recomputed.
> - **tide**'s templates (`effect.input`, `when`) are prism.
>
> Because the mapping agent's output is an IR, a mapping a model wrote once is cached like any query.
>
> ## vex: one endpoint, and a store of named questions
>
> **Why it exists.** Data access is normally a hand-written endpoint per question. Vex replaces that with one closed query grammar, a deterministic compiler, and a fingerprint store of questions that have already been answered.
>
> **How it works:**
> - Scope is applied inside the engine on every run, so a stored question doesn't belong to any particular caller.
> - Writes are replay-only in a narrower grammar, and scope stamps identity onto them.
> - Discovery describes itself: entries, their derived context signatures, and their effects.
>
> **What it makes possible:**
> - **nova** actions reach data by fingerprint, with no fetch code.
> - **charter**'s `data` section compiles into vex's `ScopePolicy`.
> - **tide**'s selections are vex replays run under the reflex's own principal.
> - **tide**'s facts come from vex's write observer. Vex is the one choke point every write passes through, and that's what makes every write observable.
> - **moss** derives its entire data layer from the entries.
> - Derived signatures let an integration or an agent find out what to call without being told.
>
> ## nova: UI as a behavioural contract held in shell state
>
> **Why it exists.** In a normal UI stack, behaviour and state live in component code. Nova puts all of it into the shell's data.
>
> **How it works:**
> - The unit is the **action**: data, layout, endpoints, triggers, lifecycle, and an `input` schema, which is its public contract for anyone who opens it.
> - A shell holds canvases, and canvases hold instances, either stacked or as a list.
> - Layouts are JSON over a registry of components that know nothing about the domain.
> - Fragments are composed when an action is loaded.
> - The renderer outputs framework-free `RenderNode[]`, and adapters turn that into React, DOM, TTY or Ink.
>
> **What it makes possible.** The action is the unit everything else deals in:
> - charter grants it;
> - moss serves it;
> - integrations ship it;
> - Jev selects it;
> - loom compiles into it;
> - devtools are built out of it.
>
> Because the shell is data, it can run on a server and be read by anything (`reflect`). The TTY adapter's numbered list of interactive elements is a complete set of actions an agent can take.
>
> ## tide: *when*, as an artifact
>
> **Why it exists.** The most consequential code in an application (billing, reminders, dunning) is normally scheduled imperative code that sits outside every guarantee.
>
> **How it works:**
> - A reflex is JSON: a trigger, an optional selection, and exactly one named effect. There is no run body.
> - Multi-step flows are chains through facts.
> - The ledger is four tables, and idempotency is enforced by unique constraints.
> - The wall clock is never read.
> - Tide is blind to identity, but every run records who it ran `as`.
> - Five seams are left for the host to fill: store, select, transform, effects, identity.
>
> **What it makes possible.** Tide owns none of these; each comes from another package:
> - its selections are vex;
> - its templates are prism;
> - its facts come from vex's write observer;
> - its effects are the only code, one function wide, and their writes are derived from the vex mutation behind them.
>
> An automation becomes a tenant's row: armed by writing it, previewable before it runs, and governed by the charter as a principal.
>
> ## charter: one policy document, compiled, never enforced
>
> **Why it exists.** The usual alternative is route guards, component wrappers and row-level security: three security models in three places.
>
> **How it works:**
> - Roles select glob patterns over opaque string universes (actions, data verbs, layout variants).
> - A verifier refuses anything incoherent: an unused deny is an error, and there's an audit of what each role can reach.
> - The engine is 376 lines with no dependencies.
> - It never enforces anything. It compiles into each target's own native contract: nova's action map, vex's `ScopePolicy`, layout variants.
>
> **What it makes possible.** Moss's per-principal resolution, and "what can this role reach" becomes something you compute (via nova's `reflect`) rather than something you audit by hand.
>
> ## loom: an editor for anything that has a schema
>
> **Why it exists.** Every artifact in the stack is defined in Zod, so an editor for any of them can be compiled rather than built by hand.
>
> **How it works.** Zod schema → field model → nova action plus layouts, rendered through abstract roles such as `loom:text`, with a plugin host around it.
>
> **What it makes possible:**
> - People edit the same artifacts models write: vex queries, prism configs, nova layouts, moss configuration fields.
> - It's built on nova on purpose, so it's also the test of nova's expressiveness. The doc's rule: when nova can't express something, grow nova.
>
> ## moss: the trusted side
>
> **Why it exists.** The other nine are self-sufficient but have no home. Something has to hold the trusted side: where definitions and policy live, where shells run, where each principal is resolved.
>
> **How it works.** It takes a manifest (artifacts) and a runtime (environment) and provides:
> - per-principal resolution through charter;
> - a data layer derived from vex entries, with locked endpoints and compiled policies;
> - durable nova shells on the server, streamed to thin terminals;
> - the function seam, where the code edge lives, per session;
> - the tide driver, fed by vex's write observer;
> - integration intake;
> - a generation pointer so multiple processes stay in sync;
> - telemetry.
>
> **What it adds.** No vocabulary of its own. Reads and writes are vex, UI is nova, policy is charter, time is tide. It fills the seams the others left open, and running on the server is what keeps all this data open to the system while sealed from the client.
>
> ## What shows up across all ten
>
> Three patterns hold in every package. None is an extra feature on top.
>
> **1. Each concern is a closed language plus its runtime, and the languages nest inside each other as opaque payloads.** A nova action holds a prism config, which holds a vex fingerprint. A tide reflex holds a vex selection, a prism template and an effect name. A vex entry holds a prism IR. No package interprets another's language. The host plugs the interpreters into seams: nova's `transform`, tide's five seams, vex's hooks, charter's universes and compilers. That's why each package works standalone and why they compose.
>
> **2. The schema is written once and read everywhere.** The same Zod schema is the validation, the model's instructions (through `.describe()` and JSON Schema), the editor (loom), the public contract (an action's `input`, vex's derived signatures), and the docs.
>
> **3. Models are kept out of the core.** Vex's engine has no LLM code. Nova's design keeps LLM tooling out of its core. Agents live in separate subpaths. The whole system runs without a model, and models plug in as authors at the hooks.
>
> I'm not going to guess at the root again; you said binding-by-name isn't it. Where in this does it sit for you?

### What nisc is, why it is unique

*You: "better..." — then asked why it was only built now*

> Here's my own answer.
>
> **What nisc is: an application where every behaviour is written in a language whose properties can be decided without running it.**
>
> Code gave that up. Once behaviour lives in a Turing-complete language, every interesting question about it is undecidable in general. Rice's theorem says that for any non-trivial property of what a program does, no general procedure can tell you whether an arbitrary program has it. "Does this screen ever read that table?", "What can this role reach?", "Does this change break anything?", "What does this job write?" For code, the only honest answer is "run it and see", or "read it and trust whoever wrote it". So the system can't know itself, and neither can anything else: not the policy, not a reviewer, not a model.
>
> Nisc moves behaviour into closed languages where those questions have answers you can compute:
> - `discoverEntities` tells you every table a query touches.
> - `mutationEffect` tells you what a write writes.
> - tide *derives* what a reflex writes instead of trusting a declaration.
> - the charter's closure audit computes what a role can reach.
> - an action's `input` schema is its complete public contract.
> - `lintMutation` refuses an unbounded write before it's ever stored.
>
> The places where something undecidable is genuinely needed (an effect handler, a `fn:` endpoint, a component) are kept to the edges, each one function wide.
>
> **Why it's unique.** None of the individual pieces is new: JSON UI (Block Kit, server-driven UI), query languages (GraphQL, Hasura), policy as data (OPA, Cedar), workflows as JSON (Step Functions), transform languages (JSONata). Every one of those systems keeps one layer in code, the **glue**: the server that decides which JSON to emit, the resolvers, the handler that wires a block to an action. The glue is where composition lives, so it's also where the system stops being knowable. Nisc is the only one I know of where the glue is data too: the manifest, canvases, seeds, fingerprints inside endpoints, languages nested inside one another. There's no Turing-complete layer holding the whole thing together, so the whole application can be decided, not just its parts.
>
> That's why the things you listed come out without being designed:
> - **Every writer is a principal:** the only way to act is through an interpreter that has to resolve *for whom*.
> - **An integration can ship its own UI:** an artifact can be checked on intake, so where it came from stops mattering.
> - **The open data is safe:** anything can be checked before it's accepted, and moss keeps the checking on the trusted side.
> - **Small models work:** choosing inside a space you can enumerate is a small problem.
> - **Solved problems stay solved:** two equal artifacts are the same artifact, so a fingerprint is an identity.
> - **Hot swap:** you verify before you adopt.
>
> **Why you built it.** I can only infer this. My guess is you wanted software that something other than its author can take part in: read it, change it, run it, extend it while it's live, whether that's a model, a customer, a policy or an operator. You found that what blocks this isn't how capable the models are. It's that code is unknowable to anything except running it. And the tax got paid over and over: every app rebuilt the same glue, and every "let the model do it" became either unreviewable code or a model doing every step itself.
>
> Two caveats so I'm not overselling "decidable":
> - Nova's message channels can form cycles (emit → listener → emit).
> - The effect and function edges are ordinary code.
>
> The claim is that the undecidable parts are few, named and fenced, not that there are none.
>
> Is that the thing, or is it still one level short?

### Why it was only built now — and why it is a future of software architecture

*You: "you're very close now..." — then asked what it gives that other AI-native software cannot*

> **Why none of it took off before.** 4GLs, CASE tools, model-driven architecture, BPEL/BPMN, rules engines, XAML, low-code and server-driven UI all tried to make applications out of data, and they all died the same way: **the author was a person.**
>
> A closed language is expensive for a person to write in. You can't abstract, you can't compress, it's verbose, and the moment the grammar doesn't fit you hit a wall. So people escaped into code, the escape hatch grew, and the data layer shrank to a leftover. Expressiveness wins when a human writes everything, because it's how a human saves effort.
>
> What they were giving up in return (a system whose behaviour you can decide without running it) had almost no one to benefit from it. The only thing that ever read the whole application was its author, and the author already had the code. So the trade was high authoring cost for a property nobody could use, and code won every time.
>
> On top of that, the grammars belonged to vendors. When the grammar didn't fit, you couldn't extend it; you could only leave.
>
> **What changed:**
> 1. **Writing closed languages stopped being expensive.** Models fill a constrained schema more reliably than they write code, verbosity costs them nothing, and structured output became dependable in the last year or two. The authoring cost that killed every earlier attempt is close to zero now.
> 2. **Someone showed up who can use decidability.** For the first time there's a reader that isn't the author, operating at runtime: a model choosing, composing, extending. It can only do that safely in a space it can enumerate and a host can check.
> 3. **Trust flipped.** You trusted a human author and reviewed their work. You can't trust a model author, so you have to check the *artifact*. Checking needs a language where the questions can be answered. What used to be nice-to-have is now required.
> 4. **The economics changed.** Model calls are slow and cost money. An artifact you can check is also one you can cache, so you author once and replay forever. Code generated at runtime can't be cached safely, so every run pays again.
> 5. **The groundwork now exists:** Zod and JSON Schema everywhere, a Postgres that runs in the browser, and decision models fast enough to choose while someone is still typing.
>
> The escape-hatch spiral doesn't repeat either. When a grammar here can't express something, you grow the grammar, because you own it. And nobody writes artifacts by hand, so verbosity is never the reason to escape.
>
> **Why I think you believe it's the future:** the share of software that gets changed by someone other than its author will keep growing: models, customers, integrations, operators, other systems. A code architecture can only accept a change through human review and a deploy, so the rate of change is capped by how fast people can review. And the flood of generated code is making that review both more expensive and less reliable. An architecture made of checkable languages accepts a change by *verifying* it, so the limit on change becomes verification, which is machine-speed.
>
> Code doesn't disappear; it shrinks to the core: interpreters, edges, components. The application becomes data that anything with permission can read and change while it runs.
>
> Where would you push back on that?

### What this architecture gives that other "AI-native" software cannot

*You moved on to designing the app (lyceum) from here*

> On PGlite: yes, I did, and it had no business being there. It's a convenience, not a reason. Dropping it.
>
> **What other "AI-native" software is built like.** There are three shapes, and in all of them the model stays outside the application:
> - **The model as the runtime** (OpenClaw and agent frameworks). Every behaviour is inference. Nothing builds up over time, nothing can be checked before it happens, and safety is a fence around something nondeterministic.
> - **The model writing code** (v0, Lovable, Bolt). The model takes part once, at build time, and what it produces is another sealed application. Changing it means regenerating, reviewing and deploying.
> - **The model beside the app** (copilots, function calling). It sees the application only through a second, narrow interface of hand-written tools. Anything it can do, someone had to build a tool for. It can't see the screen, compose the UI, or extend anything.
>
> **What nisc does differently: the model and the application share one material, and the model still doesn't run it.** The artifacts the app is made of are the same things a model reads and writes. The runtime that executes the app is the same one that checks whatever the model produced. There's no separate "AI interface", because the application *is* the interface. That opens up possibilities none of the three shapes can reach:
>
> - **Intelligence can go anywhere, at any grain and at any time.** One query, a screen, a reflex, which pieces are composed right now. At build time, at runtime, or on every keystroke. Where a model sits becomes a deployment decision: Jev on composition, a large model on authoring, no model on replay.
> - **The application doesn't depend on any model.** Lyra runs with none. In the other three shapes the prompt *is* the application, so it's built around one model's abilities and dies without it. Here the app gets better when you drop a better model into a seam, and keeps running when you remove it. AI is added on top, not load-bearing.
> - **The system learns without training.** What its models work out gets checked and becomes part of the application: stored, readable, revocable. That memory lives in artifacts you can read and diff, not in weights or a prompt history.
> - **Trust can be given in steps.** Every contribution is checked before it takes effect, so a model's reach can be granted the same way a person's is (the charter's rings) instead of all or nothing.
> - **Building and running stop being separate moments.** Humans, models, integrations and operators all change the same material under the same rules while it runs. Nobody is special-cased, so working together is how the system is built, not a feature added later.
>
> In one sentence: the others make AI either the engine or the author of a sealed thing. Nisc makes it a participant in the application's own material, with a deterministic runtime underneath.

## 13. Two mechanisms worth knowing for the talk

**How Jev routes a request (vex queries from words).** The assistant hands vex an intent. `routeQuery` (`server/assistant/vex-query.ts`, over `server/querying.ts`) asks Jev (TypeSafe `decide()`) one question with two answers: does an earlier request want the same information, and which of the authored shapes (`app/vex/query.shapes.ts`: a list, one number, counts per group, people) does the answer take? A match whose stored shape agrees is **replayed** (no model); anything else is **generated** by vex's agents on gpt-oss-120b under the person's policy, or **refused** with the reason. Jev never writes a query — it only chooses. Two lessons, both structure rather than prompting: the earlier requests go in the decision's *state*, not its options (as options, the identical question scored 0.94 "new"); and a replay must agree with the shape ("How many in Archive?" matched the per-group counts at 0.73 — it wants one number). Measured 48/48 over three runs, ~250 ms a decision (`MEASURED.md`).

**"Iframe but native" (safety research).** An integration's UI rendered with a different kit inside the host app, without an iframe. Proven headlessly (21 of 21 assertions, in the uncommitted research worktree `.claude/worktrees/safety-research`), not built into lyceum. The design split it arrived at: **for the talk**, a third kit shipped by the host and chosen by namespace; **for real third-party integrations** (Midas), the host's own components with the integration's style tokens as data — because a kit is code, and loading someone else's code in the browser defeats the point of the architecture.

## 14. 2026-09-30: what changed

The app changed under the record above. Nothing in §1–13 is rewritten; this is what no longer holds, and what holds instead. Each line is true of the code on `main`.

**The app**
- **No ID cards, no profiles, no Qwen.** A person chooses a name at the door: one of twelve offered (an adjective and an animal, 50 × 50, `server/names.ts`), or one they type. Nothing else about them is written. `members.name` is unique; `title` and `quirk` are gone (migration 15). Solid's streaming demo is gone with it.
- **One decider** (`server/decider.ts`): Jev with `TYPESAFE_API_KEY`, gpt-oss-120b without. It answers every narrow question: which earlier query a request matches and in which shape, and whether something a person wrote may be shown. One yes/no question for moderation; yes at 0.5 and above.
- **Moderation.** A typed name is judged at the door; refused, it goes to `refused_names` (kept, never shown) and the person gets an offered name. Every question is judged by the `moderator` principal, which writes `question_verdicts` — a table of its own, so nobody can approve their own question. The speaker reads every question and every verdict; the projector only the fit ones (see "Later the same day" below). Questions are not edited or deleted.
- **The phone is a list canvas.** The name across the top; under it `body`, a list of the actions the person has that belong on a phone, one block each: the assistant, every integration approved for members (`ext.member.*`), the X-ray once given (`server/phone.ts`). No tabs, no bar. A grant or an install rebuilds the shell and a new block appears — "build up their app slowly" (§6) is now how the phone works.
- **The Q&A is Acme** (`apps/lab/lyceum-vendor-demo`): a third party's integration, a static file on GitHub Pages, installed on "Checked in two places" with the controller's `tools.integrations`. The broken twin is refused with its loop's path; Acme is accepted, pending, approved, then on every phone, drawn with lyceum's kit. Lyceum's own Q&A actions are gone. `questions.send` stays only as the action slide 8 shows as code; nobody has it. This is the "iframe but native" idea from §6, done through the real intake.
- **The X-ray** is a block on the phone's list with a switch, not a button and not on a bar.
- **Roles:** `registry` is gone; `moderator` replaced it. `member` is `['member.*', 'query.*', 'assistant.*', 'ext.member.*']`.

**The deck** (notes in `src/db/seed.ts`)
- **1 Title:** "When you join, you choose a name: tap one, or type your own." — no model writes a profile.
- **2 Register:** names people chose; one typed by hand was checked before it went up. The streaming line is gone.
- **8 An action:** the form shown is not on your phone yet; one comes later in the talk, from outside the app.
- **9 X-ray:** "The X-ray is on your phone now. Switch it on."
- **21 Charter:** the excerpt shows the member role as it is now, `ext.member.*` included.
- **22 Two places:** now carries the Acme demo — install the broken one (refused, the loop named), install Acme (pending), approve (on every phone); each question goes through the same small model that routes queries, and one not fit to show is kept and never shown.
- **30 End:** "Questions: on your phone, in Acme."

**§9, corrected:** models are gpt-oss-120b for the agents and the decider (Jev) for routing and moderation — no qwen. Grammars: `nisc.nova 2`, `nisc.prism 1`, `lyceum.kit 8`.

**Later the same day: Acme on three seats.** Acme's bundle ships three screens and says where each goes (moss `attachments`), against the seats lyceum offers (`app/attachable.ts`); intake refuses anything else. `ext.member.acme.ask` on every phone. `ext.speaker.acme.questions` on the controller, a region of its own on every slide: every question, its sender, and fit / not fit / not checked yet. `ext.stage.acme.questions` on the last slide: the fit ones, by their words, no names. The stage reads verdicts at its own reach, `projector`, which the engine limits to fit ones whatever a screen asks for, and reads no question at all — so the projector cannot show an unfit question even if an integration asks for it. `questions/all` is gone; the projector's read is `questions/shown`. Slide 22's notes say so.

**Still not built** (unchanged from §6 and §10): the button (slide 10, `tools.button`), the projector's terminal view (slide 11, `tools.renderers`), the order form (slide 26, `tools.order`). Each would now be an action given by a grant and a new place on the phone's list in `server/phone.ts`; the cues' "on their main screen" means that list.

**§10, updated:** `PLAN.md` was rewritten in place the same day. `model-check`'s room was rewritten the same day (chosen names and the queries they ran) and runs again; `MEASURED.md`'s Qwen and ID-card numbers are for the retired feature.

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
