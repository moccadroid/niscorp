# Super Apps

Five full-stack showcase apps that pull the entire Nisc stack together: signal, solid, prism, nova, and cortex. Each one demonstrates a different facet of the interplay between packages.

The common thread: **signal streams, solid parses incrementally, prism reshapes, nova renders live, cortex orchestrates**. That's a full pipeline from LLM tokens to live UI with zero glue code that isn't declarative.

---

## 1. Pulse — Streaming Intelligence Panel

**Pitch:** Ask a complex question. Watch the answer *materialize* — not word by word, but *structure by structure*.

### How it works

Signal streams a rich structured response (analysis, evidence array, confidence scores, recommendations). Solid parses it incrementally — each section has its own `select()` projection, so `select('evidence')` fires independently from `select('recommendations')`. Prism transforms raw confidence floats into display tiers (`{$case: [{when: {$gte: ...}, then: "high"}]}`). Nova renders a multi-panel layout where each section fills in independently, with conditional nodes swapping placeholders for content as data arrives.

### What it shows off

| Package | Feature |
|---------|---------|
| signal | `stream()` producing structured JSON via schema-in-system-prompt |
| solid | `createStream()` with `select()` projections, subtree finalization, structural sharing |
| prism | View-model transforms between raw LLM output and nova binding expressions |
| nova | Conditional nodes, loop nodes, data-bound layout reacting to live-updating data |

### The wow moment

The "evidence" panel fills with items one by one (solid array element tracking). Each item's confidence badge resolves from "..." to a colored tier (prism transform) the instant it finalizes — while the recommendations section is still streaming below. Only the actively-streaming panel re-renders, because structural sharing means unchanged sections keep the same reference.

### Key integration points

- `signal.stream(prompt)` yields `StreamEvent<T>` → on each `text` event, feed chunk into `solid.write()`
- `solid.select('evidence').on(items => ...)` fires only when evidence changes — wire into nova's data store
- `solid.select('confidence').onFinal(score => ...)` triggers a prism transform for the display tier
- Nova layout uses `{for: "$.evidence", as: "$item", do: [...]}` with conditional nodes for loading/loaded states

---

## 2. Alchemist — AI Data Transformer

**Pitch:** Paste in some data. Describe what you want. Watch an AI *write a transformation in real-time* and see the output update live as the transform takes shape.

### How it works

The user provides sample JSON + a natural language description. Cortex's mapping agent (already exists in `@niscorp/prism/agent`) generates a Prism config. Signal streams the generation. Solid incrementally parses the config as it forms — and on every `current()` snapshot, the app runs `evaluateSafe(currentConfig, sampleData)` to show a live preview of what the *partial* transform produces. Nova renders a three-pane layout: source data, streaming config, live output. When solid fires `onFinal`, the app calls `compile()` and shows the IR stats (node count, optimizations applied, fingerprint).

### What it shows off

| Package | Feature |
|---------|---------|
| cortex | Agent orchestration via the mapping agent; structured output with auto-retry |
| signal | Streaming structured output that is itself an executable program |
| solid | Always-valid `current()` snapshots — even half-formed configs are evaluatable |
| prism | `evaluateSafe()` for safe partial evaluation; `compile()` optimizer stats |
| nova | Three-pane data-bound layout reacting to three different data sources simultaneously |

### The wow moment

The transform output starts as `{}` and progressively fills in as the LLM writes more of the config. A `$map` appears and suddenly the output becomes an array. A `$filter` drops in and half the rows vanish. You're watching a program *write itself* with live execution at every step. When it finalizes, the compiled IR tab shows "3 constants folded, 12 handlers attached" — the optimizer just made the AI's code faster.

### Key integration points

- Cortex `runAgentStandalone()` with the prism mapping agent, whose `outputSchema` embeds `ConfigSchema`
- Signal streams the agent's LLM calls; solid receives the chunks
- On every `solid.on()` callback: `evaluateSafe(solid.current(), sampleInput)` → write result to nova data store
- `solid.onFinal()` triggers `compile(finalConfig)` → display `CompiledIr.meta.stats` in an inspector tab
- Nova layout binds the three panes: `$.source` (static), `$.config` (streaming), `$.output` (derived)

---

