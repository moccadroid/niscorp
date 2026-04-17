# `@niscorp/cortex` — design

Cortex is the orchestration substrate for the `@niscorp` stack. This
document is the *why* behind the architecture: what the primitives are,
what trade-offs produced them, and where the known soft spots live.

The *how* lives in [`README.md`](./README.md). Style rules live in
[`niscorp/STYLE_GUIDE.md`](../../STYLE_GUIDE.md) — no `any`, no `as`, no
`!`, no `enum`, no classes; arrow-const exports with explicit return
types; kebab-case files with role suffixes; named exports only.

---

## 1. The big idea

Cortex does five things and nothing else:

1. **Agent execution.** `defineAgent` declares an LLM-backed function in
   one of three modes (`text`, `structured`, `plan`).
2. **Context engineering.** A pipeline of *producers* assembles what the
   model sees on every call. Producers are pure functions over runtime
   state, optionally stateful via bus subscriptions, optionally
   compressing.
3. **Plan execution.** Plan-mode agents emit an `ActionPlan`; the
   runtime executes the nodes under policy gates and budget enforcement
   inside a bounded tick loop.
4. **Declarative steering.** Stateful producers and a JSON rules engine
   observe bus events and shape what happens next — `inject` context,
   `abort` a run, `deny` a tool call, `call` a named effect handler.
5. **Event-based substrate.** Every state change emits an event on the
   bus. Sync APIs (`execute`, `runAgentStandalone`) are convenience
   sugar that dispatch a request event and await a completion event.

**Anti-goals.** No HTTP. No UI. No database. No LLM client (Signal
handles that). No MCP mounting. No framework coupling. Streaming is
opt-in via `{ stream: true }` on `manifold.execute` — see §12.

**Two peer dependencies and nothing else:**
[`@niscorp/signal`](../signal) and `zod`.

---

## 2. Architectural layers

```
┌────────────────────────────────────────────────────────────────┐
│                          Manifold                              │
│ Registry · Bus · Ledger · State Store · Event Log · Lifecycle  │
└────────────────────────────────────────────────────────────────┘
                ↑                  ↑                ↑
        ┌───────┴────────┐  ┌──────┴───────┐  ┌─────┴────────┐
        │     Rules      │  │    Agents    │  │     Tools    │
        │   defineRule   │  │  defineAgent │  │  defineTool  │
        │ + producers    │  │  (3 modes)   │  │  (Zod input) │
        └───────┬────────┘  └──────┬───────┘  └──────────────┘
                │                  │
                ↓                  ↓
        ┌──────────────────────────────────────────────┐
        │             Context Pipeline                 │
        │  Producers → Build → Score → Pack → Send     │
        │  (the most important subsystem in Cortex)    │
        └──────────────────┬───────────────────────────┘
                           ↓
        ┌──────────────────────────────────────────────┐
        │              Cortex Tool Loop                │
        │  signal.step() → toolCalls → gate (w/         │
        │  confirmation) → execute → observe →         │
        │  re-pack context → … → final output          │
        └──────────────────┬───────────────────────────┘
                           ↓
        ┌──────────────────────────────────────────────┐
        │     Output Parser (per execution mode)       │
        │  text       → string                         │
        │  structured → schema-validated typed value   │
        │             → retry-on-failure loop          │
        │  plan       → ActionPlan → Plan Executor     │
        └──────────────────┬───────────────────────────┘
                           ↓
        ┌──────────────────────────────────────────────┐
        │         Plan Executor (plan mode only)       │
        │  Depth-first · gate per step · observe ·     │
        │  bounded ticks · emits events through bus    │
        └──────────────────────────────────────────────┘
```

Everything funnels through the context pipeline. Every tool runs
through the Cortex-owned tool loop. Every state change emits an event
on the bus. Sync APIs dispatch + await.

---

## 3. The event-based substrate

This is the foundational decision and shapes everything else, so it
goes first.

### 3.1 Why event-based

Sync APIs are easy to write and easy to debug — until you want to
observe what's happening, at which point you bolt a bus on top and end
up with two execution paths that drift apart. Telemetry events become
"for monitoring" and sync calls "for real work" and the two end up in
different states. Steering can't see what direct calls do. Tests pass
for one path and fail for the other.

Event-based as substrate inverts this. Every action dispatches an
event, every state change emits an event, every consumer (UI, rules,
telemetry, debugging tools, the caller awaiting a result) subscribes to
the same stream. Sync becomes a *view* over events, not a *parallel
path* alongside them.

