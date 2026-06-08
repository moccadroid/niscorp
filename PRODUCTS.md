# Products

Applications where the Nisc architecture isn't just possible but _uniquely suited_ — where the design decisions pay off in ways other stacks can't match.

The unique properties at play:

1. **LLMs emit structure, runtimes execute it** (no eval, no codegen)
2. **Everything is JSON, so everything is inspectable/cacheable/diffable**
3. **Streaming structured output stays always-valid mid-stream** (Solid)
4. **Shape-based caching means LLM costs amortize toward zero** (Vex)
5. **Server-authoritative UI from declarative definitions** (Nova)
6. **Agent orchestration with declarative guardrails** (Cortex rules)
7. **Human-in-the-loop is first-class, not bolted on**

---

## 1. Enterprise Data Concierge (Multi-Tenant SaaS)

**The idea:** A natural-language data access layer that sits between business users and your company's databases. Not a chatbot — a _query service_ with a UI.

**Why this stack, specifically:** The killer combination is Vex's scope policies + shape-based caching + Prism reshaping. Every tenant gets server-side scope injection that the LLM literally cannot see or override. The first user who asks "show me revenue by region" generates the DSL; every subsequent user with the same shape hits the cache — zero LLM cost. Prism reshapes the raw rows into whatever the frontend needs (charts, tables, summaries). Nova renders the results with conditional layouts that adapt to what the data looks like (one result? a card. Hundreds? a paginated table with sort).

**What makes it non-trivial:** Multi-tenant data access is the problem every B2B company has and nobody trusts AI with — because text-to-SQL is injection-prone and uncacheable. Vex's constrained DSL is architecturally injection-proof and cache-by-shape amortizes cost. The scope system means you could sell this as infrastructure to companies who want to let their _customers_ ask questions about _their_ data, with row-level security enforced server-side. That's a real product.

**Stack flow:** User question → Vex (query agent, scope injection, shape cache) → SQL → Prism (reshape to UI shape) → Solid (stream the structured result) → Nova (adaptive layout: chart/table/card depending on result shape)

---

## 2. Compliance-Auditable Agent Platform for Regulated Industries

**The idea:** An agentic workflow system for finance, healthcare, or legal — domains where "the AI did something and we can't explain what" is a non-starter.

**Why this stack, specifically:** Everything being JSON and event-based means every agent decision, every tool call, every plan, every rule firing is a structured, replayable record. Cortex's bus emits typed events for the entire lifecycle. Plans are data — you can diff them, version them, feed them to an auditor. The policy gate with human-in-the-loop confirmation means high-risk actions (approve a claim, flag a transaction, draft a legal clause) pause for human sign-off, and the confirmation event is part of the audit trail. Declarative rules aren't just guardrails — they're _auditable guardrails_. A regulator can read `{ when: { $gte: ['$watch.riskScore', 0.8] }, then: { deny: 'exceeds threshold' } }` and understand the policy without reading code.

**Concrete shape:** Imagine a claims processing system. A Cortex director agent receives a claim, spawns specialist agents (medical code validator, fraud detection, policy matcher) via `parallel` branches. Each specialist uses tools (database lookups via Vex, document analysis via Signal). The rules engine enforces business policies declaratively. High-value claims trigger human-in-the-loop. Every step is an observation on the bus. The Nova frontend shows the live processing state — which agents are active, what they found, where human input is needed — server-authoritative, so the operator and the agent see the same state.

**What makes it non-trivial:** Regulated industries need _explainability_ and _deterministic policy enforcement_. Most agent frameworks are black boxes with imperative hooks. Cortex's design — JSON plans, typed events, declarative rules, Result<T> error model — was practically designed for this. The `previewContext` API alone is gold for auditors: "show me exactly what the model saw when it made this decision."

---

## 3. Live Collaborative Operations Center

**The idea:** A real-time operational dashboard where AI agents and human operators share the same workspace. Think mission control, but the agents are doing the routine monitoring and the humans step in for judgment calls.

**Why this stack, specifically:** Nova's server-authoritative architecture means the UI state lives on the server. Multiple clients render the same shell state. An agent can push a new canvas (an alert, a recommendation, an escalation) and every connected operator sees it simultaneously. Cortex's bus is the coordination backbone — an agent detects an anomaly, emits an event, a rule fires, Nova's data store updates, the UI reflects it, all through the same event substrate. The `tell_topic` / `wait` plan nodes enable async coordination patterns: agent flags an issue, waits for operator acknowledgment, then proceeds.

**Concrete shape:** Network operations center. Cortex agents monitor data streams (ingested via tools). When an agent detects a pattern, it pushes a diagnostic canvas into Nova's shell. The canvas shows the agent's analysis (streamed through Solid, so the operator watches the reasoning form). Critical actions require confirmation (Cortex HITL). The operator can override, redirect, or approve. Rules enforce escalation policies: if the agent has been investigating for > 5 minutes without resolution, escalate to senior ops. Everything is on the bus, everything is replayable for post-incident review.

**What makes it non-trivial:** The VISION.md mentions collaboration/multiplayer as "natural extension of server-authoritative UX." It is. But the real insight is that Cortex agents and human operators are _peers on the same bus_. An operator's click fires an event the same way an agent's tool call does. The rules engine doesn't care who produced the event. This collapses the "AI tool" vs "human workflow" distinction into a single event-driven system.

---

## 4. Self-Reshaping Analytics Product

**The idea:** An analytics product where the queries, the transformations, AND the UI layouts are all generated, cached, and version-controlled as JSON artifacts. New "features" are generated by agents, reviewed by humans, then deployed as cached JSON — no code changes, no deploys.

