# Possibilities

[PRODUCTS.md](PRODUCTS.md) lists applications the Nisc stack is uniquely suited to build — verticals where the architecture pays off. This document is different. It is not about which products to build. It is about what the architecture now lets us *do* that could not be done before, in any vertical.

Three things changed the ceiling:

- **Reflexivity.** [Loom](packages/loom) turns any Zod schema into an editing UI on [Nova](packages/nova), nearly for free. Because every artifact in the stack — a Vex query, a Prism transform, a Nova layout, a Cortex plan — is defined in Zod, every artifact is now self-editable. The tools edit the tools.
- **Zero backend.** [Vex](packages/vex) runs against Postgres compiled to WebAssembly (PGlite) in the browser. A full data application — real SQL, vector search, scope policies — needs no server. The data can travel with the app.
- **The app is a value.** A complete application is a bundle of JSON: queries (Vex) + transforms (Prism) + layout (Nova) + orchestration (Cortex) + the data itself (a PGlite snapshot). Not described by JSON — *made of* it.

The consequence runs through everything below: when an app is data, it inherits the properties of data. It can be copied, forked, diffed, merged, emailed, generated, versioned, replayed, and simulated. Those verbs did not apply to software before. They do now.

Each entry states the capability, why it was not possible before, why this stack makes it possible, and the smallest thing we would build in [lab](apps/lab) to prove it.

---

## 1. The application as a portable file

**The capability.** Serialize a whole running application — its Vex queries, Prism transforms, Nova layouts, and a snapshot of its Postgres data — into a single file. Send it to someone. They open it in a browser and it runs: live, interactive, queryable, offline. No install, no server, no account. They edit it, fork it, send it back. You diff the two versions and see exactly what changed, because the diff is over JSON, not pixels.

**Why it wasn't possible before.** An application was code plus a server plus a database. You could hand someone a screenshot, a spreadsheet, or a login. You could not hand them a *running, data-bearing app* as a thing — because the runtime, the UI, and the data lived in three different places, none of them portable.

**Why this stack.** Every layer is already JSON, so the app definition is serializable. Vex runs on PGlite, so the database is a file that runs in the browser too. Bundle the artifacts and the data snapshot and you have the whole thing in one value. Nova renders it; Vex queries it; nothing phones home.

**First step (lab).** Take one showroom dataset and its Nova views, serialize them plus the PGlite snapshot to a single `.nsc` file, and build a loader page that opens the file and runs it with no network. Prove that the reopened app queries its own bundled Postgres offline.

---

## 2. Software that rewrites itself, live

**The capability.** A running application carries an editor for its own definition. A user — or a Cortex agent — proposes a change to a screen, a query, or a transform. The change arrives as a JSON-Patch over the artifact, shown as a reviewable diff. On approval it applies in place and the app re-renders. No build, no deploy, no code change. Every user can run their own fork, diverged from the base, and the fork is still a diff you can read and merge.

**Why it wasn't possible before.** Changing software meant editing source, building, and deploying — minutes to days, and a developer in the loop. AI-proposed changes made it worse, not better: a model emitting code is unreviewable and unsafe to apply. So "the app changes itself while you use it" was either impossible or reckless.

**Why this stack.** Loom made "an editor for any schema" nearly free, so the app can present an editor over its own Nova/Vex/Prism artifacts. Those artifacts are data, so a change is a patch. Cortex emits schema-valid output, so an agent's proposal cannot be an invalid artifact — only a diff a human approves. Applying it is writing JSON to a store and re-rendering. Safe by construction, reviewable by default.

**First step (lab).** A Nova screen with an "edit this screen" control that opens the screen's own ActionDefinition in a Loom editor. Save writes the new layout and the screen re-renders from it — the app editing itself, no reload.

---

## 3. Branchable operations and counterfactual state

