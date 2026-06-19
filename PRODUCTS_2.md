# Products II — Composed Interfaces

> Working draft. The product shapes are settled; the AI's exact agent/tool surface is not, and is called out as open below. More iterations expected.

[PRODUCTS.md](PRODUCTS.md) lists verticals the stack suits. [POSSIBILITIES.md](POSSIBILITIES.md) lists capabilities it unlocks. This document is the concrete one: three lab products built on a single rule, traced to what the code does today.

## The rule: AI only does what code cannot

Everything in this document follows from one line.

**If code can do it deterministically, code does it. AI is spent only on the irreducible.**

This is stronger than "let a human approve the AI." The point is that most of what these products do should never touch a model at all:

- Recording that a ticket was resolved is a database write. It must be **code**, because code-done is permanently done — no hallucination, no model outage, no retry can make it half-true. Delegate that to AI and you have bought yourself a system that is sometimes wrong about whether something happened.
- Querying the open tickets in a scope is a [Vex](packages/vex) shape. **Code**, per request, no model.
- Creating a refund record is a prebuilt endpoint. **Code**, triggered by a human click.

What is left for AI is the short list of things code genuinely cannot do:

1. **Interpret a fuzzy intent** — "I was charged twice" → which view, which booking.
2. **Decide what to surface beyond the required** — the required actions for a screen are fixed; AI chooses which *optional* ones help this person, now.
3. **Author a new artifact** — a Vex shape + query, a Nova layout — that nobody pre-built. Code cannot invent these. AI can.

That is the whole AI budget. Three jobs. Everything else is deterministic plumbing, and the plumbing is where the reliability comes from.

### The division of labor

| | Does what | Examples | Never does |
|---|---|---|---|
| **Code** (endpoints, Vex, Cortex rules) | Every state change, every query, every recording, every deterministic interaction. Actions carry their own endpoints, so the system interacts on its own. | Write the refund. Record the resolution. Query open tickets in scope. Fire a rule. | Decide what a human meant. Invent a query that doesn't exist. |
| **AI** (specialized agents) | Only the three irreducible jobs above. Produces validated JSON; the system applies it. | Pick which optional action to surface. Compose a new shape+query+chart. Read intent. | Execute a mutation. Record that anything happened. Make a decision code could make. |
| **Human** | Reviews the concrete, bound widget and clicks the button for consequential mutations. | "Refund $100 to booking #1432" — verify, click. | — |

The litmus test for any step: *can code do this deterministically?* If yes, it is not allowed to be AI.

## The unit: an Action that carries its own data and its own endpoints

A Nova [`ActionDefinition`](packages/nova/src/action/schemas/index.ts) is `layout` + `data` + `endpoints` + `triggers`. Two properties of it do most of the work:

**The action's initial data doubles as its Vex shape.** An action that lists open tickets declares its data as the shape of what it wants — `{ tickets: [{ id, subject, status }] }`. That same shape *is* the Vex query shape. So binding an action to live data is: hand its data-shape to Vex with the current scope, get matching rows back, render them. The action's display contract and its query contract are one artifact. (The one wire this needs that doesn't exist yet: a seam that fills an action's data from Vex on mount. Today data is static defaults merged with `input` — [lifecycle.ts](packages/nova/src/action/runtime/lifecycle.ts). See "What is actually new.")

**The action carries its own endpoints, so interaction is deterministic.** The button is wired `{ event: 'ui:click', do: [{ call: 'refund' }] }` — a human's click fires the endpoint with the bound data ([effects.ts](packages/nova/src/action/schemas/effects.ts)). The AI is structurally not on this path. It selected the action and set the data; the system and the human do the rest. This is the safety boundary, and it is already how Nova works.

Actions are pure JSON. They are authored anywhere, validated by Zod, stored in a DB, scoped, loaded on demand. **No React runs to create them.** React enters only at render time, resolving component names to components. It is a renderer, nothing more — which is why "the server holds the projection" is not a missing feature: there is no client-only runtime state to be authoritative about. The state is the DB; the layout is data; React draws it.

## The substrate the three products share

Before the products, the shared wiring — most of which is standard, not Nisc's invention.

