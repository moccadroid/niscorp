# Nova talk — three reviewers, three rounds (2026-10-30)

Three reviewers, each played by a subagent, read `talks/nova.md` as attendees first. Only then did they read nisc.dev (the site's source where the fetch only summarised), the root README and Nova's README and DESIGN, and rate how well the talk represented them. Rounds two and three used the same three briefs on the next version of nova.md; only the section names and slide numbers changed to match it. Round two read the rewrite; round three read it after the five approved changes and the request shown on slide 6. Every report is kept here, round one first.

| | Round | Clarity | Interest | Would recommend | Accuracy | Completeness | Emphasis |
|---|---|---|---|---|---|---|---|
| Lena, frontend lead, joins on her phone | 1 | 7 | 7 | 6 | 7 | 5 | 5 |
| | 2 | 7 | 8 | 7 | 7 | 5 | 5 |
| | 3 | 7 | 7 | 6 | 8 | 5 | 6 |
| Marco, startup CTO, half-watches | 1 | 6 | 7 | 6 | 7 | 5 | 5 |
| | 2 | 7 | 7 | 6 | 7 | 5 | 5 |
| | 3 | 7 | 7 | 6 | 7 | 5 | 5 |
| Priya, ran server-driven UI, no phone | 1 | 6 | 6 | 5 | 6 | 5 | 5 |
| | 2 | 7 | 7 | 6 | 7 | 5 | 5 |
| | 3 | 7 | 7 | 6 | 7 | 5 | 6 |

---

# Round one

## Lena — senior frontend engineer, design system lead, joins on her phone

PHASE 1 — IN THE ROOM

Why now (1–5). Slide 2 is my week: "hundreds of lines of React, skim them and ship." That landed. Slide 3 lost me: "Code won because the author was a human." My company's bought form-builder didn't fail because humans typed the JSON. It failed because it couldn't express what design needed, and nothing in the talk answered that. Slide 4 crams three ideas onto one slide (the author changed, the review bottleneck, SQL in 1974), and I doubted "in 2020 GPT-3 … could fill in a JSON schema". Slide 5 is concrete, but a counter is trivial.

The room lays out a screen (6–7). Slide 6 is the best moment: a layout in about a second, the buttons still work, and it lands on my phone. But only the speaker types. I joined to press things and could only shout. Slide 7, showing the exact prompt, is honest.

Taking it apart (8–12). Slide 9 is "a path, a template, a condition". Where are lists, or currency formatting? Slide 10 is a wall of step names, and "closed list" scared me: what happens when I need a step that isn't on it? I checked Slack at slide 11, because "the one step that fills the tools column" is the talk's own plumbing. Slide 12 is neat but small, and "Chrome" made me think of the browser.

What nobody else can do (13–17). Slide 13 is the second big idea: the numbered terminal list as an agent's set of tools. Slide 14 should have been my slide, but "Your own components draw it" gets one clause. Can my design system be the kit? On slide 15 nothing per-person happened on my phone. Slide 16 felt like another talk. Slide 17 matters in fintech, where saved dashboards break on upgrade.

Close (18–19). I'd been carrying "isn't this json-render?" since slide 3, and it arrived with two minutes left. Slide 18 also says "the whole screen is something a model can write", but the demo only wrote layouts.

Phone. Layouts arrived during slide 6, then nothing for 20 minutes. Nobody said whether the to-do buttons on my phone reach the projector.

What I'd remember the next day: a layout on my phone in a second; the terminal list being the agent's tools; "the author changed".
My Q&A question: "Can my React design system be the kit, and what's the escape hatch when I need a component or step that isn't on your list?"
Would I try it? A weekend spike, not a pitch at work. I saw no form, no escape hatch and no refusal.

PHASE 2 — AGAINST THE DOCS

Accuracy
- Slide 16 credits Nova with `nisc build`. Nova's README says: "No page around the screen … the paths and the checks a build makes are a host's (`@niscorp/cli`'s `nisc export`, or moss)." The feature is real (the root README shows the output), but it isn't Nova's.
- Slide 8 names five parts. nisc.dev/nova says "Four parts, one document" (data, layout, triggers, endpoints). The README also counts lifecycle. The talk should pick one.
- Slide 9 leaves out loops. The README says "components, conditionals, loops, refs", and the homepage says a layout "can loop over a list".
- The speaker notes say "about twenty-five" primitives. The README says "~15" and the homepage "about fifteen".
- Three claims aren't in the docs I read: slide 13's "complete set of tools an agent gets" (the README only says "type the number"), slide 15's "every save is a version", and slide 4's GPT-3 history and "about a second".
- These match the docs: slide 12 (DESIGN: "collapses an arbitrary amount of chrome to a single token"), slide 14 ("a served host … cannot tell them apart"), slide 10 and slide 17.

Missing or undersold
- The audit. The homepage gives it a whole section, "Found out before it is pressed", with a document a model handed over and its faults. The talk keeps refusal in the speaker notes. For a sceptic, the refusal is the reassurance.
- Bring your own design system. nisc.dev headlines it, and the README says "The component registry is empty by default." That is the answer to my form-builder fear.
- What stays code. The homepage: "What has to be worked out is a Prism document." There are also `fn` endpoints, and the `slotWrapper` seam for "animation, auth / feature gates, logging, or error boundaries". This is the escape hatch I asked about.
- "Not a page builder: There is no editor and nothing to drag." That one line would have disarmed me at slide 3.
- Forms. The root README says "A form is a schema"; there's loom and `model:` two-way binding. No input appears anywhere in the talk.
- Status. The README says "live: build on it … a release does not break an app that works on the release before it." The talk never says whether this is production-ready.
- The root README's headline, "Stop reading what your agent wrote.", is a better slide 2.

Emphasis
The talk is built around the layout agent. Nova's README says "No LLM features in the core … the layout agent — is opt-in", and DESIGN says "nova is a runtime, not a generator." The demo is fine, but the framing makes Nova sound like an AI layout tool. Slide 11 (the controller's internals) and slide 16 get time the docs don't give them. The audit, your own kit and the escape hatches are what the docs stress, and the talk skips them.

Three changes that would most help someone like me
1. Show a refusal in slide 6: the model hands back a broken layout, it's refused with its sentence and retried. Or run the audit on a document a model wrote.
2. Replace slide 11 with "your kit, and what stays code": my components registered with props schemas, Prism for computation, `fn` endpoints, slotWrapper. Move "isn't this json-render?" and "not a page builder" up to slide 3.
3. Give the phone a job. Let each phone press a one-press request and get it drawn as that person's own layout, which pays off slide 15. Put an input on the to-do screen so I watch a form work end to end.

---

## Marco — CTO of a 12-person startup, half-watches, checks Slack

PHASE 1: MARCO IN THE ROOM

Why now (1–5)
Slide 2 landed. "hundreds of lines of React, skim them and ship" describes my team. Slides 3–4 are history: Airbnb, Adaptive Cards, GPT-3, SQL in 1974. I've heard server-driven UI pitched before, so I went to Slack during 4. Slide 5 brought me back, because a screen I can read in ten seconds is exactly what my two seniors need.

The room lays out a screen (6–7)
The best part of the talk. Phone out, I typed a request, and the layout came back in "about a second" with the time shown. Slide 7 only half-answered cost and speed: "a big model is a bit more reliable and much slower." How much slower? How much cheaper? What's the pass rate? I never saw a layout refused, so I didn't believe it never fails. It's also only layout, over screens that already exist. My team's review pain is logic.

Taking it apart (8–12)
Lost me. Slide 10's "closed list" is actually the review-load argument, but nobody said that's why it matters. Slide 11 says "There are no screens" after ten minutes of "the screen", then piles on shell, canvases, stack, list and tools column. I checked Slack. On slide 12, "Chrome", I first thought of the browser.

What nobody else can do (13–17)
Slide 13 woke me up. Numbered buttons as an agent's tool list could become our QA story. Slide 14 cuts both ways: it gets me off React and onto Nova. Slide 15, per-person layouts: who asked for those? Slide 16: Slack. Slide 17 sounds important but stayed abstract.

Close
Naming json-render and A2UI was good, but one sentence of comparison is thin. "The whole app is data", yet I only saw UI.

My questions
- Speed: answered, live.
- Time saved: implied, never measured.
- Cost: never.
- Lock-in: never, and the talk made me more worried about it.

What I'd remember: (1) the room's layouts on an open model in about a second; (2) a screen is a JSON document with a closed list of verbs; (3) the terminal turns a screen into numbered tools.

My Q&A question: "When we need something the primitives or the step list can't do, what do we write, and does 'it's all data' survive that?"

Would I give an engineer a day? Yes, on one internal admin screen. A day is cheap and the review argument is real. But nothing told me how to add it to our existing React app.

PHASE 2: AGAINST THE DOCS

Accuracy
Most of it is supported:
- The closed step list matches the README's mutations and effects.
- `with:` matches DESIGN: it "collapses an arbitrary amount of chrome to a single token".
- Numbered terminal buttons match DESIGN's "a complete, ordered action space".
- Stored documents are upgraded, and a too-new one is refused (TOO_NEW).

What doesn't hold up:
- Speed and reliability. "a small open model does it reliably in about a second" and "a big model is a bit more reliable and much slower": nothing I read measures either.
- Features that aren't Nova's. Slide 16's `nisc build` belongs to the CLI. The Nova README says "the paths and the checks a build makes are a host's (`@niscorp/cli`'s `nisc export`, or moss…)". Slide 15's "Every save is a version" appears nowhere in Nova's docs, and per-person shells are moss.
- Who presses. Slide 13 says "the complete set of tools an agent gets to use it". The root README says of encore's model: "It picks, it never invents, and it never presses the button." nisc.dev says the assistant prepares actions and a person presses. The talk drifts from the project's safety position.
- Kit size. The speaker's notes say "about twenty-five domain-blind primitives". The README says "~15 domain-blind primitives" and the site says "about fifteen".
- Screens. Slide 11 says "There are no screens", while the README calls a canvas "a logical surface — a screen, a panel, a modal stack".

What it misses for a CTO
- The audit. nisc.dev/nova gives it a whole section, "Found out before it is pressed": every ref, call and binding is checked. The talk keeps it in the speaker's notes, and it's my answer to review load.
- The headline. The root README opens with "Stop reading what your agent wrote… You review a diff of data." It also ships AGENTS.md in the package and treats checks as the proof for every feature. The talk never shows a diff.
- Lock-in answers that already exist. Apache-2.0, "Fork it; it is yours." "No lock-in. Nova's core does not import React." "a release does not break an app that works on the release before it." Every piece installs on its own.
- Honest limits. It's below 1.0 and the React adapter needs React 19. Code still lives in `fn:` endpoints and kit components; the build output itself says a function endpoint "is code".

Emphasis
The talk makes the layout agent its backbone. The Nova README says "No LLM features in the core" and calls the layout agent opt-in, and DESIGN says "nova is a runtime, not a generator." The docs lead with one tree and five renderers, the four-part action and the audit. DESIGN's real "nobody else can" claim is introspection: "introspection can be complete, a thing no code-based UI framework offers". The talk never makes that claim, and spends slides 15–16 on moss and CLI features instead.

The three changes that would help most
1. Show the review saving. Put one feature as a React PR next to its Nova data diff, with line counts. At slide 6, let the audit refuse a broken layout live and show the retry.
2. Put the measured numbers on slide 7: pass rate from the ten-run sets, latency, and cost per layout for 120b against a big model. Replace slide 16 with lock-in and adoption: Apache-2.0, a core without React, one Nova screen added to an existing React app, the compatibility promise, and where your own code goes.
3. Cut slides 10–12 to one slide that says why a closed list of verbs matters: it's what a reviewer checks. Drop "There are no screens". Make slide 13 match the project: an agent reads the numbered list, a person presses.

---

## Priya — ran server-driven UI at a marketplace app, never joins on her phone

PHASE 1 — IN THE ROOM (no phone, projector only)

Why now (1–5)
Slide 5 lands: a small screen with its whole document beside it. Slide 3 loses me. It says SDUI "stayed niche because a person had to write the JSON." We never wrote JSON by hand; we had typed server-side builders. SDUI hurts because of old clients, actions that need app code anyway, and debugging. It isn't niche either. Slide 4's claim that GPT-3 in 2020 "could fill in a JSON schema" sounds like rewritten history, and the "SQL… in 1974" line is left unexplained.

The room lays out a screen (6–7)
The best part. The request, the layout and the time are all on screen, and the buttons keep working. Slide 7 showing the exact prompt, and admitting "a big model is a bit more reliable", earns trust. But slide 2 is about writing a screen, while slide 6 only re-lays-out one whose data and buttons already exist. That's a much smaller task.

Taking it apart (8–12)
Slide 10 ("steps from a closed list") is where SDUI really hurts, and nothing says what happens when the step you need isn't on the list. "Action" names the whole unit, which collides with my meaning of the word (what a button does). Slide 11 ("There are no screens") sits awkwardly in a talk carried by "the screen the room lays out", and the tools column is inside baseball. Slide 12 is crisp.

Nobody else (13–17)
- 13: partly holds. Semantic named actions beat screenshots, but SDUI payloads are already JSON, and accessibility-tree snapshots already number elements for agents.
- 14: doesn't hold. One payload, many renderers is what SDUI and Adaptive Cards are for. And here every surface is web or terminal: no iOS, no Android.
- 15: doesn't hold. Per-user layouts and live rollback are why companies adopt SDUI.
- 16: doesn't hold. Next.js build output already marks each route static or dynamic.
- 17: ordinary document migration. "One written by newer code is refused" is the old-client problem restated, not solved.
- 18: then concedes two projects "going the same way."

No phone
Slide 15 ("already reached the phones") is the only claim I had to take on faith. Everything else was on the projector.

Remember next day: one-second relayout with the prompt shown; the closed step list; the terminal numbering buttons as tools.
Q&A: "When product needs a step that isn't on the list, what's the path, and what does a client that doesn't know it show?"

PHASE 2 — AGAINST THE DOCS

Accuracy
- Slide 13 says the terminal list is "the complete set of tools an agent gets to use it." DESIGN.md backs the mechanism ("a complete, ordered action space a host maps… an agent's tool calls onto"). But the site's stance is "It cannot press a button for them" and "AI prepares. A person presses the button, every time." The talk has to reconcile those two.
- The "nobody else" framing goes further than the docs. DESIGN.md's own claim is narrower: complete introspection is "a thing no code-based UI framework offers." That compares Nova to code, not to SDUI. Nova's homepage makes no uniqueness claim at all.
- Slide 14: supported ("the server never learns which one drew the frame"). But React Native is only "a sibling folder" — not built.
- Slide 15: per-person layouts belong to moss ("layout variants… substituted per principal at shell build"), not Nova. I found "Every save is a version" in no doc I read.
- Slide 16: the root README supports it ("nisc build reads the answer off the actions on each path, and tells you why"). But Nova's README says "the paths and the checks a build makes are a host's." So it's a CLI feature in a Nova talk, and its output has a "Route" column while Nova's site says "There are no routes."
- Slide 17: Strata matches it exactly ("read by older code, it is refused (TOO_NEW), never guessed at"). Nova's README adds that the upgrade happens where the document is read, by the host: "moss does this for integration actions."
- Speaker notes say the kit is "about twenty-five" primitives. The README says "~15" and the site says "about fifteen."
- Slides 3–4 (why SDUI stayed niche, GPT-3 in 2020): nothing in the docs backs them.

What it misses for an SDUI veteran
- Where the shell runs. The README says the press is counted "in a shell on the server. The browser draws what the socket sends." That is the real answer to old-client versioning, and the talk never says it.
- The charter: "An action a person is not granted does not exist in their shell." Permissions as data matter enormously in SDUI.
- Debugging. auditAction, reflect and devtools are missing; Nova's homepage gives the audit a whole section ("Found out before it is pressed").
- The escape hatch. A `call` to a `fn:` endpoint is the way out, and the build output itself says such an endpoint "is code." That honest answer is my Q&A question.

Emphasis
- The talk centres on the runtime layout agent. Nova's README says "No LLM features in the core… the layout agent — is opt-in", and DESIGN.md says "nova is a runtime, not a generator." The root README's agent story is a coding agent writing the app ("You review a diff of data"). That fits slide 2, not the slide 6 demo.
- "Wrong is refused, not rendered" is a top-level README promise. The talk only has it in the speaker notes for slide 6.
- Slide 16 gets a "nobody else" spot, but in the README it's one row of a table.

Three changes
1. Rename 13–17 to "what being data buys you" and compare honestly to SDUI (Airbnb's system, Adaptive Cards). Keep 13 and 17, drop 16, and fix the slide 3 diagnosis: SDUI hurt because of versioning, the action vocabulary and debugging, not because people wrote JSON by hand.
2. Add one slide on the server shell, one per person, with a thin terminal and the charter. It answers versioning and permissions together.
3. On slide 6, show a refused layout with its sentence and the retry. On slide 10, say that `fn:` endpoints are the code escape. On slide 13, square "agent's tools" with "a person presses." Put slide 15's per-person result on the projector, not only on phones.

---

# Round two (the rewritten nova.md)

## Lena

PHASE 1 — IN THE ROOM (written before opening anything else)

Why now (1–6). Slide 2 hit: that's my week. But slide 7 says "That diff is all a reviewer would read", so it's read less, not stop. Slide 3 answers "server code got reviewed"; my scar is rigidity, which isn't answered until slide 13. Slides 3 and 5 repeat "ten years ago only a person could write a screen". Slide 4 (json-render/A2UI) is where I checked my phone; "the steps a press runs are in the document" sounded like the scary part. SQL-1974 landed. The first concrete thing comes at ~6 min, and it's a to-do list.

The room lays out (7–9). Best section: live model, diff, timing, "an item ticked before stays ticked." "A big model is a bit more reliable and much slower" earned trust. Slide 9's "the way the homepage shows it": which homepage? I wrote down the audit sentence going back to the model.

Taking it apart (10–14). "Nova calls the whole document an action": to React people an action is an event or a server action; I stumbled. Slide 11 is two-way binding; bored. Slide 12 is the core claim, but I wanted the number of verbs and where loading, errors and debounce live. Slide 13 finally says "your components", at minute 19. "A Prism document" is never explained; lost. Slide 14: shrug.

Document vs code (15–17). Slide 15: I thought "E2E tests without selectors", but it's framed only for assistants. Slide 16 impressed me; I'm React-only, so I kept "the look is your stylesheet". Slide 17: why store screens? "Strata", unexplained.

Close (18). "nisc.dev/elop": what's elop? No "try it in ten minutes".

Phone. Nothing until slide 7, then a mirror of the room's layouts. I couldn't send a request (the room shouts, the speaker types), or tell whether my tick reached the projector. It added almost nothing.

Remember: the SQL trade; a layout diff instead of 300 lines of React; the audit sentence going back to the model.
Q&A: "When my designer wants what the step list can't say, like optimistic update with rollback or debounced async validation, what does that look like, and how often did lyceum hit that wall?"
Try it? A weekend spike with three of our components. Not production at "0.5" in fintech.
Clarity 7 · Interest 8 · Recommend 7

PHASE 2 — AGAINST THE DOCS

Accuracy
- Slide 1: "pnpm add @niscorp/nova". README: "`@niscorp/prism`, `@niscorp/strata` and `zod` are required peers". Wrong on slide one.
- Slide 14: "The model writes the frame's name, `with: ['sheet']`". DESIGN puts `with` on a push step ("{ push: { action: 'new-contact', with: ['modal'], canvas: 'modal' } }"), and the layout agent outputs "a LayoutNode", so slides 7–8's model can't write it. The docs say "fragment"; searching for "frame" finds nothing.
- Slide 12, "push the new item": the README lists `push` as both a mutation and a navigation effect. On the "every verb" slide that shows.
- Slide 17's "old version of the kit": the docs version Nova's grammar (`nisc.nova`), not a kit. The speaker's own notes list it under "To find out".
- Slide 8 says the model gets "the buttons it must keep"; the README's layoutAgent takes "intent + component palette + data example". Possibly lyceum's own; undocumented.
- package.json says 0.5.1; nisc.dev/nova reported "Nova 0.3.0" when I fetched it.
- Supported: "introspection can be complete…" (DESIGN), the same events from every adapter, newer documents refused, an empty registry, the SQL line.
- The docs disagree with each other: DESIGN says "Prism stays an optional dependency"; the README says required peer.

Missed, and it mattered to me
- Async. README: "Loading state is explicit data on the action". DESIGN: "An older response never writes over a newer one", plus onSuccess/onError and lifecycle mount. That's half my Q&A answered, and none of it is in the talk.
- The Shell, one of the README's "three subsystems": canvases, stacks, Back. Zero slides.
- The component contract: components "receive only the layout's props plus children / novaModel" and emit through useNovaDispatch; React 19 required; reference kits exist. My first question as a design-system lead.
- The promise: "an app that works on one works on the next". That changes my "not at 0.5" verdict; the talk shows 0.5 bare.
- Reviewer tooling: 42 examples run as the package's tests; auditCatalog/actionGraph find dangling targets.

Emphasis. The talk spends 7 of its 30 minutes on a model writing layouts while the app runs. The README says "No LLM features in the core", and the agent is opt-in. The README's weight (shell, lifecycle, async safety, strict/lax mode, React compatibility) gets nothing in the talk.

Accuracy 7 · Completeness 5 · Emphasis 5

Three changes
1. By slide 8, show one of my components registered: props schema, novaModel, React 19. The form-builder fear dies at minute 8, not 19.
2. Trade slide 14 or 17 for "the to-do list loads and saves": a mount call, loading as data, an error branch, the stale-response rule.
3. Give phones a job: send requests from them, or make my phone slide 16's surface, with my press landing on the projector. Also fix the install line, say "fragment", and put the promise beside "0.5".

## Marco

PHASE 1: ATTENDING

Why now (1–6). Slide 2, "Stop reading what your agent wrote", describes my exact problem: two seniors buried in agent PRs. It was the best hook of the night. Then the talk went backwards: Airbnb and Adaptive Cards (3), json-render and A2UI (4), SQL in 1974 (5). I'd never heard of json-render. The key idea, "the steps a press runs are in the document", went by fast. I was on Slack from 3 to 5. Slide 6 pulled me back, but it was minute six before I saw anything run. "Version 0.5" on slide 1 left me with a lock-in worry for the whole talk.

The room lays out the to-do list (7–9). This was the best part. On 7 the room asks, a layout appears with its diff and the seconds it took, and ticked items stay ticked. "That diff is all a reviewer would read" is the sentence I came for. Slide 8 was honest ("a big model is a bit more reliable and much slower") but gave no numbers. Slide 9 is the safety story: a broken layout is refused with a sentence and the last good one is kept. "The way the homepage shows it" meant nothing to me, because I haven't seen the homepage.

Taking it apart (10–14). 10–11 felt like a tutorial, so I checked Slack. "Nova calls the whole document an action" is confusing: "action" already means three other things to my team. 12 landed, because a closed list of verbs is something a reviewer can check. 13 mattered most to me (what code I still write), but it brought in a new noun, "Prism document", and never explained it. 14 was cute; Slack again.

What a document can do (15–17). On 15 I had to make the link myself: agent-driven QA without screenshots. The talk never said it. 16 is a nice trick, but we're a React shop, and "neither is built yet" for React Native matters to us. 17 was abstract and added another noun (Strata). Slack.

Close (18). "The whole app is data", then nisc.dev/elop. What's elop? I left unsure whether I'd be adopting Nova or all of nisc.

My questions. Time saved: implied by the diff and the closed verbs, never measured; there was no React-vs-document comparison of the same change. Cost: not answered. Speed: answered live on 7, if the number is good. Lock-in: half answered. I heard Apache-2.0, your components and your functions. I heard nothing on starting inside an existing React app, or on what 0.5 promises.

What I'd remember: the room-driven layout with its diff and time; a press runs from a closed list of verbs; a bad layout is refused and the old one stays.
My Q&A question: "Can I drop one Nova screen into our existing React app, with our own components, without the rest of nisc? And what does one layout cost on 120b?"
A day for an engineer? Yes: one day on one internal admin screen, with review time measured. Nothing beyond that until I know the stability story.
Ratings: clarity 7, interest 7, would recommend 6.

PHASE 2: AFTER READING THE SITE AND DOCS

Accuracy. Most of the talk is supported. The problems:
- Slide 1's install line is incomplete: the README says "pnpm add @niscorp/nova @niscorp/prism @niscorp/strata zod", and that those three are "required peers".
- Slide 11 says "four ways: a path, a template, a condition, and a loop". The homepage says "Three ways to read the data." Loops exist, but someone going from the talk to the site sees a different count.
- Slide 5 says "a model can be held to a schema while it writes". The root README says "A provider's schema is a compliance hint; Zod is the truth." In the docs the safety comes from parsing and refusing, not from the provider.
- Slide 9 says the audit's sentence "goes back to the model". The README only says layoutAgent's output is "validated against LayoutNodeSchema". If lyceum feeds the audit back itself, the talk should say so.
- The package is 0.5.1 and the talk says 0.5, but the nisc.dev/nova page said "Nova 0.3.0".
- No doc gives a speed or cost figure for gpt-oss-120b. Only the live slide backs up "fast enough to wait for".

What it misses
- The compatibility promise: "a release does not break an app that works on the release before it." That answers my 0.5 and lock-in fear.
- The rulebook ("The rulebook ships in the package", AGENTS.md) and "Every feature ships its proof." The coding-agent story is the project's headline; the talk gives it one sentence on slide 8.
- Ready-made component kits ship with each adapter, so I don't write fifteen components on day one.
- React 19 is required, and Nova is "Not a router".
- Signal, nisc's model client, speaks OpenAI, Groq and OpenRouter, and "native Anthropic and Google adapters are not built yet."

Emphasis. The talk's centrepiece, a model writing layouts while the app runs, is an optional extra in the docs: "No LLM features in the core… the layout agent — is opt-in at /agent." The docs lead with "Your coding agent builds the app by writing data. You review a diff of data." The talk spends minutes on history that the docs cover in one SQL sentence, and the docs don't mention json-render or A2UI at all.

Ratings: accuracy 7, completeness 5, emphasis 5.

Three changes
1. Cut slides 3–5 to one slide and show a before/after: the same change as an agent's React diff and as a document diff, with line counts.
2. Put the measurements taken before the talk on screen: the pass rate over ten runs, seconds and cost per layout, for 120b against a big model.
3. Add one slide on adopting it: the real install line, React 19, one Nova screen inside an existing React app with your own components or a ready-made kit, the no-break promise, and Apache-2.0.

## Priya

PHASE 1: IN THE ROOM, LAPTOP ONLY

Why now (1–6). Slide 2 is a good hook. Slide 4 earns trust because it names json-render and A2UI instead of pretending nobody else exists. Slide 6, if the whole document really fits on it, is the best picture in the talk. What I didn't believe: slide 3's history, "teams wrote server code that produced the JSON." That's true of the payload, but our actions were data too: a closed registry of navigate/submit/toggle inside the JSON, the same as Adaptive Cards' Action.Submit and ToggleVisibility. So "the steps a press runs are in the document" (slide 4) is new compared with json-render, not with SDUI. Slide 5's SQL line is rhetoric. Seven minutes of framing before the first demo is long.

The room lays out the to-do list (7–9). The diff and the time on the projector, ticked items surviving a layout swap, and the refused layout on slide 9 with its sentence. This is the part I'd tell colleagues about. What I doubted: were the one-press requests tested beforehand? If so, say it, and type one unrehearsed. "A big model is a bit more reliable and much slower" needs numbers. And "the way the homepage shows it": which homepage?

Taking it apart (10–14). Clear but dry. On slide 10, calling the whole screen an "action" clashed with my vocabulary; slide 4 had just used the word the other way. Slide 12's full list of steps is good. It is also exactly where our pain was: every new step needed a client release. Slide 13 is honest, then mentions "a Prism document" without explaining it. Slide 14 is a minor feature presented as a headline; every SDUI system has a presentation style.

What a document can do that code can't (15–17)
- 15 mostly holds. A live tree with its values, plus what each control does, beats an accessibility tree, which knows labels but not what a press does. Our SDUI never reported client state back in a structured way.
- 16 doesn't hold. "One payload, many renderers" was SDUI's founding pitch. And React, Vue and DOM are three web targets; native "isn't built yet". Who writes the component kit for each surface?
- 17 is the hard problem, given one slide at the end. "One written by newer code is refused." Refused how, to someone running a two-year-old client?

Without a phone I missed nothing essential. One question: when the speaker presses a request button on the controller, does the projector show the request text?

What I'd remember: a small open model rewrote a working screen live and its state survived; a press runs steps from a closed list and the audit refuses a bad layout with a sentence; old stored screens are upgraded when read, newer ones refused.
My Q&A question: "What does a user on an old client see when the server sends a document using a step or component that client doesn't have?"
Ratings: clarity 7, interest 7, would recommend 6.

PHASE 2: THE REAL THING

Accuracy. Mostly supported.
- Slide 17 matches Strata: "read by older code, it is refused (TOO_NEW), never guessed at." Strata's README shows an app's kit as its own grammar ("Button: label → text"), so "an old version of the kit" is real.
- Slide 15 matches DESIGN: "introspection can be complete, a thing no code-based UI framework offers."
- Slide 16 matches "an app renders in all five without changing a line." But "An adapter is a walker plus a component kit of ~15 domain-blind primitives": you write a kit per framework. "The look is your stylesheet" hides that cost.
- Not supported: slides 8–9. The README describes layoutAgent as "intent + component palette + data example in, a LayoutNode out, validated against LayoutNodeSchema", with no buttons it must keep and no audit sentence going back to the model. If lyceum adds those, the talk should say so.
- Slide 17's demo document doesn't exist yet. The fetched nisc.dev/nova page reports version 0.3.0; the package is 0.5.1.

What it misses for someone who has run SDUI. The answer to my Q&A question is in the root README: "the press is counted in a shell on the server. The browser draws what the socket sends and sends back what was pressed." The client doesn't interpret documents at all, so the old-client problem mostly moves to a server that is always current. That makes this closer to LiveView than to Airbnb, and LiveView is the comparison I'd want. Debugging is also missing: describeShell, actionGraph, chainCycles, livenessOf, a devtools inspector built in Nova itself, an endpoint timeline, and examples the tests run. The CI gate ("157 real documents must upgrade and parse") is what would make slide 17 believable.

Emphasis. The talk centres on a model writing layouts while the app runs (7–9). The README says "No LLM features in the core," and DESIGN says "nova is a runtime, not a generator". What the docs centre on (shells, canvases, navigation, lifecycle, reconcile) never appears. Dialogs get a whole slide. Charter ("An action a person is not granted does not exist in their shell") is nisc's strongest idea, and the close skips it.

Ratings: accuracy 7, completeness 5, emphasis 5.

Three changes
1. One slide on where it runs: the shell is on the server and the screens only draw the trees it streams. Say what that does to versioning, compare it with LiveView, and answer "newer document refused — what does the user see?"
2. Rebuild 15–17 so they survive an SDUI audience. Drop slide 16's claim to be new and state the per-adapter kit cost. Back slide 17 with the grammar gate and a real old document. Keep 15, and show the "what each control does" part.
3. Show debugging: the devtools inspector over the to-do list. And on slide 7, type one unrehearsed request and show the measured pass rate.

---

# Round three (after the five changes)

## Lena

PHASE 1: THE TALK

Why now (1–5). Slide 2 is my life: I review agent-written React, and nobody reads all of it. Slide 1 lost me a little. The install line names four packages before I know what any of them does, and "0.5" sits next to "a release does not break an app". Slide 3 is where I checked Slack. It's a four-row table at minute three, and I'd never heard of json-render or A2UI. Its best line, "Nova isn't a page builder… nothing to drag", touches my form-builder scar, and it's buried at the end. Slide 4 repeats the why-now case, but the SQL-1974 line sticks. Slide 5's to-do list is the dullest screen in software; my world is forms with currency fields and cross-field validation.

The room (6–8). This is the best part. On slide 6 you get the diff ("That diff is all a reviewer would read"), ticked items stay ticked, and the time is shown. That's the pitch. Slide 7 is honest, and "register your design system and it's yours" is the sentence I came for. It arrives at minute 13. Slide 8 is good, but it only catches structural faults. What about a layout that is valid and wrong, like Save pushed off-screen?

Taking it apart (9–13). Nine minutes of anatomy; I drifted at 9–10. Slide 11's closed list of steps made me think "rigid", and the answer (13) comes two slides later. Put them together. Slide 12's make-the-next-save-fail button is a great touch.

Document vs code (14–16). Slide 14 was new to me: an assistant reads the screen as data, not a screenshot. But "the assistant prepares, a person presses" was dropped in without explanation. Slide 15 is a party trick for a React-only shop. Slide 16 matters in fintech, but I wanted my own case answered: I rename a prop in our design system, and then what?

Close (17). Abrupt. "nisc.dev/elop": what is elop? There's no "try this on Monday".

Phone. I scanned, joined, and watched the room's layouts arrive. That proved it was live, but I couldn't submit or vote for a request. I was a viewer with a second screen, and it added little.

Remember: the SQL 1974 analogy; the layout diff as the thing you review, with state kept; the refusal sentence going back to the model.
Q&A: "Where does it stop being expressive? For a formatted amount, a conditional field or cross-field validation, does that go in the layout, a step, a function or a component?"
Try it? A weekend spike with five of our components, not production. The review story hits my pain. The closed step list, the 0.5 version and an unknown vendor hold me back.
Clarity 7 · Interest 7 · Recommend 6

PHASE 2: THE DOCS

Accuracy. Mostly faithful. These hold up: the four parts; path, template and condition, plus loops; the audit; "An older response never writes over a newer one" (DESIGN); five adapters with the "same `ui:click` / `ui:model` / `ui:key` events up"; Svelte and React Native not built; the no-break promise. Problems:
- Version. Slide 1 says 0.5, package.json is 0.5.1, but the live nisc.dev/nova page reads "Nova 0.3.0".
- Slide 16, "saved at an old version of the kit". The Nova README versions Nova's own grammar. Nothing I read says a kit's props are versioned, and the plan's own open items admit it needs "lyceum's own kit grammar".
- "Nova ships none in its core" is literally true but misleading. "opt-in reference kits ship at the adapter subpaths", and the site says "a kit of about fifteen plain components". I left thinking I'd have to wrap my whole design system before a hello world.
- Slide 11, "all the steps Nova has". That list contains two `push` steps, the data step and the navigation step. Shown raw, it confuses.
- Slide 8, "the layout isn't used". That is lyceum's rule. In Nova's lax mode a broken subtree "become[s] `RenderErrorNode`s". Say whose rule it is.

Missed. Forms ("A form is a schema"; Loom "Compiles a Zod schema into a Nova form"). Computed values ("What has to be worked out is a Prism document"). What integrating costs (components receive "only the layout's `props` plus `children` / `novaModel`"; "React 19 required"; we're on React 18). The coding-agent story ("Your coding agent builds the app by writing data. You review a diff of data"; AGENTS.md). The shell and canvases, "Not a router", and fragments.

Emphasis. The talk centres on a model writing layouts live. Nova's docs say "No LLM features in the core", the layout agent is opt-in, and "nova is a runtime, not a generator". The nisc README does lead with AI, but with the coding agent at build time. Introspection and adapters get fair weight in both.
Accuracy 8 · Completeness 5 · Emphasis 6

Three changes
1. Open with my day: ask Claude Code for a screen and show the React diff beside the action's diff, with AGENTS.md on screen. Make slide 6 act two, with the measured pass rate and timings on it.
2. Kill the rigidity worry early, in one block: the closed steps and the function you write on one slide, then Prism for computed values, a form from a Zod schema, and registering one real component. Swap the to-do list for a small form, or add one.
3. Give phones something to press. Cut slide 3 to two rows. End on a concrete next step with "elop" explained, and the version matching the site.

## Marco

PHASE 1 — IN THE ROOM

Why now (1–5). Slide 2 is my exact problem, so I put the phone down. Slide 3 lost me: a four-row table, two names I hadn't heard of, and it turns on "where a press goes". That's where I went to Slack. Slide 4's SQL-in-1974 line stuck. Slide 5, a working screen next to its whole document, is the first moment I believed it. On slide 1, "0.5" next to "a release does not break an app" made me raise an eyebrow.

The room (6–8). The best eight minutes. Slide 6 shows the request, the layout, the diff and the time taken. "That diff is all a reviewer would read" is the sentence I came for. Slide 8, refusing a broken layout with one sentence per fault, is reassuring. Slide 7 says "a big model is a bit more reliable and much slower", but gives no numbers.

Taking it apart (9–13). Slides 10–12 are a framework tutorial, and I spent them in Slack. Two things got through: the closed list of steps on 11 as "what a reviewer checks", and "an older answer never writes over a newer one" on 12. Slide 13 matters most to me, because that's where my seniors' review time goes, and it gets one line.

Document vs code (14–16). Slide 14 is clever but abstract. Slide 15 impresses, but we're React-only. Slide 16 only matters if we store generated screens.

Close (17). "The whole app is data" comes with no demo and a URL ending in "elop" that nobody explains.

My questions. Time saved: a qualitative yes, but only on a to-do list. Cost: never mentioned. Speed: the time is shown live, but no figure is ever stated. Lock-in: Apache-2.0 and "your components" help; nothing on adopting it inside an existing app, who maintains it, or how we'd leave.
Remember: review a document diff instead of the React; the room's live layouts and the refused one; SQL 1974.
Q&A: "On a real feature, a form with validation and a backend save, how much of what my agent writes is document, and how much is functions my seniors still review?"
An engineer for a day? Yes, scoped: three of our components and one real screen written by our agent.
Clarity 7, interest 7, would recommend 6.

PHASE 2 — AFTER READING

Accuracy. Mostly faithful: the install line, the licence, the five renderers, "neither is built yet", the closed step list, the older-answer rule and the DESIGN quote on slide 14 all check out. The problems:
- Version: slide 1 says 0.5, package.json 0.5.1, nisc.dev/nova "Nova 0.3.0".
- Slide 8's "isn't used" and the notes' "nothing broken is ever drawn" are lyceum's policy, not Nova's default: "Lax mode (default)… Renderer subtree failures become RenderErrorNodes and siblings continue".
- Slide 7: "Nova ships none in its core" is true but misleading; "opt-in reference kits ship at the adapter subpaths".
- Slide 16: Nova's docs version Nova's own document format, not a kit, and say upgrading on read is done by moss "for integration actions".
- "Fast enough to wait for": no doc gives a latency or a cost.

Missed. The coding-agent workflow ("Your coding agent builds the app by writing data. You review a diff of data"; AGENTS.md, PLAN.md, `npm run check`). Lock-in facts ("Nova's core does not import React… Use any one piece alone"; "Fork it; it is yours"; the promise enforced in CI, "157 real documents must upgrade and parse"; React 19 for the React adapter). Providers (Signal: "OpenAI, Groq and OpenRouter… native Anthropic and Google adapters are not built yet"). Who maintains it.

Emphasis. 8 of 30 minutes on gpt-oss-120b writing layouts, while the docs say "No LLM features in the core" and "nova is a runtime, not a generator". A slide on a comparison table the docs never mention, and none on the README's "What you stop writing".
Accuracy 7, completeness 5, emphasis 5.

Three changes
1. Replace slide 3's table with my team's loop: a coding agent writes a real-sized feature as an action, `npm run check` prints pass/fail lines, a reviewer reads a data diff; then answer slide 13 honestly, this much is still code.
2. Put numbers on slides 6–7: pass rate, median seconds and dollars per layout, and name the provider.
3. Add one adoption slide, and get the 0.3.0 vs 0.5 mismatch fixed before the talk.

## Priya

PHASE 1: IN THE ROOM (projector only, no phone)

Why now (1–5). Slide 5 landed: a working list next to its whole document was the first time I believed the format is small. Slide 3's table is the right slide for a room like this. What I didn't believe: slide 3 says "Anything new a press should do meant a new release of the app", then "In Nova the steps a press runs are in the document." Our SDUI had action chains too. Nova's list is closed (slide 11), so a verb that isn't on it is either a function or a new Nova release: the same wall with a bigger room inside it. Slide 4 repeats slide 3's point; the SQL-1974 line is good, say it once. Slide 2's title sounds like advice to stop reviewing; the real point, that review shrinks to a diff, only arrives on slide 6.

The room (6–8). The best part. The request, the diff and the time, and an item ticked before stays ticked; in our system a new payload wiped local state. Slide 8 is the most production-minded moment of the talk. Slide 7's "a bit more reliable and much slower" needs numbers. The one-press buttons will look rehearsed unless the room's own call-outs actually get typed in.

Taking it apart (9–13). Slide 9: "action" will trip anyone from SDUI. Slide 10 is data binding, which I know already; it could go. Slides 11 and 12 landed: the verbs listed from the schema, and the save that fails on cue with the error landing in the data. "An older answer never writes over a newer one" was said, not shown. Slide 13 is too thin: where does the function run, and how does it ship?

What a document can do that code can't (14–16). 14 holds against React code; against SDUI only half of it is new. What's new is that the steps and the live values sit in the document, and the numbered terminal is a real action space for an agent. 15 doesn't hold against SDUI: one payload on iOS, Android and web was Airbnb's whole point; here it's three web renderers and two terminals. Who writes the kit for each surface? 16 covers the easy direction; my pain was a new server talking to an old client. "One written by newer code is refused." And then what does the user see?

No phone: I missed nothing.
Remember: the live layout with its diff and state kept; a broken layout refused with a sentence; press verbs inside the document, from a closed list.
Q&A: "When the reader is older than the document, and meets a component or step it doesn't know, what does that user see, and how do you serve them?"
Clarity 7, interest 7, would recommend 6.

PHASE 2: THE DOCS

Accuracy
- Slide 3. The Nova README on the `reconcile` step: "Added at grammar nisc.nova 1: a reader at 0 refuses an action that uses it (TOO_NEW)." A new verb needs a new Nova release, the SDUI cost slide 3 implies Nova avoids.
- Version: 0.5 on slide 1, 0.5.1 in package.json, "Nova 0.3.0" on nisc.dev/nova, and the website pins ^0.3.0.
- Slide 12. DESIGN adds: "Its onSuccess still runs; the call happened." Either say so or don't make the race claim.
- Slide 14 is supported ("introspection can be complete…"; "a complete, ordered action space"), but against code, while slide 3 set SDUI up as the competitor.
- Slide 15. "One tree, five renderers"; "An adapter is a walker plus a component kit of ~15 domain-blind primitives". "Every surface" overclaims five, and hides the kit per adapter.
- Slide 16 is supported by Strata ("read by older code, it is refused (TOO_NEW), never guessed at"), kit migrations included ("Button: label → text").

Missed. Where the shell runs ("the press is counted in a shell on the server. The browser draws what the socket sends"; Nova has "No wire protocol", the wire is moss's). Failing gracefully (a missing component "renders an error node (COMPONENT_NOT_FOUND) in its place", and in lax mode the rest keeps drawing). Debugging (the devtools inspector, the endpoint timeline, `npm run check`, NOVA_EXAMPLES). The proof behind slide 16 ("157 real documents must upgrade and parse").

Emphasis. 8 of 30 minutes on a model writing layouts while the app runs; the README says "No LLM features in the core". The root README's headline is about the coding agent; slide 2 makes that point and drops it. The docs give weight to the audit, inspection, lax and strict error handling, and fragments.
Accuracy 7, completeness 5, emphasis 6.

Three changes
1. Merge 3 and 4 and state the difference honestly: steps compose inside the document, the list is closed and grows only with Nova releases, and the shell can run on the server.
2. Rebuild 15–16 around the old-reader case: a newer layout refused, or an unknown component drawn as an error node while the rest keeps working; one kit per surface; the 157-document gate. Retitle the section, since the comparison is with SDUI.
3. Replace slide 10 with debugging: the inspector on the to-do list, the endpoint timeline showing slide 12's failed save, and a headless check that presses Save.