**The capability.** Fork the live state of a running system the way you branch code. Run agents down each branch in parallel, against the forked data, with real effects contained inside the fork. Compare the end-states. Merge the one you want. "What if we approved every pending claim?" or "what if we re-priced this segment?" runs for real — fully, not as an estimate — in a sandbox copy, before anything touches the actual system.

**Why it wasn't possible before.** Production state was a single mutable thing. Forking it meant standing up a parallel environment and copying a database — expensive and slow, so nobody did it per-decision. And even with a copy, agent *reasoning* was not replayable, so you could not compare two runs meaningfully.

**Why this stack.** State, agent reasoning, tool calls, and effects are all JSON events on the Cortex bus — replayable and forkable. A PGlite database is a cheap in-memory copy, so forking the data is near-free. Run the same agent against two forks and you get two complete, inspectable timelines to diff.

**First step (lab).** Duplicate a PGlite dataset in memory, run a Cortex agent against the copy, and show a side-by-side diff of the original and the post-run state plus the agent's event timeline. Prove that the fork is real and the original is untouched.

---

## 4. Agent ghost mode — trust earned on simulated worlds

**The capability.** Before an agent touches production, run it against a synthesized world. Generate a plausible Postgres dataset, point the *real* agent fleet at it, and gate every effect off. Watch exactly what it would do — every query, every write it wanted to make, every rule that fired — and measure it. An agent earns real access by demonstrating its behavior on simulated data first, the way a new hire shadows before they sign anything.

**Why it wasn't possible before.** Testing an agent meant either pointing it at production and hoping, or hand-building mocks that never matched reality. You could not run the *actual* agent, at full fidelity, against a *real* database, *safely*. So agents shipped under-tested and trust was a leap of faith.

**Why this stack.** Execution is declarative and every effect passes a policy gate, so "do nothing, just record what you would have done" is a configuration, not a rewrite. PGlite gives a full Postgres to simulate against. The bus records every intended action. The dry run is the real run with its hands tied — same code path, no risk.

**First step (lab).** Run a Cortex agent against a PGlite world with the policy gate set to deny all writes. Log every blocked effect and every query it issued, and render the would-have-done timeline. Prove the agent ran end-to-end and changed nothing.

---

## 5. Just-in-time, disposable software

**The capability.** Stop pre-building screens. A user asks a question; the system generates a throwaway micro-app to answer it — a Vex query for the data, a Prism transform for the shape, a Nova view for the display — renders it, and discards it. If the same question recurs, the artifact bundle is cached by shape, so the second person to ask gets it instantly and for free. The interface is generated per intent, not designed in advance.

**Why it wasn't possible before.** Generated software meant generated code: unsafe to run without a sandbox, and impossible to cache because two answers to the same question were two different strings. So generating a UI per question was both dangerous and ruinously expensive. Software had to be built ahead of time, by people, for anticipated needs.

**Why this stack.** A "feature" here is a small bundle of validated JSON — query, transform, layout — safe to execute by construction and addressable by shape. Vex already caches queries by shape; the same idea extends to the whole bundle. The first ask pays the model; every matching ask after it is a cache hit. Generation becomes cheap enough to do per question, and safe enough to render unreviewed.

**First step (lab).** A single prompt box over the showroom Postgres. Any question returns a rendered Nova view, built from a generated Vex+Prism+Nova bundle. Cache the bundle by shape and show the second identical question resolving with zero model calls.

---

## The common thread

[PRODUCTS.md](PRODUCTS.md) argued that the constraint — everything must be validated JSON — turns into a product feature: cacheable, inspectable, safe, diffable. This document takes the next step. Once the *whole application* is that kind of data, and the data can run in the browser with no backend, and the tools to edit it generate themselves from schemas, software stops being a fixed artifact you ship and starts being a value you pass around, fork, simulate, and rewrite in place.

The five capabilities above are not five products. They are five things that were structurally impossible and are now structurally easy. The products fall out of them.