```ts
// Conceptually, sync execute is just:
const execute = async (agentId, input) => {
  const runId = manifold.bus.emit(CortexTopics.executeRequested, { agentId, input, workflowId });
  const completion = await manifold.bus.waitFor(CortexTopics.executeCompleted.topic, {
    filter: (e) => e.meta.workflowId === workflowId,
  });
  return completion.payload.result;
};
```

The implementation short-circuits through the registry for in-process
specialists as a performance optimization, but the *contract* is
event-based and the events fire regardless.

### 3.2 What this requires from the bus

The bus is more than `emit + on`:

- **Wildcard subscriptions** — `on('cortex.tool.*', handler)`.
- **Correlation IDs** — every event carries a `correlationId`; child
  events inherit. This stitches a workflow's events together for replay
  and debugging.
- **`waitFor(pattern, options)`** — block until an event matching a
  pattern fires, with optional timeout, filter, and abort signal.
- **Backpressure-free fanout** — handlers run in registration order;
  errors in handlers don't crash the bus; slow handlers don't block
  the dispatcher.
- **Replay-friendly** — events append to the event log on emit. The
  event log is pluggable; in-memory by default.

### 3.3 Preferred mode

**The preferred way to interact with Cortex is via the bus.** The
showroom's demos lead with event-based usage. The sync API is
documented as convenience sugar over the event substrate, not as a
separate mode. Consumers who want the alive-as-fuck experience
subscribe directly to topics; consumers who want to call a function
and await a result get sugar that does exactly that on top of the same
substrate.

### 3.4 Reserved topic taxonomy

Cortex emits these system topics. User code may subscribe to any of
them and may emit any topic that does **not** begin with `cortex.`.
Each system topic has a typed payload via `CortexTopics` (see
`topics.ts`).

| Topic | When | Payload |
|---|---|---|
| `cortex.execute.requested` | A top-level `execute` is dispatched | `{ agentId, input, workflowId, abort? }` |
| `cortex.execute.completed` | A dispatched execute settles | `{ result, workflowId }` |
| `cortex.execute.failed` | A dispatched execute failed | `{ error, workflowId }` |
| `cortex.workflow.started` | A workflow begins | `{ workflowId, agentId, input }` |
| `cortex.workflow.ended` | A workflow completes (success or failure) | `{ workflowId, result?, error?, ledger? }` |
| `cortex.tick.started` / `.ended` | A plan-mode tick begins / ends | `{ workflowId, tick }` |
| `cortex.agent.invoked` / `.completed` | An agent call begins / ends | `{ agentId, input }` / `{ agentId, output }` |
| `cortex.agent.retry` | Output validation failed; model is being re-prompted | `{ agentId, workflowId, attempt, nextAttempt, rawContent, error }` |
| `cortex.tool.called` / `.observed` | A tool call begins / ends | `Observation` |
| `cortex.observation.recorded` | Any step observation lands | `Observation` |
| `cortex.plan.produced` | A plan-mode agent emits a plan | `{ workflowId, agentId, plan }` |
| `cortex.plan.gated` | A plan node is checked by the policy gate | (opaque) |
| `cortex.policy.confirmation.requested` | A high-risk tool call awaits human approval | `{ workflowId, toolId, input }` |
| `cortex.policy.confirmation.approved` / `.denied` | Human response landed | `{ toolId }` |
| `cortex.rule.evaluated` | A rule was evaluated | `{ result, accumulators }` |
| `cortex.rule.fired` | A rule matched and its effect is about to be applied | `{ ruleId, effect, accumulators }` |
| `cortex.context.built` | A context pipeline run completes | (opaque) |
| `cortex.error` / `cortex.warning` | Error / warning surfaces | `CortexError` / `{ message }` |

Producers, rules, and user code that need finer-grained signals emit
topics under their own namespaces.

---

## 4. Agent execution

### 4.1 The three modes

| Mode | Output | Used by |
|---|---|---|
| `text` | `string` | Free-form responses, summaries, chat |
| `structured` | `T` (Zod-validated, with retry-on-failure) | Vex query agent, Vex mapping agent, Nova layout agent, classifiers, extractors |
| `plan` | `ActionPlan` (validated) | Directors, orchestrators, multi-step workflows |

Agents are stateless functions. State lives in the manifold (workflow
state, ledger, event log) or in producers (per-workflow producer
state). There is no agent instance with hidden state.

### 4.2 `defineAgent`

The serializable part of the config (`id`, `name`, `description`,
`instructions`, `outputMode`, `model`, `tools`, `policy`,
`maxToolIterations`, `maxTicks`, `maxOutputRetries`) is Zod-validated at
definition time. Non-serializable fields (`outputSchema`, `context`) are
attached as live objects.

