# Ray Authoring Actions — Implementation Plan

## Goal

Let Ray turn a data request — e.g. *"Top 10 open deals by value; show company, stage,
owner, close date; click a row to open the deal"* — into a **real, reusable Nova
Action placed on `main`**, not a one-shot static chat visualization.

## Why this is hard (what an action actually is)

An action is an interactive machine, not "layout + endpoints":

- layout components carry node-level `ref`, `model` (two-way binding), and `events`;
- **triggers** `{ event|message, ref, key, do: [steps] }` catch events by `ref` and run
  steps: `set` / `call` / `emit` / `push` / `pop` / `replace` / `mutate`;
- **data** = endpoint-fed slots (query results) **+ model-invented UI state**
  (selection, toggles, `menuOpenId`, counters), with defaults;
- a layout built *for interaction* is structurally different from a static one — it has
  the refs, models, and state bindings that only exist because triggers will drive them.

So `layout`, `triggers`, `data`, `endpoints` are mutually constrained and must be
**co-designed**. Each interaction fans out into a data key, a layout hook, a trigger, and
sometimes an endpoint parameter — all of which must agree. This is an agentic design
problem, not mechanical assembly.

## Architecture

- **Architect agent** (relay) — owns the `ActionDefinition`. Cortex structured agent whose
  output schema is Nova's `ActionDefinitionSchema` (malformed output auto-retried). It
  designs endpoints, data, and triggers, and negotiates the layout.
- **Layout agent** (Nova, upgraded) — designs the tree + interaction hooks; its `reasoning`
  field (steered by a producer) explains to the architect *how to drive* the layout.
- **Inverted handoff via `reasoning`** — the layout **declares** what it built; the architect
  **adapts** (writes triggers/data from the tree + reasoning) or **reacts** (re-invokes with a
  refined intent). No global component event-contract registry.
- **Data-first** — the architect proves its endpoints and gets **real rows** via a headless
  run *before* designing the layout.

## Grounding (verified against the code)

- `reasoning` is a per-agent output-schema field (Nova layout agent, Prism mapping agent
  each declare their own); **Cortex has no default reasoning field or producer.** So the
  field already exists in the schema — we only steer its *content* with a producer.
- `shell.registerAction(def)` **already exists** (runtime registration; a canvas can then
  push/seed it). Phase 4 is not a Nova addition.
- The shell instantiates runtimes via `createActionRuntime(config)` with its own
  `eventBus` / `messageBus` / `layoutStore` / `registry` / `transform` / `fetch`. There is
  **no headless run path** — Phase 2 adds one.
- `ActionDefinitionSchema` is exported from `@niscorp/nova` (usable as the architect's
  Cortex output schema).

---

## Phase 1 — Interaction-aware layout agent + steered reasoning (`@niscorp/nova`)

Files: `packages/nova/src/agent/layout.agent.ts`, `packages/nova/src/agent/palette.ts`,
new `packages/nova/src/agent/reasoning.producer.ts`.

1. **Prompt** — teach node-level `ref` / `model` / `events` usage: when the intent asks for
   interaction, put a `ref` on the interactive node, a `model` on inputs, and bind state into
   props. (All already in `LayoutNodeSchema`; the `omitProps` styling strip is unaffected —
   those are component props, not node fields.)
2. **`reasoningProducer(instruction)`** — a small context producer that injects a system chunk
   steering the `reasoning` field. Add it to the layout agent with an architect-facing
   instruction: *"In `reasoning`, tell the calling agent how to drive this layout — for each
   interactive element: its `ref`, the event it emits and the payload, its purpose; and which
   data slots you bind, marking each as a query result or interaction state."*
3. **Widen the `reasoning` schema description** from "one sentence" to allow that fuller
   explanation.

**Deliverable / test:** invoke with *"a table of deals, each row clickable to open it"* →
a tree with `ref:'row'` and a `reasoning` describing the click contract. Build Nova; assert
the output shape.

## Phase 2 — `shell.runHeadless` (`@niscorp/nova`)

Files: `packages/nova/src/shell/shell.ts`, `shell-internals.ts`, `shell/types.ts`.