## 3. Nerve Center — Live Agent Execution Visualizer

**Pitch:** Watch an AI agent think, plan, act, and adapt — rendered as a live operational dashboard.

### How it works

Cortex runs a plan-mode agent tackling a multi-step task (e.g., "research and compare three products"). The manifold's bus emits typed events for every lifecycle moment. A custom context producer subscribes to the bus and accumulates state. Signal powers the LLM calls. For each tick, the agent's structured plan output streams through solid, so you see the plan forming before it executes. Nova shell manages three canvases: **Trace** (vertical timeline of bus events), **Plan** (current tick's action plan, live-streaming), **Result** (accumulated output). Prism transforms raw bus events into display-ready shapes (e.g., `cortex.tool.observed` → `{tool, duration, status}`). Cortex rules fire visual alerts — if error count > 3, an `inject` rule adds a warning that appears in the Trace canvas AND modifies the agent's next context.

### What it shows off

| Package | Feature |
|---------|---------|
| cortex | Plan mode end-to-end: tick loop, observations, `ask_agent`, rules with accumulators |
| cortex | Bus as universal event substrate — everything that happens is an event |
| cortex | Rules engine: `count` accumulator on errors → `inject` effect as live guardrail |
| signal | Powers every LLM call inside cortex via `step()` |
| solid | Streams the plan output *before* it executes (see the AI's intent forming) |
| prism | Transforms bus events into view-model shapes for each canvas |
| nova | Shell with multi-canvas navigation, cross-action message bus |

### The wow moment

The rules engine fires mid-execution. A warning banner appears in the Trace canvas. The Plan canvas shows the agent's *next* plan streaming in — and you can see it adapted to the warning. The AI is reacting to guardrails in real-time, and you can see both sides. The Trace canvas shows the full causal chain: observation → rule evaluated → rule fired → injection added → next tick's context includes the warning → agent's plan changes.

### Key integration points

- `createManifold()` with bus, rules, and the plan-mode agent
- `bus.on('cortex.#', event => ...)` feeds events into a prism transform → nova data store for the Trace canvas
- Each tick's `cortex.plan.produced` event carries the streaming plan → solid parses it → nova's Plan canvas
- `defineRule({ watch: { errorCount: { event: 'cortex.error', aggregate: 'count' } }, rules: [{ when: {$gte: ['$watch.errorCount', 3]}, then: {inject: '...'} }] })`
- Nova shell: `push('trace', 'trace-action')`, `push('plan', 'plan-action')`, `push('result', 'result-action')`
- Cross-canvas communication via nova's message bus: plan canvas publishes execution progress, trace canvas subscribes

---

## 4. Forge — Conversational App Generator

**Pitch:** Describe a mini-app in plain English. Watch it get built — layout, logic, and all — then use it.

### How it works

A cortex structured-output agent receives a natural language description ("a todo app with categories and a priority filter"). Its output schema IS a Nova `ActionDefinition` — layouts, triggers, mutations, endpoints, data shape, all of it. Signal streams the generation. Solid parses incrementally. A split-screen nova shell shows two canvases: **Blueprint** (the raw JSON forming, with `select()` projections highlighting which section is currently streaming) and **Preview** (a live nova action runtime instantiated from `solid.current()`). As solid's `current()` updates, the preview re-renders: first the layout skeleton appears, then data defaults fill in, then triggers wire up. When finalized, the preview becomes fully interactive — clicks fire triggers, mutations update data, the whole lifecycle works.

### What it shows off

| Package | Feature |
|---------|---------|
| cortex | Structured-output agent generating executable UI definitions, with auto-retry on schema failure |
| signal | Streaming structured output where the output *is* a program |
| solid | Always-valid snapshots consumed by nova — partial definitions render partial UIs |
| nova | Full lifecycle: the generated app has real triggers, mutations, model binding, lifecycle hooks |
| nova | Headless architecture — same `ActionDefinition` powers JSON view and live preview |
| prism | Optional: transforms API responses if the generated app has endpoints |

### The wow moment

Mid-stream, the preview pane shows a text input and a button — but they don't do anything yet. Then the `triggers` array starts streaming. The moment a trigger connecting `ui:click` to a `push` mutation finalizes, you click the button in the preview — and it works. The app became interactive *while it was still being generated*.

### Key integration points

- Cortex agent with `outputSchema: ActionDefinitionSchema` (or a curated subset)
- Signal streams → solid parses the `ActionDefinition` incrementally
- `solid.select('layout').on(layout => ...)` updates the Blueprint canvas's layout highlight
- `solid.on(def => createShell({ actions: [def], ... }))` re-instantiates the nova runtime on each snapshot
- Nova shell: `push('blueprint', 'blueprint-action')`, `push('preview', 'preview-action')`
- The preview canvas uses `NovaShellProvider` wrapping a dynamically-created shell from the streamed definition
- `solid.onFinal()` freezes the preview into a stable, fully interactive app

---

## 5. Mosaic — Adaptive Multi-Agent Research Board

**Pitch:** A research workspace where multiple AI agents collaborate, and the UI adapts to what they find.

### How it works

The user poses a research question. Cortex plan-mode orchestrates a coordinator agent that spawns specialist agents via `ask_agent` plan nodes (and `parallel` for concurrent work). Each specialist streams structured findings through its own solid stream. Nova shell manages a dynamic grid of canvases — one per specialist, plus a synthesis canvas. As agents complete, the coordinator uses a prism transform to merge their findings and rank by relevance. The synthesis canvas renders the merged view. Nova's conditional nodes show/hide sections based on what the agents found (e.g., `{if: "$.hasConflict", then: conflictPanel, else: summaryPanel}`). Cortex rules monitor cost: a budget rule triggers a `deny` effect if token spend exceeds threshold, gracefully stopping remaining agents while preserving completed work. A custom cortex effect handler updates nova's data store directly, closing the loop between orchestration and UI.

### What it shows off

| Package | Feature |
|---------|---------|
| cortex | `parallel` plan nodes — multiple agents running concurrently |
| cortex | `ask_agent` delegation — coordinator dispatching to specialists |
| cortex | Rules with `sum` accumulator on token spend → `deny` effect as graceful degradation |
| cortex | Custom effect handlers bridging into nova's data layer |
| signal | Powers every specialist's LLM calls |
| solid | Multiple concurrent streams, each powering a different nova canvas |
| prism | Merges heterogeneous agent outputs into a unified view-model for synthesis |
| nova | Dynamic multi-canvas shell, conditional/loop nodes adapting layout to runtime data |

### The wow moment

Three specialist canvases are streaming simultaneously. The budget rule fires — the third specialist's canvas gets a "budget cap reached" banner (the custom effect wrote to nova's data, the conditional node picked it up), while the first two complete normally. The synthesis canvas merges only the completed results. The coordinator's final plan acknowledges what was and wasn't covered — the system degrades gracefully, visibly, and the user understands exactly why.

### Key integration points

- `createManifold()` with coordinator agent (plan mode) + specialist agents
- Coordinator's plan: `{ parallel: { branches: [{ ask_agent: 'specialist-a', ... }, { ask_agent: 'specialist-b', ... }] } }`
- Each specialist's streaming output → its own `createStream()` → its own nova canvas data store
- `defineRule({ watch: { tokenSpend: { event: 'cortex.tool.observed', aggregate: 'sum', field: 'tokensUsed' } }, rules: [{ when: {$gt: ['$watch.tokenSpend', 50000]}, then: {call: 'graceful-stop'} }] })`
- `registerEffect('graceful-stop', (ctx) => { /* update nova data store, abort remaining agents */ })`
- Prism merge transform: `{ $merge: [{ $ref: '$.specialistA.findings' }, { $ref: '$.specialistB.findings' }] }` → synthesis canvas
- Nova shell: dynamic `push(canvasId, 'specialist-action', { agentId })` per spawned specialist

---

## Build order recommendation

1. **Pulse** — most self-contained, fewest moving parts, proves the core signal→solid→prism→nova pipeline
2. **Alchemist** — leverages existing `prism/agent` code, adds cortex to the mix
3. **Nerve Center** — deep cortex integration, most technically impressive for understanding the runtime
4. **Forge** — requires careful schema design for the ActionDefinition output, most mind-bending demo
5. **Mosaic** — the full orchestra, build last when all integration patterns are proven
