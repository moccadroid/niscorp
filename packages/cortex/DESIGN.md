# Design Document: `@niscorp/cortex` — Agentic Orchestration Runtime

**Status:** Canonical design. Final pre-implementation iteration.
**Audience:** Implementation engineers, future-Karl, future-Claude.
**Style:** All code in this document obeys [`niscorp/STYLE_GUIDE.md`](../../STYLE_GUIDE.md). No `any`, no `as`, no `!`, no `enum`, no classes, arrow-const-with-explicit-return-type for exports, kebab-case file names with role suffixes, named exports only.

---

## 0. How to Read This Document

This is the single source of truth for what Cortex is and how it must be built. It is the result of four design iterations that examined the prior art (Neon's agentic frame, project-adam), researched the state of the art (Microsoft Agent Framework's Context Provider API, LangChain/LangGraph state objects, Mastra's memory processors, Vercel AI SDK's `prepareStep`, the Manus team's production lessons), and made deliberate choices about what to keep, what to throw out, and what to invent.

Where this document is silent on a detail, defer to the [`niscorp/STYLE_GUIDE.md`](../../STYLE_GUIDE.md) and to common sense. Where this document and any earlier draft disagree, **this document wins**. Where implementation surfaces a friction the document didn't anticipate, write down the resolution and update this document — design is not finished when the doc stops changing, design is finished when the code stops surprising us.

---

## 1. The Big Idea (One Page)

Cortex is the orchestration substrate for the `@niscorp` stack. It does five things and nothing else:

1. **Agent execution.** A standard way to define an LLM-backed function (`defineAgent`) that takes input, sees a carefully assembled context, and produces a typed output. Three modes: `text`, `structured`, `plan`.
2. **Context engineering.** A pipeline of *producers* assembles what the model sees on every call. Producers are pure functions over runtime state, optionally stateful (via bus subscriptions), optionally compressing. This is the most important Cortex primitive after agent execution itself.
3. **Plan execution.** When an agent is in `plan` mode, its output is an `ActionPlan` — a small tree of typed operations the runtime executes under policy gates with budget enforcement. Plan-mode execution wraps a tick loop. There is no separate "director mode"; a plan-mode agent IS a director.
4. **Interceptors.** Steering primitives that observe the runtime and *change what happens next* — by injecting context, rewriting plans, mutating the registry, or aborting runs. They are restrictions and gravity on a free agent swarm, not state machines wiring it together. Two flavors: stateful context producers (via `subscribes`) and hook-based interceptors (escape hatch).
5. **Event-based substrate.** Everything that happens emits an event. Sync APIs (`execute`, `ask_agent`, `runAgentStandalone`) are convenience sugar that dispatch a request event and await a completion event. The bus is the source of truth.

**Anti-goals.** No HTTP. No UI. No database. No LLM client (Signal handles that). No memory implementation beyond an interface and a test reference (real memory is a future research area). No MCP server mounting (that's Signal's concern if anywhere). No framework coupling. No god functions. No tangled demos in the runtime. No streaming in v1 (the API is reserved but unimplemented; will land cleanly once the partial-JSON library is properly designed — see §13).

**Two peer dependencies and nothing else:** [`@niscorp/signal`](../signal) and `zod`.

---

## 2. Architectural Layers

```
┌────────────────────────────────────────────────────────────────┐
│                          Manifold                              │
│ Registry · Bus · Ledger · State Store · Event Log · Lifecycle  │
└────────────────────────────────────────────────────────────────┘
                ↑                  ↑                ↑
                │                  │                │
        ┌───────┴────────┐  ┌──────┴───────┐  ┌─────┴────────┐
        │  Interceptors  │  │    Agents    │  │     Tools    │
        │ context steer  │  │  defineAgent │  │  defineTool  │
        │  & hook escape │  │  (3 modes)   │  │  (Zod input) │
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
        │  signal.complete() → toolCalls → gate →      │
        │  execute → observe → re-pack context →       │
        │  signal.complete() → … → final output        │
        └──────────────────┬───────────────────────────┘
                           ↓
        ┌──────────────────────────────────────────────┐
        │     Output Parser (per execution mode)       │
        │  text       → string                         │
        │  structured → schema-validated typed value   │
        │  plan       → ActionPlan → Plan Executor     │
        └──────────────────┬───────────────────────────┘
                           ↓
        ┌──────────────────────────────────────────────┐
        │         Plan Executor (plan mode only)       │
        │  Depth-first · gate per step · observe ·     │
        │  bounded ticks · emits events through bus    │
        └──────────────────────────────────────────────┘
```

Everything funnels through the context pipeline. Everything goes through the Cortex-owned tool loop. Every state change emits an event on the bus. Sync APIs dispatch + await; the bus is the substrate.

---

## 3. The Event-Based Substrate

This is the foundational decision and shapes everything else, so it goes first.

### 3.1 Why event-based

Sync APIs are easy to write and easy to debug — until you want to observe what's happening, at which point you bolt a bus on top and end up with two execution paths that drift apart. Neon had this problem: telemetry events were "for monitoring" and sync calls were "for real work" and the two ended up in different states. Behaviors couldn't see what direct calls did. Tests passed for one path and failed for the other.

Event-based as substrate inverts this. Every action dispatches an event, every state change emits an event, every consumer (UI, behaviors, telemetry, debugging tools, the user awaiting a result) subscribes to the same stream. There is one source of truth. Sync becomes a *view* over events, not a *parallel path* alongside them.

```ts
// Conceptually, sync execute is just:
const execute = async (agentId: string, input: unknown): Promise<unknown> => {
  const runId = manifold.dispatch('agent.execute.requested', { agentId, input });
  const completion = await manifold.waitFor(`agent.execute.completed:${runId}`);
  if (completion.kind === 'failed') throw completion.error;
  return completion.result;
};
```

The implementation may short-circuit through the registry for in-process specialists as a performance optimization, but the *contract* is event-based and the events fire regardless.

### 3.2 What this requires from the bus

The bus is more than `emit + on`. It needs:

- **Wildcard subscriptions** — `on('agent.*', handler)`, `on('cortex.tool.observed', handler)`.
- **Correlation IDs** — every dispatched event carries a `correlationId` and a `causationId`. Children inherit them. This is how the bus stitches a workflow's events together for replay and debugging.
- **`waitFor(pattern, options)` semantics** — block until an event matching a pattern fires, with optional timeout, optional filter on payload. Returns a promise. This is the substrate of every sync API.
- **Backpressure-free fanout** — handlers are called in registration order, errors in handlers do not crash the bus, slow handlers do not block the dispatcher.
- **Replay-friendly** — events are appended to the event log on emit. The event log is pluggable. In-memory by default; durable in production.

```ts
type Bus = {
  emit: (event: BusEvent) => void;
  on: (pattern: string, handler: BusHandler) => Unsubscribe;
  waitFor: (pattern: string, options?: WaitForOptions) => Promise<BusEvent>;
  dispatch: (topic: string, payload: unknown, meta?: Partial<EventMeta>) => string;
};

type WaitForOptions = {
  timeoutMs?: number;
  filter?: (event: BusEvent) => boolean;
  signal?: AbortSignal;
};

type BusEvent = {
  topic: string;
  payload: unknown;
  meta: EventMeta;
};

type EventMeta = {
  timestamp: number;
  correlationId: string;
  causationId?: string;
  workflowId?: string;
};

type BusHandler = (event: BusEvent) => void | Promise<void>;
type Unsubscribe = () => void;
```

### 3.3 Conceptually preferred mode

**The preferred mode of interacting with Cortex is via the bus.** Documentation, examples, and the `apps/playground` and `apps/showroom` demos lead with event-based usage. The sync API is documented as *convenience sugar over the event substrate*, not as a separate mode. Users who want the alive-as-fuck experience subscribe directly to topics; users who want to call a function and await a result get sugar that does exactly that on top of the same substrate.

### 3.4 Reserved topic taxonomy

Cortex emits the following topics. User code may subscribe to them and may emit any topic that does not begin with `cortex.`.

| Topic | When | Payload |
|---|---|---|
| `cortex.workflow.started` | A top-level `execute` begins | `{ workflowId, agentId, input }` |
| `cortex.workflow.ended` | A workflow completes (success or failure) | `{ workflowId, result?, error? }` |
| `cortex.tick.started` | A plan-mode tick begins | `{ workflowId, tick }` |
| `cortex.tick.ended` | A plan-mode tick ends | `{ workflowId, tick }` |
| `cortex.agent.invoked` | An agent invocation begins | `{ workflowId, agentId, input }` |
| `cortex.agent.completed` | An agent invocation completes | `{ workflowId, agentId, output }` |
| `cortex.context.built` | A context pipeline run completes | `{ workflowId, agentId, totalTokens, sources }` |
| `cortex.tool.called` | A tool call begins | `{ workflowId, toolId, input }` |
| `cortex.tool.observed` | A tool call completes | `{ workflowId, toolId, observation }` |
| `cortex.plan.produced` | An agent emits a plan | `{ workflowId, agentId, plan }` |
| `cortex.plan.gated` | A plan node is checked by the policy gate | `{ workflowId, node, gate }` |
| `cortex.observation.recorded` | Any step observation lands | `{ workflowId, observation }` |
| `cortex.error` | Any error surfaces | `{ workflowId?, agentId?, code, message }` |

The taxonomy is minimal on purpose. Producers and interceptors that need finer-grained signals introduce their own topics under their own namespace.

---

## 4. Agent Execution

### 4.1 The three modes

| Mode | Output | Used by |
|---|---|---|
| `text` | `string` | Free-form responses, summaries, chat |
| `structured` | `T` (Zod-validated) | Vex query agent, Vex mapping agent, Nova layout agent, classifiers, extractors |
| `plan` | `ActionPlan` | Directors, orchestrators, multi-step workflows |

Agents are stateless functions. State lives in the manifold (workflow state, ledger, event log) or in producers (per-workflow producer state). There is no agent instance with hidden state.

### 4.2 `defineAgent`

```ts
export const defineAgent = <TOutput = unknown>(config: AgentConfig<TOutput>): AgentDefinition<TOutput> => { ... };

export type AgentConfig<TOutput> = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  outputMode: 'text' | 'structured' | 'plan';
  outputSchema?: z.ZodType<TOutput>;
  model?: string;
  tools?: string[];
  context?: ContextSpec;
  policy?: PolicyConfig;
  maxToolIterations?: number;
};

export type AgentDefinition<TOutput = unknown> = {
  readonly config: AgentConfig<TOutput>;
};

export type ContextSpec = {
  producers: ContextProducer[];
};
```

`outputMode: 'structured'` requires `outputSchema` (enforced at definition time, not runtime). `outputMode: 'plan'` implies `outputSchema = ActionPlanSchema`. `outputMode: 'text'` ignores any schema.

### 4.3 Standalone vs manifold

There is exactly one execution path. Standalone is just a degenerate manifold.

```ts
export const runAgentStandalone = async <T>(
  agent: AgentDefinition<T>,
  input: unknown,
  options?: StandaloneOptions,
): Promise<Result<T>> => { ... };
```

Internally, `runAgentStandalone` builds a *micro-manifold*: registry of one, in-memory bus that nobody outside has subscribed to, in-memory ledger that gets discarded after the run, default context spec, no behaviors, no tick loop unless the agent is plan-mode, no persistence. The same `executeAgent` function inside the runtime handles both standalone and full-manifold execution. The micro-manifold is built and torn down for each call.

This means **every agent that any package exports is a Cortex agent.** Vex exports `queryAgent` and `mappingAgent`. Prism exports `mappingAgent`. Nova exports `layoutAgent`. They all run on Cortex via `runAgentStandalone` for one-shot use, or by registering them with a real manifold for orchestrated use. There is no second framework, no fork, no maintenance burden of multiple equivalent agents.

The peer-dep consequence: Vex/Prism/Nova take Cortex as a peer dependency for their `agent` sub-export. The non-agent parts of those packages keep their narrow dep set.

### 4.4 The agent run context

While an agent runs, it has access to a `RunContext` — the runtime "this" of the execution.

```ts
export type RunContext = {
  workflowId: string;
  agentId: string;
  tick: number;
  signal: AbortSignal;
  bus: Bus;
  ledger: ReadonlyLedger;
  emit: (topic: string, payload: unknown) => void;
};
```

Tools receive a `ToolContext` derived from `RunContext`, adding tool-specific fields. Producers receive a `BuildContext` derived from `RunContext`, exposing read-only views. The three contexts share a common base; the names matter for clarity.

---

## 5. Context Engineering — The Producer Model

This is the heart of the package. The single most important section to get right.

### 5.1 Why a producer model

Round-1 design treated context as a section template (system, tools, history, observations, truncate from the bottom). That is templating, not engineering. Looking at how the field actually does this:

- **Microsoft Agent Framework** has a Context Provider API: pluggable components with `invoking()` (read, before model call) and `invoked()` (write, after) hooks, each with their own token budget, composing as a pipeline.
- **LangChain/LangGraph** uses typed state objects with node-level fine-grained access — no producer abstraction, but the same goal as graph nodes.
- **Mastra** has memory processors (MessageHistory, SemanticRecall, WorkingMemory) — each a stage in a pipeline.
- **Vercel AI SDK** has `prepareStep`, a per-step mutation callback that can change model/tools/messages right before each model call. Same goal, expressed as a mutation hook.
- **Manus team** emphasizes: stable prefix for KV-cache, mask tools instead of removing them, treat context as append-only, recite goals to fight lost-in-the-middle, preserve failed actions in context.

Cortex's `ContextProducer` is closest to the Microsoft model — pluggable, lifecycle-aware, budgeted, composable — with three additions: producers can subscribe to bus events (turning them into interceptors), producers can be inspected via a preview API, and producers can opt into LLM-based compression.

### 5.2 The primitive

```ts
export type ContextProducer = {
  id: string;
  priority: number;             // 0=most evictable, 100=pinned (never evicted)
  subscribes?: string[];        // bus topics — turns this producer into an interceptor
  maxTokens?: number;           // optional per-producer budget
  build: (ctx: BuildContext) => Promise<ContentChunk[]> | ContentChunk[];
  compress?: Compressor;        // optional; default is tail truncation
  onEvent?: (event: BusEvent, state: ProducerState) => void;
};

export type BuildContext = {
  agentId: string;
  workflowId: string;
  tick: number;
  input: unknown;
  observations: ReadonlyArray<Observation>;
  registry: ReadonlyRegistry;
  state: ReadonlyMap<string, unknown>;
  budget: BudgetState;
};

export type ContentChunk = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  tokens?: number;              // estimated; runtime fills if absent
  evictable?: boolean;          // override producer priority for this chunk
  tags?: string[];
  source: string;               // producer id, used by previewContext
};

export type ProducerState = {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  has: (key: string) => boolean;
  flag: (key: string) => void;
};

export type Compressor = (
  chunks: ReadonlyArray<ContentChunk>,
  targetTokens: number,
) => Promise<ContentChunk[]>;
```

Producer state is private to the producer, scoped per-workflow, lives in the manifold's state store. When a producer subscribes to topics, the runtime attaches it to the bus on workflow start and detaches it on workflow end.

### 5.3 The pipeline

The pipeline runs every time an agent is about to be invoked. There is no caching across ticks in v1 — fresh build every time, simple and correct. Caching is a profiling-driven optimization for later.

```
1. Gather:    Collect all producers attached to this agent (per-agent
              definition + manifold-global). Order by priority descending.
2. Build:     Call build() on each. Producers with subscribes have already
              been accumulating state via onEvent.
3. Estimate:  Fill in token counts for chunks that don't have them
              (via signal.count() in exact mode; ~4 chars/token heuristic
              in fuzzy mode; configurable).
4. Compress:  For each producer with maxTokens (or whose chunks exceed
              the global budget), call compress(). Default: tail truncation.
5. Pack:      Sort by priority, evict lowest-priority chunks until under
              global budget. Pinned chunks (priority=100) never evict.
6. Assemble:  Convert chunks to provider-format messages. Send to model.
```

### 5.4 `previewContext` — the killer debugging API

```ts
export type ResolvedContext = {
  chunks: ReadonlyArray<ContentChunk & { evicted: boolean; reason?: string }>;
  totalTokens: number;
  budget: number;
  estimatedCost?: number;
};

// On the manifold:
previewContext: (agentId: string, input: unknown) => Promise<ResolvedContext>;
```

Runs steps 1–5 of the pipeline and returns the resolved chunks with their sources, token counts, and eviction decisions, *without* sending anything to a model. This is non-negotiable in v1. Debugging context-related issues without it is hell, and it costs nothing to implement once the pipeline exists.

### 5.5 Built-in producers

Located in `cortex/context/producers/`:

| Producer | Default priority | Purpose |
|---|---|---|
| `systemProducer(prompt)` | 100 (pinned) | The agent's system prompt |
| `actionContractProducer()` | 100 (pinned) | Plan-mode only: ActionPlan rules and allowed kinds |
| `inputProducer()` | 100 (pinned) | The current invocation's input as a user message |
| `toolsProducer({ filter, format })` | 90 | Registry-aware tool list, filtered by policy |
| `agentsProducer({ filter })` | 80 | Available delegate agents (for plan-mode `ask_agent`) |
| `budgetProducer()` | 70 | Remaining tokens/cost/ticks — helps the model self-regulate |
| `recitationProducer({ goalKey })` | 60 | Per Manus: re-injects the active goal/todo to fight context drift |
| `historyProducer({ window, compress })` | 50 | Conversation history with bounded window |
| `observationsProducer({ window, format })` | 40 | Recent step observations from the current workflow |

**Default specs:**
- `text` / `structured` mode: `[system, tools, history, input]`
- `plan` mode: `[system, actionContract, tools, agents, budget, history, observations, input]`

Users override per-agent via `defineAgent({ context: { producers: [...] } })`. Interceptors attach producers dynamically via `manifold.addProducer(producer, { agentId? })`.

### 5.6 Compression

Two compressors ship in `cortex/context/compressors/`:

| Compressor | Cost | When to use |
|---|---|---|
| `truncate` | Free | Default. Drop oldest/lowest-priority chunks until under cap. |
| `summarize` | One LLM call | History layers in long workflows. Uses a small/fast model picked at config time, not hardcoded. |

Compression is **opt-in** at the producer level. The runtime warns in dev mode when a producer with no compressor consistently exceeds budget. LLM-based compression cost flows into the parent run's ledger, surfaced via `previewContext()` so it's visible.

We do **not** estimate cost in dollars across providers — providers don't expose pricing programmatically and the same token count costs 100× more on Opus than on a 20B OSS model. Budget enforcement is in *tokens*, not dollars. Optional dollar accounting via user-supplied per-model price maps later.

### 5.7 KV-cache stability (the Manus lesson)

The Cortex pipeline must produce a stable prefix for cache hits. Concretely:

- Pinned producers (priority 100) always come first, in deterministic order.
- Producer outputs must be deterministic for the same `BuildContext`. No `Date.now()` in chunk content. No random IDs.
- v1 accepts cache misses when tool lists change. v2 explores logit masking via Signal (`tool_choice` constraints) instead of removing tools from the list.

### 5.8 Token estimation

Two modes, configurable per call and globally:

- **`fuzzy`** (default): heuristic (~4 characters per token, plus ~4 tokens per-message overhead). Fast, good enough to answer "am I at 10k or 100k?" for budget decisions. This is what ships today.
- **`exact`**: intended to delegate to `signal.count(model, content)` for provider-aware token counting. **Currently falls back to fuzzy** — `signal.count()` exists upstream but uses the same heuristic internally. When a real tokenizer integration lands (e.g. tiktoken for OpenAI models), it slots into `signal.count()` and Cortex's exact mode calls it. One place to change, propagates everywhere.

The heuristic is roughly correct for English text and roughly wrong for code, structured JSON, and non-Latin scripts. For budget enforcement this is acceptable — the purpose is "don't blow past the cap," not "count to the exact token." For cost estimation it's less acceptable; dollar-accurate accounting would need the real tokenizer.

### 5.9 Pipeline caching (future work)

The pipeline rebuilds fresh on every iteration. This is simple and correct — no stale-context bugs possible — but redundant for producers whose output doesn't change between iterations.

**Future optimization: producer-level volatility tagging.** Each producer declares whether its output is `stable` (same for the lifetime of the invocation) or `volatile` (may change between iterations):

- **Stable**: `system`, `actionContract`, `tools`, `agents`, `input` — these don't change between tool-loop iterations or tick-loop ticks within one `executeAgent` call.
- **Volatile**: `observations`, `budget`, `history`, `retryFeedback` — these change between iterations as new observations land and budgets decrease.

The pipeline would cache stable producers on first build and skip `build()` on subsequent iterations. The cache is scoped per-invocation, not persisted.

**Not implementing yet**: all built-in producers currently return static strings (or strings derived from static state). The rebuild cost is negligible. When producers start reading from slower sources (databases, external APIs, LLM-based compression), caching will matter. Profile first, optimize second.

---

## 6. The Cortex Tool Loop

### 6.1 Why Cortex owns the tool loop

Round-1 design assumed Signal handled the tool loop. Round-2 changed this. Reasons:

1. Per-call **policy gating** — a tool can be denied mid-loop without aborting the whole agent run.
2. Per-call **ledger attribution** — we know exactly which tool burned which tokens.
3. **Context injection between calls** — a low-budget warning, a freshly-retrieved fact, an interceptor's hint can land between iterations.
4. **Observation per call** — debugging, replay, future streaming.
5. **Tool result mutation** — scope-filter, cache-substitute, redact via interceptors.
6. **Abort mid-loop** — an interceptor's `abort` decision lands cleanly.

### 6.2 The loop

```
loop while iterations < maxToolIterations:
  pack    = contextPipeline.build(agent, runContext)
  result  = signal.complete({ model, messages: pack, tools: registryTools })
  
  if not result.toolCalls or empty:
    return parseOutput(result.content, agent.outputMode)
  
  for call in result.toolCalls:
    gate = policy.check(call, runContext)
    if not gate.allowed:
      appendErrorChunk(gate.reason)
      continue
    
    interceptors.run('beforeToolCall', call)
    obs = await registry.executeTool(call, toolContext)
    interceptors.run('afterToolCall', call, obs)
    
    runContext.observations.append(obs)
    bus.emit('cortex.tool.observed', obs)

  // re-pack context with new observations and loop
```

Signal narrows to: model call, provider routing, fallback strategy, raw tool-call output. Tool *orchestration* moves to Cortex.

**Verify before Phase A:** `signal.complete()` returns raw `toolCalls` without auto-executing them when called without Signal-side tool registration. If it does not, that's a small Signal change.

### 6.3 Bounds

- **Inner (tool loop)**: `maxToolIterations`, default 10. Per-agent-call. Counts model→tool→model round-trips during a single agent invocation.
- **Outer (tick loop)**: `maxTicks`, default 20. Per-workflow. Each director plan execution = 1 tick. Plan-mode only.

These do not share a budget. Inner is constrained per-call; outer counts how many times a director gets to think.

---

## 7. Plans and the Plan Executor

### 7.1 ActionPlan schema

```ts
export const ActionPlanSchema = z.array(PlanNodeSchema);
export const PlanNodeSchema = z.discriminatedUnion('kind', [
  AskAgentNodeSchema,
  UseToolNodeSchema,
  TellTopicNodeSchema,
  WaitNodeSchema,
  ParallelNodeSchema,
  ReflectNodeSchema,
  FinalNodeSchema,
]);
```

Node kinds and shapes follow the round-1 design (`use_tool`, `ask_agent`, `tell_topic`, `wait`, `parallel`, `reflect`, `final`). Each node carries optional metadata: `idempotencyKey`, `timeoutMs`, `priority`, `tags`. Every field has `.describe()` for LLM consumption — schemas double as documentation.

### 7.2 Plan-mode execution = the tick loop

Calling `manifold.execute(planAgent, input)`:

1. Build context pack via the pipeline.
2. Call agent (which runs the Cortex tool loop, see §6).
3. Parse output as `ActionPlan`. Validate depth (`maxPlanDepth=2` by default).
4. Run interceptors with `beforePlan` hook (chance to rewrite or abort).
5. Execute plan nodes depth-first. Each node:
   - `beforeStep` interceptors fire.
   - Policy gate checks the node.
   - Execute (`use_tool`, `ask_agent`, etc.) — for `ask_agent`, dispatch via the bus and await the response (sync sugar over event substrate).
   - Observation recorded; `cortex.observation.recorded` emitted.
   - `afterStep` interceptors fire.
6. If the plan ends in `final`, return result; emit `cortex.workflow.ended`.
7. If not, increment tick counter, go back to step 1.
8. If `maxTicks` exceeded, abort with `ticks_exceeded`.

The tick loop is part of plan-mode execution. There is no `createDirectorBehavior`. There is no separate "director mode". A plan-mode agent IS a director.

### 7.3 `ask_agent` is sync sugar over the bus

Behind the scenes, `ask_agent` dispatches `cortex.agent.execute.requested` and awaits `cortex.agent.execute.completed:${runId}`. For in-process specialists, the implementation may short-circuit through the registry as a performance optimization, but the contract remains event-based and the events fire either way.

### 7.4 `tell_topic` and `wait`

Async coordination uses `tell_topic` to publish and `wait` (in a parallel block or alone) to block until a matching event fires. Both ride directly on the bus. Useful for cross-workflow coordination, human-in-the-loop pauses, and any "fire and eventually receive" pattern.

---

## 8. Interceptors — Steering, Not State Machines

Round-1 "behaviors" produced something that looked like a state machine and felt like one too. Round-2 reframed: **agents are the freedom; interceptors are the gravity.** They constrain and steer a free agent swarm. They are not orchestration wiring.

### 8.1 Two primitives

#### Stateful context producers (the 80% case)

A `ContextProducer` with `subscribes` is, by definition, an interceptor. It listens to bus events, accumulates state, and shapes future context for the agent. Most steering looks like this:

```ts
export const escalationSteering: ContextProducer = {
  id: 'escalation-steering',
  priority: 90,
  subscribes: ['analysis.sentiment'],
  onEvent: (event, state) => {
    const payload = event.payload as { score?: number };
    if (typeof payload.score === 'number' && payload.score < 0.3) {
      state.flag('user-frustrated');
    }
  },
  build: ({ state }) => state.has('user-frustrated')
    ? [{
        source: 'escalation-steering',
        role: 'system',
        content: 'Customer sentiment is negative. Prioritize empathy and consider handing off.',
      }]
    : [],
};
```

Watch events. Sometimes add a chunk. No state machine, no effect DSL.

#### Hook-based interceptors (the escape hatch)

For the 20% of steering that can't be done by adding context (rewrite a plan, abort a run, mutate the registry), there's a small set of hooks:

```ts
export type Interceptor = {
  id: string;
  hook: InterceptorHook;
  handler: (ctx: InterceptorContext) => Promise<InterceptorResult> | InterceptorResult;
};

export type InterceptorHook =
  | 'beforePlan'
  | 'afterPlan'
  | 'beforeStep'
  | 'afterStep'
  | 'beforeToolCall'
  | 'afterToolCall'
  | 'beforeFinal';

export type InterceptorResult =
  | { kind: 'continue' }
  | { kind: 'rewrite-plan'; plan: ActionPlan }       // beforePlan only
  | { kind: 'rewrite-step'; node: PlanNode }         // beforeStep only
  | { kind: 'abort'; reason: string }
  | { kind: 'inject-observation'; observation: Observation }
  | { kind: 'substitute-result'; result: unknown };  // afterToolCall only
```

When multiple interceptors register for the same hook, ordering is **registration order** in v1. Explicit priorities only if profiling demands it.

### 8.2 `defineBehavior`

A thin convenience that bundles producers and interceptors with shared state, for users who think of "this rate-limit thing" as one concept rather than four pieces:

```ts
export const defineBehavior = (config: BehaviorConfig): BehaviorDefinition => { ... };

export type BehaviorConfig = {
  id: string;
  producers?: ContextProducer[];
  interceptors?: Interceptor[];
};
```

`defineBehavior` is sugar. Users who want either alone use the underlying primitives directly. There is no separate behavior runtime.

---

## 9. Memory — Interface Only

The interface ships in v1. The implementation does not (beyond a bare in-memory reference for tests). When memory matters in a real workflow, it shows up as a custom `ContextProducer` that pulls from a `MemoryStore` and formats however is appropriate. Agents do not call memory directly via tool calls. Memory access is a context engineering problem, not a tool problem.

```ts
export type MemoryStore = {
  get: (workflowId: string, key: string) => Promise<unknown>;
  set: (workflowId: string, key: string, value: unknown) => Promise<void>;
  delete: (workflowId: string, key: string) => Promise<void>;
  list: (workflowId: string, prefix?: string) => Promise<string[]>;
};
```

When the real memory plan lands, it slots in cleanly as a producer plus a `MemoryStore` implementation. The runtime stays unaware. This is intentional and is the design's main concession to "we know we don't know yet."

---

## 10. The Manifold

```ts
export const createManifold = (config: ManifoldConfig): Manifold => { ... };

export type ManifoldConfig = {
  llm: SignalClient;
  stateStore?: StateStore;
  eventLog?: EventLog;
  defaultPolicy?: PolicyConfig;
  defaultContextSpec?: ContextSpec;
  tokenEstimation?: 'fuzzy' | 'exact';
  compressorModel?: string;
  hooks?: ManifoldHooks;
};

export type ManifoldHooks = {
  onWorkflowStart?: (workflowId: string) => void;
  onWorkflowEnd?: (workflowId: string, result: unknown) => void;
  onObservation?: (observation: Observation) => void;
  onError?: (error: Error, context: { workflowId?: string; agentId?: string }) => void;
};

export type Manifold = {
  // Registration
  registerAgent: (agent: AgentDefinition) => Unsubscribe;
  registerTool: (tool: ToolDefinition) => Unsubscribe;
  addProducer: (producer: ContextProducer, scope?: { agentId?: string }) => Unsubscribe;
  addInterceptor: (interceptor: Interceptor, scope?: { agentId?: string }) => Unsubscribe;
  registerBehavior: (behavior: BehaviorDefinition) => Unsubscribe;

  // Bus (the substrate)
  bus: Bus;

  // State
  getState: (workflowId: string, key: string) => Promise<unknown>;
  setState: (workflowId: string, key: string, value: unknown) => Promise<void>;

  // Execution (sync sugar over the bus)
  execute: <T>(agentId: string, input: unknown, options?: ExecuteOptions) => Promise<Result<T>>;
  previewContext: (agentId: string, input: unknown) => Promise<ResolvedContext>;

  // Lifecycle
  start: () => Promise<void>;
  stop: () => Promise<void>;
  drain: () => Promise<void>;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: CortexError };
```

Errors surface as a domain `Result<T>` from `execute`, not as thrown exceptions, except for programmer errors (calling `execute` with an unregistered agent throws — that's a bug, not a runtime condition). See §11.

---

## 11. Error Model

A small, deliberate taxonomy. The principles:

1. **Programmer errors throw.** Calling `execute` with an unregistered agent, registering two tools with the same id, building an agent without a required schema — these throw immediately. They are bugs.
2. **Runtime conditions return.** Tool execution failed, gate denied a step, budget exceeded, plan invalid, model returned malformed output — these surface as `Result<T>` with a `CortexError`. Callers handle them.
3. **Observations carry errors, not exceptions.** A failed tool call inside an agent run produces an observation with an `error` field. The agent sees it and decides what to do. The runtime does not abort the workflow on a single tool failure.
4. **Abort propagates.** An interceptor's `abort` result, an `AbortSignal` triggered externally, or `maxTicks` exceeded all produce a clean `Result<T>` with `ok: false` and a structured error. Drain semantics ensure in-flight work completes or aborts before `stop` resolves.
5. **Bus handlers never crash the bus.** Errors in handlers are caught, logged, and surfaced via `cortex.error` topic. Other handlers continue.

```ts
export type CortexError = {
  code: ErrorCode;
  message: string;
  workflowId?: string;
  agentId?: string;
  cause?: unknown;
};

export type ErrorCode =
  | 'agent_not_registered'
  | 'tool_not_registered'
  | 'invalid_plan'
  | 'plan_depth_exceeded'
  | 'ticks_exceeded'
  | 'tool_iterations_exceeded'
  | 'duration_exceeded'
  | 'budget_exceeded'
  | 'gate_denied'
  | 'tool_execution_failed'
  | 'output_validation_failed'
  | 'model_call_failed'
  | 'aborted'
  | 'timeout'
  | 'unknown';
```

`ErrorCode` is a union literal type, not an enum (style guide). Custom error classes are not used because the style guide says no classes — `CortexError` is a plain typed object.

---

## 12. File Structure

```
src/
├── index.ts                          # Public API
├── types.ts                          # Shared core types
│
├── schemas/
│   ├── action-plan.schema.ts
│   ├── agent-config.schema.ts
│   ├── tool-config.schema.ts
│   ├── observation.schema.ts
│   ├── policy.schema.ts
│   └── content-chunk.schema.ts
│
├── manifold/
│   ├── manifold.ts                   # createManifold, lifecycle
│   ├── registry.ts                   # agents, tools, producers, interceptors
│   ├── bus.ts                        # wildcard pub/sub, waitFor, dispatch
│   ├── ledger.ts                     # token budgets (no $ pricing)
│   └── micro-manifold.ts             # for runAgentStandalone
│
├── agent/
│   ├── define-agent.ts
│   ├── execute.ts                    # the single execution path
│   ├── output-parser.ts              # text / structured / plan
│   └── standalone.ts                 # runAgentStandalone helper
│
├── context/
│   ├── types.ts                      # ContextProducer, ContentChunk, BuildContext
│   ├── pipeline.ts                   # gather → build → estimate → compress → pack
│   ├── budget.ts                     # eviction, priority sorting
│   ├── preview.ts                    # previewContext implementation
│   ├── tokens.ts                     # exact/fuzzy estimation, Signal bridge
│   ├── producers/
│   │   ├── system.producer.ts
│   │   ├── action-contract.producer.ts
│   │   ├── tools.producer.ts
│   │   ├── agents.producer.ts
│   │   ├── input.producer.ts
│   │   ├── budget.producer.ts
│   │   ├── history.producer.ts
│   │   ├── observations.producer.ts
│   │   └── recitation.producer.ts
│   └── compressors/
│       ├── truncate.compressor.ts
│       └── summarize.compressor.ts
│
├── tool-loop/
│   ├── loop.ts                       # the inner iteration
│   └── attribution.ts                # ledger entries per call
│
├── runtime/
│   ├── plan-executor.ts              # depth-first, gate per step
│   ├── tick-loop.ts                  # outer loop for plan-mode agents
│   ├── gate.ts                       # policy enforcement
│   └── bounds.ts                     # depth/ticks/duration enforcement
│
├── interceptors/
│   ├── types.ts
│   ├── registry.ts                   # by-hook lookup
│   ├── runner.ts                     # invoke at hook points
│   └── define-behavior.ts            # bundles producers + interceptors
│
├── memory/
│   ├── types.ts                      # MemoryStore interface
│   └── in-memory.store.ts            # bare reference for tests
│
├── store/
│   ├── types.ts                      # StateStore, EventLog
│   ├── memory-state.store.ts
│   └── memory-event.log.ts
│
├── errors/
│   └── cortex.errors.ts              # CortexError, ErrorCode
│
└── utils/
    ├── id.ts                         # workflow / correlation ids
    └── wildcard.ts                   # topic pattern matching
```

File names follow [`STYLE_GUIDE.md`](../../STYLE_GUIDE.md) §File Naming. Schemas use `.schema.ts`, producers use `.producer.ts`, compressors use `.compressor.ts`, stores use `.store.ts`. Primary implementation files (e.g. `manifold.ts`, `pipeline.ts`) skip the role suffix when the role is obvious.

---

## 13. Streaming — Reserved, Not Implemented

Streaming is intentionally deferred. We will not ship a partial-output streaming API in Cortex v1, because doing so requires the partial-JSON library to be properly designed first, and we do not want to force that library or hold up Cortex on it. Token-level streaming (raw model tokens) and observation-level streaming (workflow events on the bus) are *already free* with the event substrate — anyone who wants them can subscribe to the bus today.

What we reserve: the *shape* of `manifold.execute(..., { stream: true })` is left as a future addition. When we add it, it will return `{ result: Promise<Result<T>>, stream: AsyncIterable<StreamEvent> }`. Until then, `execute` returns `Promise<Result<T>>` and that is the entire surface. Users who want richer event streams subscribe to the bus directly.

This is a deliberate "the API is missing a feature, not broken." Adding streaming later is additive. Rushing it now would be a mistake.

---

## 14. Phased Build Plan

Each phase ends with something usable. Phase A unblocks Vex and Prism agents. Phase B unblocks the showroom multi-agent demo. Phase C adds steering. Phase D hardens for production.

### Phase A — Substrate (unblocks Vex and Prism agents)

Goal: Vex's query agent and Prism's mapping agent are defined in their respective `@niscorp/vex/agent` and `@niscorp/prism/agent` sub-exports, run via `runAgentStandalone` in the showroom against a real model, and produce validated output. `previewContext` works and is useful for debugging.

- Schemas: `ActionPlanSchema` (deferred validation; not used until Phase B), `AgentConfigSchema`, `ToolConfigSchema`, `ObservationSchema`, `ContentChunkSchema`. All with `.describe()`.
- Manifold skeleton: registry, bus (wildcard subs, `waitFor`, `dispatch`, correlation ids), in-memory ledger, in-memory state store, in-memory event log, lifecycle (`start`/`stop`/`drain`).
- `defineTool`, `defineAgent` for `text` and `structured` modes only.
- Context pipeline: types, gather/build/estimate/compress/pack, `previewContext`.
- Built-in producers: `system`, `tools`, `input`, `history` (basic), `budget`.
- `truncate` compressor.
- Token estimation: fuzzy mode by default. Exact mode hooked up to `signal.count()` once that's added upstream.
- Cortex tool loop on top of `signal.complete()`.
- Agent execution path (single function, used by both standalone and manifold).
- `runAgentStandalone` helper.
- `RunContext`, `BuildContext`, `ToolContext` shared base.
- Error model (§11) implemented end-to-end.
- Tests: schema round-trip, pipeline (extensive), tool loop with stubbed Signal, standalone-vs-manifold parity.
- **Reality contact: scratch agent + Vex query agent + Prism mapping agent in the showroom.** Phase A is not done until these run reliably against a real model.

**Upstream:** add `signal.count(model, content)` to Signal. Verify `signal.complete()` returns raw `toolCalls` without auto-execution.

### Phase B — Planning (unblocks multi-agent showroom demo)

Goal: A director agent in plan mode delegates to specialists, executes a tick loop with bounded depth/ticks, and the showroom can demo a multi-agent workflow end-to-end.

- ActionPlan plan-mode in `defineAgent`.
- Plan executor: depth-first, gate per node, observation per step.
- Tick loop integrated into plan-mode execution.
- `ask_agent` (sync sugar over the bus, with in-process short-circuit for specialists).
- `tell_topic` + `wait` + `parallel`.
- Policy gate: tool allow/deny, risk levels, budget enforcement.
- Built-in producers: `actionContract`, `agents`, `observations`.
- Tests: plan validation, depth bounds, tick bounds, gate enforcement, parallel execution.
- **Reality contact: a multi-agent demo in the showroom** (e.g. a research-analyst director that delegates to specialists). Phase B is not done until that demo works reliably.

### Phase C — Steering (interceptors land)

Goal: Behaviors expressed as interceptors are useful in the showroom.

- Stateful producers via `subscribes` + `onEvent`.
- Hook-based interceptor system + runner.
- `defineBehavior` convenience.
- Async confirmation flow as a built-in interceptor preset.
- `recitation` producer (Manus pattern).
- `summarize` compressor (opt-in, with configurable small/fast model).
- Tests: stateful producer accumulation, hook ordering, rewrite/abort/substitute results.
- **Reality contact: at least one showroom demo where an interceptor demonstrably changes behavior** (e.g. an escalation behavior that injects a system note when sentiment drops, or a confirmation flow that pauses and resumes).

### Phase D — Production hardening

Goal: Deployable.

- Durable `StateStore` and `EventLog` adapters (Postgres reference implementation).
- Drain semantics polished.
- Metrics hooks (`onObservation`, `onWorkflowEnd`).
- KV-cache stability optimizations: explore logit masking via Signal `tool_choice`.
- `signal.count()` exact-mode integration polish.
- Optional dollar accounting via user-supplied per-model price maps.
- Streaming API (the reserved shape from §13) — but only if the partial-JSON library has landed. If not, defer further.

---

## 15. How We Know We're On The Right Track

Three layers of signal. You need all three.

### Layer 1 — Tests (correctness)

Catches "the code does what the design says." Cortex is unusually testable because most of it is pure functions. The pipeline and the tool loop should have the bulk of the test suite. Standalone-vs-manifold parity tests are essential — they validate the "one execution path" claim.

### Layer 2 — Integration with the rest of the stack (fit)

Catches "the abstractions are wrong." If defining the Vex query agent in `@niscorp/vex/agent` requires Cortex changes, that's a design signal. Resolve every "I wish Cortex did X" explicitly: either Cortex really should do X, or Vex is approaching the problem wrong, or the abstraction is at the wrong level. Write the resolutions down.

### Layer 3 — The showroom and a real model (truth)

Catches "the design works in theory but not under contact with a live LLM." This is what you've called out: at some point we go to the showroom and run a Prism agent with a real model and watch what happens. **This must happen at the end of every phase, not at the end of the project.** Each phase has a reality-contact requirement (§14). If a phase's showroom test doesn't work reliably, that phase is not done, regardless of how green the unit tests are.

The signal we're looking for at the end of Phase A: *"the showroom Prism agent runs reliably and I can debug it when it doesn't."* Phase B: *"the showroom multi-agent demo runs reliably and when it goes off the rails I can see why."* Phase C: *"interceptors are useful and the runtime feels steerable, not opaque."*

A specific recommendation: **build a scratch agent in the showroom from day one and keep it running through every phase.** Trivial agent ("rewrite this sentence in three styles, return as JSON"). Five minutes of work, enormous information value. Every change to Cortex re-runs it. If it breaks or feels worse, we know immediately.

---

## 16. Open Questions

These are not blocking implementation. They are things we know we don't know yet, and we are intentionally finding out by writing code.

1. **Producer-as-behavior unification might be wrong.** The framing collapses two genuinely-different things (passive context shaping, active runtime steering) into one primitive. If it produces footguns in practice, we revisit. The escape hatch is hook-based interceptors, which already exist as a separate primitive.

2. **Compression cost surprise.** A producer that opts into LLM-based summarization can suddenly spend tokens. We surface this in `previewContext()` and warn in dev mode. If it bites in practice, we add hard caps.

3. **KV-cache stability vs dynamic tool lists.** Adding/removing tools mid-workflow invalidates the cache. v1 accepts this and measures. v2 explores logit masking via Signal.

4. **Memory is a future research area.** The current "no implementation, only an interface, accessed via context producers" approach is deliberate. When the real memory plan lands, it should slot in cleanly as a `ContextProducer` plus a `MemoryStore` implementation. If it doesn't slot in cleanly, the abstraction is wrong and we revisit.

5. **Cross-tick context determinism.** The tool loop rebuilds context between iterations. This is correct but hits cache. If hot-loop performance suffers, look at producer-level caching with explicit invalidation tags. Defer until profiled.

6. **Interceptor ordering.** When multiple interceptors register for the same hook, ordering matters. v1: registration order. v2: explicit priorities only if needed.

7. **Streaming.** Reserved API shape, not implemented. Lands when the partial-JSON library is properly designed.

These are the known unknowns. Write them down as they get resolved.

---

## 17. Glossary

- **ActionPlan** — Discriminated-union output of plan-mode agents. Tree of `use_tool | ask_agent | tell_topic | wait | parallel | reflect | final` nodes. Executed by the plan executor under policy gates and budget enforcement.
- **Agent** — A `defineAgent`-defined function from input to typed output. Three modes: `text`, `structured`, `plan`. Stateless. Runs on Cortex always (standalone is just a micro-manifold).
- **Bus** — The event substrate. Wildcard pub/sub with `emit`, `on`, `waitFor`, `dispatch`. Source of truth for everything that happens.
- **BuildContext** — The runtime state visible to a producer when it builds its chunks. Read-only.
- **Compressor** — A function that shrinks a producer's output to fit a budget. `truncate` (default, free) or `summarize` (LLM-based, opt-in).
- **ContentChunk** — A single piece of content destined for the model. Has role, content, tokens, priority, source. Producers emit these.
- **ContextProducer** — Pluggable component that contributes content chunks to an agent's context. Optionally stateful via bus subscriptions. The most important Cortex primitive after agent execution.
- **Cortex Tool Loop** — Cortex-owned (not Signal-owned) iteration: model call → tool calls → gate → execute → re-pack context → next call.
- **Director** — Informal term for a plan-mode agent. Not a separate type.
- **Interceptor** — Hook-based steering primitive. Runs at named hooks (`beforePlan`, `beforeStep`, `afterToolCall`, etc.) and can rewrite, abort, inject, or substitute. The escape hatch when context steering isn't enough.
- **Manifold** — Central coordinator: registry, bus, ledger, state store, event log. Lifecycle: start/stop/drain.
- **Micro-manifold** — Ephemeral one-shot manifold built by `runAgentStandalone`. Discarded after the run. Same code path as a full manifold.
- **Observation** — Structured record of a plan step's execution: kind, duration, result/error, depth, tick. Fed back to the agent as context next tick.
- **Pipeline (context)** — gather → build → estimate → compress → pack. Runs every time an agent is invoked.
- **Plan executor** — Depth-first executor for ActionPlans. Runs each node under the policy gate and emits observations.
- **`previewContext`** — Debugging API: returns the resolved chunks an agent would see for a given input, with sources and eviction decisions, without sending to the model.
- **Producer** — Short for ContextProducer.
- **`Result<T>`** — The fallible-API contract: `{ ok: true, data } | { ok: false, error }`. Used for runtime conditions; programmer errors throw.
- **`RunContext`** — The runtime "this" available during an agent invocation. Carries `workflowId`, `agentId`, `tick`, `signal`, `bus`, `ledger`, `emit`.
- **Steering** — What interceptors and stateful producers do. The opposite of orchestration: agents stay free, the system bends the field they operate in.
- **Tick** — One iteration of a plan-mode agent's outer loop. Each director plan = 1 tick. Bounded by `maxTicks`.
- **Tick loop** — The outer loop in plan-mode execution. Part of the runtime, not a behavior.
- **Tool loop** — The inner iteration during a single agent invocation. Bounded by `maxToolIterations`. Owned by Cortex.
- **`waitFor`** — Bus primitive that blocks until a matching event fires. The basis of every sync API in Cortex.
- **Workflow** — One top-level `manifold.execute()` call and everything it transitively triggers. Specialists called via `ask_agent` share the parent's `workflowId`. State and event log entries are scoped per-workflow. State cleanup happens on workflow end.

---

## Sources Consulted

- [Microsoft Agent Framework Context Provider API](https://medium.com/microsoftazure/context-engineering-with-microsoft-agent-frameworks-context-provider-api-dcf083daa8be)
- [LangChain Context Engineering blog](https://blog.langchain.com/context-engineering-for-agents/)
- [LangChain Context Engineering docs](https://docs.langchain.com/oss/python/langchain/context-engineering)
- [Mastra Agent Memory docs](https://mastra.ai/docs/agents/agent-memory)
- [Vercel AI SDK Loop Control / prepareStep](https://ai-sdk.dev/docs/agents/loop-control)
- [Manus blog: Context Engineering Lessons from Production](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
- [Neon agentic refactor plan (prior art)](../../../Neon/src/server/agentic/REFACTORING_PLAN.md)