**Why this stack, specifically:** This is the stack's thesis taken to its logical conclusion. A "feature" in this system is: a Vex DSL query (how to get the data) + a Prism IR (how to reshape it) + a Nova ActionDefinition (how to display it). All three are JSON. All three are generated by agents. All three are Zod-validated. All three are cacheable and fingerprint-addressable. The "deploy" is writing three JSON blobs to a store. Rollback is restoring the previous blobs. A/B testing is serving different blobs. Version history is diffable.

**Concrete shape:** A product analytics dashboard. A business user says "I want to see user retention by cohort with a heatmap." A Cortex director coordinates: the Vex query agent generates the DSL for cohort data, the Prism mapping agent generates the transformation to pivot it into heatmap shape, a Nova layout agent generates the ActionDefinition with the heatmap component, conditional loading states, and refresh triggers. All three outputs are validated, compiled, cached. The next user who wants cohort retention gets the same cached artifacts. The business user can tweak the layout in a visual editor (Nova's JSON is human-editable). The whole "feature" is three versioned JSON files.

**What makes it non-trivial:** Most "AI-powered analytics" generate SQL strings or Python notebooks. Those aren't cacheable by shape, aren't safe to execute without sandboxing, and aren't diffable for review. Nisc's constraint — everything is validated JSON — turns a liability ("we can't generate code") into the core product advantage. Generated artifacts are safe _by construction_, not by sandboxing.

---

## 5. Adaptive Internal Tooling Engine

**The idea:** Instead of building internal tools with Retool or Airplane, you describe what you need and agents generate the tool as a set of JSON artifacts — backed by your real databases, with real access control, deployable instantly.

**Why this stack, specifically:** Internal tools are the sweet spot for this architecture. They're high-volume (every company needs dozens), low-stakes enough for AI generation, but need real data access and real security. Vex handles the data layer with scope policies mapping to your IAM. Nova handles the UI as JSON ActionDefinitions — forms, tables, detail views, wizards. Prism handles the data reshaping between what the DB returns and what the UI needs. Cortex orchestrates the generation and can also power _agentic features within the generated tools_ (an internal tool that has its own AI assistant, running on the same stack).

**Concrete shape:** "Build me an employee onboarding tracker. It should show pending tasks, let HR mark them complete, and notify managers when their reports are onboarded." The system generates: Vex queries for the task list (scoped to the current HR user's department), a Prism transform to reshape the data for a table with status badges, and a Nova ActionDefinition with the table, filter controls, a detail modal with mutation triggers for marking tasks complete, and an `emit` effect that publishes to a notification channel. The whole tool is JSON. Editing the tool is editing JSON. Adding a field is regenerating one artifact.

**What makes it non-trivial:** Retool is a code-based tool builder. This is a _description-based_ tool builder where the artifacts are validated, cached, and composable. The Vex scope system means you don't need to trust the AI with auth — it's enforced server-side. And because Nova ActionDefinitions are themselves JSON, you can have agents that _modify existing tools_ — "add a priority column to the onboarding tracker" regenerates the layout artifact while keeping the query and transform unchanged.

---

## 6. Document Intelligence Pipeline (with Streaming Audit Trail)

**The idea:** Process complex documents (contracts, medical records, financial filings) with specialized agents, where the extraction, validation, and presentation all flow through the same declarative pipeline — and the entire chain is observable.

**Why this stack, specifically:** This is where Cortex's producer model and Solid's streaming really shine together. A plan-mode agent processes a document section by section. Each section gets its own specialist (clause extractor, entity recognizer, risk scorer). Solid streams each specialist's structured output with subtree finalization — the "parties" section finalizes and the UI displays it while "obligations" is still being extracted. Prism transforms the raw extractions into normalized shapes for downstream consumers. Rules enforce quality gates: if extraction confidence drops below threshold, the system flags it for human review (HITL).

**Concrete shape:** Contract review. Upload a contract. Cortex's director spawns parallel agents: party extractor, obligation extractor, risk clause identifier, financial terms extractor. Each agent uses Signal with structured output schemas tailored to their domain. Solid streams each extraction — the UI shows parties appearing, then obligations, then risk flags, each in its own Nova canvas. When a risk clause is identified, a Cortex rule fires a custom effect that pushes a "Review Required" action onto the shell. The legal reviewer sees the agent's extraction alongside the original text, confirms or corrects, and the correction feeds back as an observation for the agent's next iteration. The entire pipeline — every extraction, every confidence score, every human correction — is on the bus.

---

## The Common Thread

These aren't "AI apps." They're applications where the **constraint that everything must be validated JSON** transforms from a limitation into a product feature:

- **Cacheability** turns LLM cost from linear to amortized-zero (Vex shape caching, Prism IR fingerprinting)
- **Inspectability** turns compliance from a burden to a feature (Cortex bus, previewContext, observation logging)
- **Safety** turns untrusted AI output into deployable artifacts (Zod validation, scope policies, policy gates)
- **Declarativeness** turns agent behavior into diffable, reviewable, version-controllable data (plans, rules, layouts, transforms)

The most interesting applications are the ones where people currently _can't_ let AI touch production because they can't audit, constrain, or cache what the AI produces. Nisc's architecture was designed precisely for that gap.

The fact that all of this works with small, constrained models (gpt-3.5 class and up) is not a limitation — it's the proof that the architecture is right. Constrained grammars + validated schemas + small-decision agents = reliable systems that happen to use LLMs, not LLM experiments that happen to sometimes work.