- **Identity & scope.** A token on the URL signs who you are; standard session auth, not something we build in Nisc. Scope is the dial for everything downstream: how context is built, which agents load, which actions exist. A global shell resolves scope `*`; a customer-service seat resolves `"cs"`.
- **Action selection is segmented RAG.** `findAction(intent, scope)` and `listActions(scope)` retrieve from the action library, partitioned by scope. Scope bounds safety *before* retrieval quality matters — a "cs" seat can only ever be handed "cs" actions, so a bad RAG hit is wrong, not dangerous. (Open: does `findAction` return one action or a shortlist the agent chooses from? Probably top-1 for required, AI-choice among a shortlist for optional.)
- **Projections, persisted and pushed.** Each identity has a projection — its canvases and actions — held in the DB. Transport is sockets from the start: a state change is **written to the DB and pushed to connected clients at the same time**. So a seat that logs in is seeded from the DB with no AI call, and a seat that is connected sees changes live. This is the part that makes the async story work, and it is ordinary engineering.
- **Rules gate the token spend.** An ambient agent that wakes on every bus event is slow and expensive for mostly-nothing. [Cortex's declarative rules](packages/cortex) decide *whether an event even warrants AI*. The rule is code and fires deterministically; it escalates to a model only when there is a real judgment to make. The cheap gate keeps trivial triggering out of the model — which is the rule from the top, applied to the AI's own wake-ups.

---

## 1. Design-mode dashboard — authoring at the speed of asking

**The product.** A dashboard with an edit button. Click it and you are in design mode: a [Loom](packages/loom) surface with an AI assistant. You change the dashboard by asking. *"Add MRR to that graph."* *"Make this line thicker."* When you like it, save. If you wreck it, reset to the team's default — nothing is broken, because you were only ever editing your own copy.

This is the one place generation is the *point*, not the fallback, and it is safe precisely because the blast radius is one user's own view and the undo is a reload.

**The loop.**
1. *"Add MRR to that graph."* The Vex agent changes the panel's shape to include `mrr` and loops until the query returns correct data, which then locks in and caches. (No incremental-edit primitive needed — the agent loop converges and the result is cached; a changed shape is just a new cache key.)
2. The Nova agent updates the panel's action — new shape, a layout that plots the new series.
3. Preview re-renders. *"Make this line thicker"* is a validated prop-write on one layout node through Loom's binding path — not codegen. An edit that breaks the schema simply fails Zod.
4. Save the action to the store under `{ userId, dashboardId }`.
5. Reset = load the published version instead of the user copy.

**Division of labor.** AI: read intent, compose the shape/query/layout. Code: run the query (Vex), validate the layout (Zod), persist (endpoint), reset (load published). Human: decides it is good, saves.

**Why it is the right first generation case.** Authoring data-driven UI by hand is *more* work than coding a screen — arranging nodes, wiring bindings — which is why these architectures never won. The AI removes exactly that tedium; the human fine-tunes and approves; the worst case is "reset."

---

## 2. Customer-service shell — async by nature, code by default

**The product.** A support flow where customer, agent, and supervisor each have a scoped projection, and the work moves between them through the DB, not through a live AI. The AI interprets and decides; the system records and routes; humans execute the consequential steps.

The correction that shapes everything here: **you cannot push into another person's projection as if they were standing there.** The agent is at lunch, or it is 3am. The projection lives in the DB; the socket pushes when they are connected and the DB holds it when they are not.

**The loop (a double-charge), code-first and asynchronous.**
1. **Customer projection.** *"I was charged twice for #1432."* The customer's AI reads the intent and surfaces the **charges view** — a Vex shape scoped to this customer. The query is code+scope; the *decision to show it* is the AI's job.
2. **Request, recorded.** The customer confirms and asks for a refund. A refund is agent-executed, so this becomes a ticket: a **mutation endpoint writes the refund request to the DB.** It now exists permanently — no model is in this path, so nothing can lose it.
3. **Nobody waits.** The agent is offline. The request sits in the DB. No token is spent idling.
4. **Agent logs in — no AI call.** Their projection seeds from the DB. An `openTicketsList` action, backed by a Vex shape scoped to `"cs"`, renders the pending refund the instant they connect. They see their work without a model ever running.
5. **Human executes.** The agent opens the ticket into a **refund action**, prefilled from the ticket data — booking, amount. They verify the concrete values and click. The action's **own endpoint executes the refund and records the resolution.** Code does both. The AI cannot mark it done, cannot mark it not-done; it is not involved.
6. **Routed back.** A Cortex rule fires on the resolution event and pushes a "resolved" action into the customer's projection (DB write + socket push). The customer picks it up live or on next login. The agent's AI may *notice* the event and decide to surface something else — but the recording already happened, in code.

**What only the AI did:** read the customer's intent (step 1), choose to surface the charges view (step 1), possibly decide to surface a follow-up (step 6). Everything else — the ticket, the query, the refund, the resolution, the routing — was code.

**Division of labor.** AI: interpret intent, pick optional surfaces. Code: write the ticket, query the lists, run the refund, record resolution, route via rules + sockets. Human: verify the bound refund and click.

**Hard parts.** The socket-backed projection sync (write-and-push, seed-on-login) is real but standard engineering. The genuinely hard part is **fine-tuning** — what each scope's agent is allowed to surface, how context is built per role, when a rule escalates to AI. The build is small; the tuning is the work.

---

## 3. The surfacing assistant — stop navigating, start asking

**The product.** Expert apps teach you to *find* things: click here, then there, to reach "add user." Nova can surface anything anywhere, so the tree stops being a maze. An assistant over the shell takes *"add a new user, Frank Drebbin,"* selects the **add_user** action via `findAction(intent, scope)`, prefills the name, loads it into the main canvas, and says *"check it and click."* The human reviews and clicks; the action's endpoint creates the user. It also rearranges the workspace on request — *"user list left, accounts right, add-user at the bottom"* — and you can save that arrangement and recall it.

**The loop.**
- *"Add user Frank Drebbin."* AI: `findAction("add user", scope)` → `add_user`, prefill `{ name }`, surface it. Human: verify, click. Code: the endpoint creates the user and records it.
- *"User list left, accounts right, add-user at the bottom."* AI: arrange the canvases and put the right action in each. Code: the canvases query their own data via their Vex shapes; the layouts are validated JSON.
- *"Save this as my ops view."* The arrangement is just an action's data written to the DB — the same persistence as product 1. *"Open my ops view"* loads it back, and each canvas self-loads from Vex with no AI.

**Why it is the lowest-risk, highest-leverage first build.** Almost every piece is native: surfacing a prefilled action, arranging canvases, self-loading data via Vex. The only AI is intent → `findAction` → prefill, and the only consequential step is a human click. It is the cleanest proof that selecting-and-surfacing beats navigating — and that the AI's job is to remove tedium, not to make decisions.

---

## What is actually new (and what is just tuning)

Most of this is not a hard build. The honest list:

**Real, but bounded, engineering:**
- **Action-data-from-Vex seam.** The one genuinely missing wire: filling an action's data from its own shape via Vex, scoped, on mount — so `openTicketsList` self-loads. Small, but it does not exist today.
- **Segmented action RAG.** `findAction(intent, scope)` / `listActions(scope)` over the action library, partitioned by scope. We have the pieces (embeddings via Signal, pgvector via the PGlite/Postgres Vex already uses); they are unassembled.
- **Socket-backed projections.** Write-to-DB-and-push, seed-on-login. Standard real-time engineering, not a research problem.

**Not Nisc's to build:** identity, session tokens, role management — standard auth, a solved problem we should not re-solve.

**Where the actual work goes — fine-tuning, not building:**
- Context engineering per scope: what each role's agent sees and is allowed to surface.
- The agent/tool surface itself — **explicitly unsettled.** The AI does not hold a big imperative API over the shell; it runs specialized agents (vex/nova/prism) that emit validated JSON the system applies, plus `findAction`. The exact shape of that surface is the next thing to nail down, and the place to be careful.
- Cortex's full-context-dump (an agent can dump everything it saw) makes the tuning observable. Trivial to build; the value is in the tuning loop it enables.

The shape of the whole thing: deterministic systems do everything they can, actions bring their own endpoints so the system interacts on its own, and AI is reserved for the three things code cannot do — read intent, choose what to surface, author what does not yet exist. The reliability is in the code. The AI just makes the data-driven parts usable.