1. Add to the `Shell` interface:
   `runHeadless(def: ActionDefinition, input?: Record<string, unknown>): Promise<Record<string, unknown>>`.
2. Implementation: instantiate a runtime through the **existing internal path** (the shell's
   `eventBus` / `messageBus` / `layoutStore` / `registry` / `transform` / `fetch` / `functions`)
   but **off-canvas** — `mount()` (runs the lifecycle → endpoints), read `getData()`, `dispose()`.
   No render, never attached to a canvas.
3. Reuses `createActionRuntime`; no new config plumbing.

**Deliverable / test (relay):**
`shell.runHeadless({ data:{rows:[]}, endpoints:{ load:<deals query endpoint> }, lifecycle:{ mount:[{call:'load'}] } })`
→ real rows. Add a `dev/` check.

## Phase 3 — The Architect agent + the loop (relay, `src/architect/`)

Files: new architect agent + its two tools.

1. **Agent** — Cortex structured agent, `outputSchema = ActionDefinitionSchema`.
2. **Tools:**
   - `run_headless(reducedDef)` → data (Phase 2, via the bound shell).
   - `design_layout({ intent, dataShape })` → `{ layout, reasoning }`
     (wraps `runAgentStandalone(layoutAgent, …)`; return-schema auto-retry).
3. **Loop:**
   1. interpret request → data needs + intended interactions;
   2. draft endpoints → `run_headless` → real rows (proves the endpoints; the action's
      `endpoints`/`data` start accreting here);
   3. `design_layout(intent describing the interactions, real dataShape)` → `{ layout, reasoning }`;
   4. **ingest both** — the **tree** for exact refs/bindings (can't guess ref strings), the
      **reasoning** for purpose/wiring — vibe-check → author `triggers` + initial `data`, **or**
      re-invoke `design_layout` with an updated intent;
   5. emit the assembled `ActionDefinition` (self-validated), end.

**How "both" looks — the top-10 deals example.** `design_layout` returns the tree plus a
reasoning like *"`ref:'row'` emits `deal_id`, open the deal; binds `$.rows` (query result) and
`$.highlight_id` (selection, default `''`)."* The architect emits:

```
data:      { rows: [], highlight_id: '' }
endpoints: { load: <deals query endpoint> }
layout:    <the returned tree>
triggers:  [{ event:'ui:click', ref:'row',
             do:[ { set:'highlight_id', value:'@event.payload.deal_id' },
                  { push:{ action:'deal', input:{ id:'@event.payload.deal_id' } } } ] }]
lifecycle: { mount: [{ call: 'load' }] }
```

If the returned layout isn't clickable, it **reacts** — re-invokes with *"make each row clickable,
emitting the deal id."*

**Deliverable / test:** the architect produces a valid `ActionDefinition` for the top-10
request (schema-valid, endpoints run headless, triggers reference real refs).

## Phase 4 — Register / push / persist (relay — mostly free)

1. **`save_view` tool:** `shell.registerAction(def)` (exists) + `shell.push('main', def.id)`.
2. **Persistence + reopening:** a store like `ray/sessions` (serialized `ActionDefinition`s in
   localStorage, re-registered on boot) + a "Views" entry in the sidebar. Wing it initially.
3. **Caching:** the action re-runs its query on mount, so it wants a **trusted/promoted** cache
   entry to be deterministic. Rides today's cache-on-miss for now; see deferred.

---

## Deferred / open

- **Cache tiering + promotion** — a trusted tier (seeded + promoted) vs a provisional tier (LLM
  generations); screen/action reads hit trusted-only; "save a view" *promotes* the exact
  generation (a flag flip, no re-run). An action's reliability ultimately depends on this.
- **Component event-contract hardening** — palette event hints so the layout agent describes
  interactions from fact, not memory. Only if trust-plus-retry proves flaky; the schemas/meta
  are heavy, so later.
- **Interactivity depth** — v1 is read-only + click-to-open; richer interactions iterate.

## Build order

**Phase 1 → 2 → 3 → 4**, each testable before the next depends on it. Phases 1–3 reach
"architect reliably emits a valid, interactive `ActionDefinition`"; Phase 4 makes it live on
`main` and reusable (`registerAction` already exists, so it is small).