Structured mode without `outputSchema` **throws at definition time**.
Plan mode ignores `outputSchema` (it's always `ActionPlanSchema`). Text
mode ignores any schema.

### 4.3 Standalone vs manifold

There is exactly one execution path. Standalone is a degenerate
manifold.

`runAgentStandalone` builds a micro-manifold (registry of one,
in-memory bus that nobody outside has subscribed to, in-memory ledger
that gets discarded after the run, default context spec, no
persistence). The same `executeAgent` function handles both standalone
and full-manifold execution. The micro-manifold is built and torn down
per call.

This means **every agent any package exports is a Cortex agent.** Vex
exports `queryAgent` and `mappingAgent`. Prism exports `mappingAgent`.
Nova exports `layoutAgent`. They all run on Cortex via
`runAgentStandalone` for one-shot use, or by registering them with a
real manifold for orchestrated use. There is no second framework, no
fork, no maintenance burden of multiple equivalent agents.

### 4.4 Retry on output validation failure

Structured-mode agents that return malformed output are re-prompted up
to `maxOutputRetries` times (default 2). The failed content and the
Zod failure are fed back into the next call as additional context.
Each retry emits `cortex.agent.retry` so UIs can show attempts inline.
When retries exhaust, the workflow fails with
`output_validation_failed`.

### 4.5 The agent run context

While an agent runs it has access to a `RunContext`: `workflowId`,
`agentId`, `tick`, `signal` (abort), `bus`, `ledger`, `emit`. Tools
receive a `ToolContext` derived from this; producers receive a
`BuildContext` exposing read-only views.

---

## 5. Context engineering — the producer model

This is the heart of the package. The single most important section to
get right.

### 5.1 Why a producer model

An early draft treated context as a section template (system, tools,
history, observations, truncate from the bottom). That is templating,
not engineering. Looking at how the field actually does this:

- **Microsoft Agent Framework** has a Context Provider API: pluggable
  components with `invoking()` / `invoked()` hooks, each with their own
  token budget, composing as a pipeline.
- **LangChain/LangGraph** uses typed state objects with node-level
  fine-grained access.
- **Mastra** has memory processors (MessageHistory, SemanticRecall,
  WorkingMemory) — each a stage in a pipeline.
- **Vercel AI SDK** has `prepareStep`, a per-step mutation callback.
- **Manus team** emphasizes: stable prefix for KV-cache, mask tools
  instead of removing them, treat context as append-only, recite goals
  to fight lost-in-the-middle, preserve failed actions in context.

Cortex's `ContextProducer` is closest to the Microsoft model —
pluggable, lifecycle-aware, budgeted, composable — with three
additions: producers can subscribe to bus events (turning them into
live steering primitives), producers can be inspected via a preview
API, and producers can opt into LLM-based compression.

### 5.2 The primitive

A `ContextProducer` has an `id`, a `priority` (0 most evictable, 100
pinned), optional `subscribes` topics + `onEvent` for statefulness,
optional `maxTokens` budget, a `build` function that returns content
chunks, and an optional `compress` function. Producer state is
private, scoped per-workflow, lives in the manifold's state store.
When a producer subscribes, the runtime attaches it to the bus on
workflow start and detaches on workflow end.

### 5.3 The pipeline

The pipeline runs every time an agent is about to be invoked. No
caching across ticks in v1 — fresh build every time, simple and
correct:

```
1. Gather:    Collect all producers attached to this agent (per-agent
              spec + manifold-global). Order by priority descending.
2. Build:     Call build() on each. Producers with subscribes have
              already been accumulating state via onEvent.
3. Estimate:  Fill in token counts (via signal.count() in exact mode;
              ~4 chars/token heuristic in fuzzy mode).
4. Compress:  For each producer with maxTokens (or whose chunks
              exceed the global budget), call compress(). Default:
              tail truncation.
5. Pack:      Sort by priority, evict lowest-priority chunks until
              under global budget. Pinned chunks (priority=100) never
              evict.
6. Assemble:  Convert chunks to provider-format messages. Send to model.
```

### 5.4 `previewContext` — the killer debugging API

`manifold.previewContext(agentId, input)` runs steps 1–5 and returns
the resolved chunks with sources, token counts, and eviction
decisions, *without* sending anything to a model. This is
non-negotiable — debugging context issues without it is hell, and it
costs nothing to implement once the pipeline exists.

### 5.5 Built-in producers

| Producer | Default priority | Purpose |
|---|---|---|
| `systemProducer(prompt)` | 100 (pinned) | The agent's system prompt |
| `actionContractProducer()` | 100 (pinned) | Plan-mode only: ActionPlan rules and allowed kinds |
| `inputProducer()` | 100 (pinned) | The current invocation's input as a user message |
| `toolsProducer({ filter, format })` | 90 | Registry-aware tool list, filtered by policy |
| `agentsProducer({ filter })` | 80 | Available delegate agents (for plan-mode `ask_agent`) |
| `budgetProducer()` | 70 | Remaining tokens/cost/ticks — helps the model self-regulate |
| `recitationProducer({ goalKey })` | 60 | Per Manus: re-injects the active goal/todo to fight drift |
| `historyProducer({ window, compress })` | 50 | Conversation history with bounded window |
| `observationsProducer({ window, format })` | 40 | Recent step observations from the current workflow |

**Default specs** (applied when an agent doesn't override `context`):

- `text` / `structured` mode: `[system, tools, history, input]`
- `plan` mode: `[system, actionContract, tools, agents, budget, history, observations, input]`

### 5.6 Compression

Two compressors ship:

| Compressor | Cost | When to use |
|---|---|---|
| `truncateCompressor` | Free | Default. Drop lowest-priority chunks until under cap. |
| `createSummarizeCompressor({ llm, model })` | One LLM call | History layers in long workflows. |

Compression is opt-in at the producer level. The runtime warns in dev
mode when a producer with no compressor consistently exceeds budget.
LLM-based compression cost flows into the parent run's ledger,
surfaced via `previewContext` so it's visible.

Budget enforcement is in **tokens**, not dollars. Providers don't
expose pricing programmatically and the same token count costs 100×
more on a frontier model than a 20B OSS model. Optional dollar
accounting lands as a user-supplied per-model price map feeding the
ledger.

### 5.7 KV-cache stability (the Manus lesson)

The pipeline must produce a stable prefix for cache hits:

- Pinned producers (priority 100) come first, in deterministic order.
- Producer outputs must be deterministic for the same `BuildContext`.
  No `Date.now()` in chunk content. No random IDs.
- v1 accepts cache misses when tool lists change. A future iteration
  explores logit masking via Signal (`tool_choice` constraints) instead
  of removing tools from the list.

### 5.8 Token estimation

Two modes, configurable per manifold:

- **`fuzzy`** (default): heuristic (~4 characters per token, plus ~4
  tokens per-message overhead). Fast, good enough to answer "am I at
  10k or 100k?" for budget decisions.
- **`exact`**: delegates to `signal.count(model, content)`. Currently
  falls back to fuzzy internally in Signal; once a real tokenizer
  lands upstream, exact-mode propagates everywhere Cortex asks.

The heuristic is roughly correct for English text and roughly wrong
for code, structured JSON, and non-Latin scripts. Acceptable for
budget enforcement (the purpose is "don't blow past the cap"), less
acceptable for dollar-accurate cost estimation.

### 5.9 Pipeline caching (future work)

The pipeline rebuilds fresh on every iteration. Simple and correct —
no stale-context bugs — but redundant for producers whose output
doesn't change. Future optimization: volatility tags (`stable` for
`system`/`actionContract`/`tools`/`agents`/`input`; `volatile` for
`observations`/`budget`/`history`). The pipeline caches stable
producers on first build and skips `build()` on subsequent
iterations. Not yet implemented — profile first.

---

## 6. The Cortex tool loop

### 6.1 Why Cortex owns the tool loop

Signal could own it; it used to. Cortex takes it back because:

1. Per-call **policy gating** — a tool can be denied mid-loop without
   aborting the whole agent run.
2. Per-call **ledger attribution** — exact accounting of which tool
   burned which tokens.
3. **Context injection between calls** — a low-budget warning, a
   freshly-retrieved fact, a rule's hint can land between iterations.
4. **Per-call observation** — debugging, replay, future streaming.
5. **Tool result mutation** — scope-filter, cache-substitute, redact.
6. **Abort mid-loop** — a rule's `abort` decision lands cleanly.

Signal narrows to: model call, provider routing, fallback strategy,
raw tool-call output. Tool *orchestration* lives in Cortex.

### 6.2 The loop

```
loop while iterations < maxToolIterations:
  pack   = contextPipeline.build(agent, runContext)
  result = signal.step({ model, messages: pack, tools: registryTools })

  if result.toolCalls empty:
    return parseOutput(result.content, agent.outputMode)

  for call in result.toolCalls:
    gate = policy.check(call, runContext)

    if gate == 'confirmation_required':
      emit(confirmationRequested, { toolId, input })
      outcome = waitFor(confirmation.approved|denied, timeout)
      if denied or timeout: append observation with denial; continue

    if not gate.allowed:
      append observation with gate reason; continue

    obs = await registry.executeTool(call, toolContext)
    append observation; emit(toolObserved, obs)

  // re-pack context with new observations and loop
```

### 6.3 Bounds

- **Inner (tool loop)**: `maxToolIterations`, default 10. Per-agent
  call. Counts model→tool→model round-trips during a single agent
  invocation.
- **Outer (tick loop)**: `maxTicks`, default 20. Per-workflow. Each
  director plan execution = 1 tick. Plan-mode only.
- **Plan depth**: `maxPlanDepth`, default 2.

These do not share a budget. Inner is constrained per-call; outer
counts how many times a director gets to think.

---

## 7. Plans and the plan executor

### 7.1 ActionPlan schema

```ts
ActionPlanSchema = z.array(PlanNodeSchema);
PlanNodeSchema = discriminatedUnion('kind', [
  AskAgentNodeSchema,   // { kind: 'ask_agent', agentId, input }
  UseToolNodeSchema,    // { kind: 'use_tool', toolId, input }
  TellTopicNodeSchema,  // { kind: 'tell_topic', topic, payload }
  WaitNodeSchema,       // { kind: 'wait', topic, timeoutMs? }
  ParallelNodeSchema,   // { kind: 'parallel', branches: Node[] }
  ReflectNodeSchema,    // { kind: 'reflect', note }
  FinalNodeSchema,      // { kind: 'final', result }
]);
```

Each node carries optional metadata: `idempotencyKey`, `timeoutMs`,
`priority`, `tags`. Every field has `.describe()` for LLM consumption
— schemas double as documentation.

### 7.2 Plan-mode execution = the tick loop

Calling `manifold.execute(planAgent, input)`:

1. Build context pack via the pipeline.
2. Call agent (which runs the Cortex tool loop).
3. Parse output as `ActionPlan`. Validate depth.
4. Execute plan nodes depth-first. Each node:
   - Policy gate checks the node.
   - Execute (`use_tool`, `ask_agent`, etc.) — for `ask_agent`,
     dispatch via the bus and await the response.
   - Observation recorded; `cortex.observation.recorded` emitted.
5. If the plan ends in `final`, return result; emit
   `cortex.workflow.ended`.
6. If not, increment tick counter, go back to step 1.
7. If `maxTicks` exceeded, abort with `ticks_exceeded`.

A plan-mode agent **is** a director. There is no separate director
type.

### 7.3 `ask_agent` is sync sugar over the bus

Behind the scenes, `ask_agent` dispatches
`cortex.execute.requested` and awaits `cortex.execute.completed`. For
in-process specialists the implementation short-circuits through the
registry as a performance optimization, but the contract remains
event-based and the events fire either way.

### 7.4 `tell_topic` and `wait`

Async coordination uses `tell_topic` to publish and `wait` (in a
parallel block or alone) to block until a matching event fires. Both
ride directly on the bus. Useful for cross-workflow coordination,
human-in-the-loop pauses, and any "fire and eventually receive"
pattern.

---

## 8. Steering — rules and producers, not state machines

**Agents are the freedom; rules and producers are the gravity.** They
constrain and steer a free agent swarm. They are not orchestration
wiring.

### 8.1 Stateful context producers (the 80% case)

A `ContextProducer` with `subscribes` is, by definition, a live
steering primitive. It listens to bus events, accumulates state, and
shapes future context for the agent. Most steering looks like this:
watch events, sometimes add a chunk, no state machine, no effect DSL.

### 8.2 Declarative rules (the 80% case with no code)

Rules are JSON `watch` + `rules` pairs:

```ts
defineRule({
  id: 'tool-rate-limit',
  watch: { toolCalls: { event: 'cortex.tool.observed', aggregate: 'count' } },
  rules: [
    { when: { $gte: ['$watch.toolCalls', 5] }, then: { abort: 'hard limit' } },
    { when: { $gte: ['$watch.toolCalls', 3] }, then: { inject: '⚠ finalize now' } },
  ],
});
```

Shape:

- **`watch`** — named accumulators that subscribe to a bus topic and
  aggregate (`count`, `sum`, `latest` by dot-path).
- **`rules`** — ordered `{ when, then }` entries, evaluated after each
  observation. First match wins.
- **Conditions** — Prism-style discriminated operators (`$eq`, `$neq`,
  `$gt`, `$gte`, `$lt`, `$lte`, `$and`, `$or`, `$not`). `$watch.<name>`
  references an accumulator; anything else is a literal.
- **Effects** — `{ inject: 'system note' }` (next context build includes
  it), `{ abort: 'reason' }` (workflow fails cleanly), `{ deny:
  'reason' }` (current tool call is denied), `{ call: 'handler-name' }`
  (invoke a named effect handler — escape hatch).

Rules are registered via `manifold.registerRule(rule)` or the
`rules` option on `runAgentStandalone`. Named `call`-effect handlers
register via `manifold.registerEffect(name, handler)`.

### 8.3 Why declarative, not hook-based

An early draft exposed an imperative hook system (`beforePlan`,
`afterStep`, `beforeToolCall`, ...) as an escape hatch alongside
stateful producers. We dropped it before shipping. Reasons:

- Rules cover every steering case we actually hit in the showroom
  (rate-limits, escalation warnings, budget caps, tool denials,
  compound conditions, research-desk pacing).
- Hooks tempted users into writing state machines — exactly what we
  said Cortex wasn't. Rules force the steering to be *declarative*:
  watch, compare, fire one of four effects, done.
- The `call` effect is a narrow, named escape hatch — easier to audit
  than arbitrary `beforeStep(ctx)` functions.

If a hook-based escape hatch turns out to be needed later, it lands as
a small addition alongside rules, not instead of them.

---

## 9. Memory — future research area

There is no `MemoryStore` implementation in v1 and no exported
interface yet. When memory matters in a real workflow it will show up
as a custom `ContextProducer` that pulls from a pluggable store and
formats however is appropriate. Agents will **not** call memory
directly via tool calls. Memory access is a context-engineering
problem, not a tool problem.

The contract, when it lands:

```ts
type MemoryStore = {
  get:    (workflowId: string, key: string) => Promise<unknown>;
  set:    (workflowId: string, key: string, value: unknown) => Promise<void>;
  delete: (workflowId: string, key: string) => Promise<void>;
  list:   (workflowId: string, prefix?: string) => Promise<string[]>;
};
```

This is the design's main concession to "we know we don't know yet."

---

## 10. The manifold

The central coordinator. One `createManifold({ llm })` per process for
multi-turn / orchestrated work. For one-shot execution,
`runAgentStandalone` builds and tears down a micro-manifold
internally.

```ts
type Manifold = {
  registerAgent:    (agent) => Unsubscribe;
  registerTool:     (tool) => Unsubscribe;
  registerRule:     (rule) => Unsubscribe;
  registerEffect:   (name, handler) => Unsubscribe;
  addProducer:      (producer, scope?) => Unsubscribe;

  bus: Bus;

  getState: (workflowId, key) => Promise<unknown>;
  setState: (workflowId, key, value) => Promise<void>;

  execute:        <T>(agentId, input, options?) => Promise<Result<T>>;
  previewContext: (agentId, input) => Promise<ResolvedContext>;

  start: () => Promise<void>;
  stop:  () => Promise<void>;
  drain: () => Promise<void>;
};
```

Errors from `execute` surface as `Result<T>`, not thrown exceptions,
except for programmer errors (see §11).

---

## 11. Error model

Small, deliberate taxonomy. Principles:

1. **Programmer errors throw.** Calling `execute` with an unregistered
   agent, registering two tools with the same id, building a
   structured-mode agent without a schema — these throw immediately.
   They are bugs.
2. **Runtime conditions return.** Tool execution failed, gate denied a
   step, budget exceeded, plan invalid, validation retries exhausted —
   these surface as `Result<T>` with a `CortexError`.
3. **Observations carry errors, not exceptions.** A failed tool call
   inside an agent run produces an observation with an `error` field.
   The agent sees it and decides what to do. The runtime does not
   abort the workflow on a single tool failure.
4. **Abort propagates cleanly.** A rule's `abort` effect, an external
   `AbortSignal`, or `maxTicks` exceeded all produce
   `{ ok: false, error }` with a structured error. Drain semantics
   ensure in-flight work settles before `stop` resolves.
5. **Bus handlers never crash the bus.** Errors in handlers are
   caught, logged, and surfaced via the `cortex.error` topic. Other
   handlers continue.

```ts
type CortexError = {
  code: ErrorCode;
  message: string;
  workflowId?: string;
  agentId?: string;
  cause?: unknown;
};

type ErrorCode =
  | 'agent_not_registered' | 'tool_not_registered'
  | 'invalid_plan'         | 'plan_depth_exceeded'
  | 'ticks_exceeded'       | 'tool_iterations_exceeded'
  | 'duration_exceeded'    | 'budget_exceeded'
  | 'gate_denied'          | 'tool_execution_failed'
  | 'output_validation_failed' | 'model_call_failed'
  | 'aborted'              | 'timeout'
  | 'unknown';
```

`ErrorCode` is a union literal type, not an enum. Custom error classes
aren't used — the style guide forbids classes, and `CortexError` is a
plain typed object.

---

## 12. Streaming

`manifold.execute(id, input, { stream: true })` switches the tool
loop from `signal.step()` to `signal.stream()` per iteration,
emitting `cortex.llm.delta` on the bus as text arrives. The return
type is unchanged — streaming is a side effect, not a return shape.

Tools, gates, ledger, observations, and rules are unaffected: the
tool loop still owns all of them. Structured-mode validation retries
stay at the agent level and fire `cortex.agent.retry` as before;
streaming consumers subscribe to that to reset partial-output state
between attempts.

`stream` is a field on `WorkflowContext` alongside `policy`, `abort`,
and `injections`. The tool loop reads it live on each iteration.

---

## 13. Source layout

```
src/
├── index.ts                       # public API
├── types.ts                       # shared core types
├── topics.ts                      # typed system topics (CortexTopics)
│
├── schemas/                       # Zod source-of-truth schemas
│   ├── action-plan.schema.ts
│   ├── agent-config.schema.ts
│   ├── tool-config.schema.ts
│   ├── observation.schema.ts
│   ├── policy.schema.ts
│   └── content-chunk.schema.ts
│
├── manifold/                      # registry, bus, ledger, lifecycle
│   ├── manifold.ts
│   ├── registry.ts
│   ├── bus.ts
│   ├── ledger.ts
│   ├── preview.ts                 # previewContext
│   ├── workflow-context.ts
│   ├── execution-handler.ts       # execute-request → bus dispatch
│   └── rule-handler.ts            # observation → rules.evaluate → effect
│
├── agent/                         # defineAgent, execute, retry, standalone
│   ├── define-agent.ts
│   ├── execute.ts
│   ├── output-parser.ts
│   ├── raw-invocation.ts
│   ├── retry.ts                   # validation-retry loop
│   └── standalone.ts
│
├── context/                       # the producer pipeline
│   ├── pipeline.ts
│   ├── defaults.ts                # per-mode default producer lists
│   ├── messages.ts
│   ├── tokens.ts                  # fuzzy/exact counters
│   ├── producer-state.ts
│   ├── producers/                 # system, tools, input, history, …
│   └── compressors/               # truncate, summarize
│
├── tool-loop/                     # the inner tool iteration
│
├── runtime/                       # plan execution + policy gate
│   ├── plan-executor.ts
│   ├── gate.ts
│   └── node-handlers/             # one file per plan node kind
│
├── rules/                         # declarative rules engine
│   ├── define-rule.ts
│   ├── engine.ts
│   ├── accumulator.ts
│   ├── condition.ts
│   ├── effects.ts
│   └── rule.schema.ts
│
├── llm/                           # SignalClient contract
├── store/                         # memory state store + event log
├── errors/                        # CortexError, ErrorCode
└── utils/                         # id, wildcard, typed-topic
```

File names follow [`STYLE_GUIDE.md`](../../STYLE_GUIDE.md) §File
Naming. Schemas use `.schema.ts`, producers use `.producer.ts`,
compressors use `.compressor.ts`, stores use `.store.ts`. Primary
implementation files (`manifold.ts`, `pipeline.ts`, `engine.ts`) skip
the role suffix when the role is obvious.

---

## 14. Open questions

Not blocking. Things we know we don't know yet.

1. **Producer-as-steering unification.** The framing collapses two
   genuinely-different things (passive context shaping, active runtime
   steering) into one primitive. If it produces footguns in practice,
   we revisit — the rules engine is a separate primitive that absorbs
   most active steering.

2. **Compression cost surprise.** A producer that opts into LLM-based
   summarization can suddenly spend tokens. Surfaced in
   `previewContext` and dev-mode warnings. If it bites in practice,
   add hard caps.

3. **KV-cache stability vs dynamic tool lists.** Adding/removing tools
   mid-workflow invalidates the cache. v1 accepts this and measures.
   Future: logit masking via Signal's `tool_choice`.

4. **Memory.** Still a future research area. When the real memory plan
   lands, it slots in cleanly as a `ContextProducer` plus a
   `MemoryStore` implementation. If it doesn't slot in cleanly, the
   abstraction is wrong.

5. **Cross-tick context determinism.** The tool loop rebuilds context
   between iterations. Correct but cache-hostile. If hot-loop
   performance suffers, add producer-level caching with explicit
   invalidation tags.

6. **Rule ordering across multiple registered rules.** Within one rule
   definition, first match wins. Across rules registered on the same
   manifold, evaluation order is registration order; a future
   iteration may introduce explicit priorities.

7. **Hook-based escape hatch.** Not shipped — rules cover the real
   cases. If a case appears that rules genuinely can't express (and
   isn't just a missing accumulator type or condition operator), a
   narrow hook system lands alongside rules.

8. **Streaming.** Reserved API shape, not implemented. Lands when the
   partial-JSON library is properly designed.

---

## 15. Glossary

- **ActionPlan** — Discriminated-union output of plan-mode agents.
  Tree of `use_tool | ask_agent | tell_topic | wait | parallel |
  reflect | final` nodes. Executed by the plan executor under policy
  gates and budget enforcement.
- **Agent** — A `defineAgent`-defined function from input to typed
  output. Three modes: `text`, `structured`, `plan`. Stateless.
- **Bus** — The event substrate. Wildcard pub/sub with `emit`, `on`,
  `waitFor`, `dispatch`. Source of truth.
- **BuildContext** — The runtime state visible to a producer when it
  builds its chunks. Read-only.
- **Compressor** — A function that shrinks a producer's output to fit a
  budget. `truncateCompressor` (default, free) or the summarizer (LLM,
  opt-in).
- **ContentChunk** — A single piece of content destined for the model.
  Has role, content, tokens, priority, source. Producers emit these.
- **ContextProducer** — Pluggable component that contributes content
  chunks to an agent's context. Optionally stateful via bus
  subscriptions.
- **Cortex tool loop** — Cortex-owned iteration: model call → tool
  calls → gate (with confirmation) → execute → re-pack context → next
  call.
- **Director** — Informal term for a plan-mode agent. Not a separate
  type.
- **Effect** — A rule's action: `inject`, `abort`, `deny`, or `call`.
- **Manifold** — Central coordinator: registry, bus, ledger, state
  store, event log.
- **Micro-manifold** — Ephemeral one-shot manifold built by
  `runAgentStandalone`.
- **Observation** — Structured record of a step's execution: kind,
  duration, result/error, depth, tick. Fed back to the agent as
  context next tick.
- **Pipeline (context)** — gather → build → estimate → compress → pack.
  Runs every time an agent is invoked.
- **Plan executor** — Depth-first executor for ActionPlans. Runs each
  node under the policy gate and emits observations.
- **`previewContext`** — Debugging API: returns the resolved chunks an
  agent would see, without sending to the model.
- **Producer** — Short for ContextProducer.
- **Result<T>** — Fallible-API contract: `{ ok: true, data } | { ok:
  false, error }`.
- **Rule** — A `defineRule` JSON definition: `watch` accumulators +
  ordered `when → then` entries with effect actions.
- **RunContext** — The runtime "this" available during an agent
  invocation.
- **Steering** — What rules and stateful producers do. The opposite of
  orchestration: agents stay free, the system bends the field they
  operate in.
- **Tick** — One iteration of a plan-mode agent's outer loop.
- **Tick loop** — The outer loop in plan-mode execution. Part of the
  runtime, not a separate primitive.
- **Tool loop** — The inner iteration during a single agent
  invocation. Bounded by `maxToolIterations`.
- **`waitFor`** — Bus primitive that blocks until a matching event
  fires. The basis of every sync API.
- **Workflow** — One top-level `execute` call and everything it
  transitively triggers. Specialists called via `ask_agent` share the
  parent's `workflowId`.

---

## Sources consulted

- [Microsoft Agent Framework Context Provider API](https://medium.com/microsoftazure/context-engineering-with-microsoft-agent-frameworks-context-provider-api-dcf083daa8be)
- [LangChain Context Engineering blog](https://blog.langchain.com/context-engineering-for-agents/)
- [LangChain Context Engineering docs](https://docs.langchain.com/oss/python/langchain/context-engineering)
- [Mastra Agent Memory docs](https://mastra.ai/docs/agents/agent-memory)
- [Vercel AI SDK Loop Control / prepareStep](https://ai-sdk.dev/docs/agents/loop-control)
- [Manus blog: Context Engineering Lessons from Production](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
