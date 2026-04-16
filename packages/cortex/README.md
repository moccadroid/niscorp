# @niscorp/cortex

Agentic orchestration runtime. Typed agents, typed tools, declarative
plans, a producer-based context pipeline, a declarative rules engine,
and a bus-first event substrate. Two peer dependencies:
[`@niscorp/signal`](../signal) and `zod`.

```bash
pnpm add @niscorp/cortex @niscorp/signal zod
```

---

## What it is

Cortex is the orchestration substrate for LLM-backed work. It gives
you:

- **Agents** (`defineAgent`) in three modes — `text`, `structured`
  (Zod-validated), or `plan` (emits an `ActionPlan` the runtime
  executes under policy gates).
- **Tools** (`defineTool`) with Zod-validated input and a typed
  `execute` handler.
- **A context pipeline** of *producers* that assembles what the model
  sees on every call. Producers are pluggable, budgeted, and can be
  stateful via bus subscriptions.
- **Plan execution** — directors emit an `ActionPlan`, the tick loop
  runs its nodes depth-first, observations feed back into the next
  tick, everything bounded by `maxTicks` and `maxPlanDepth`.
- **A declarative rules engine** (`defineRule`) — JSON `watch` /
  `when` / `then` definitions that observe bus events, accumulate
  state, and fire effects (`inject`, `abort`, `deny`, `call`). No code
  interceptors needed for the common cases.
- **A typed event bus** — every state change emits a typed event.
  Sync APIs are convenience sugar over dispatch-and-await.

Cortex has no HTTP client, no database, no UI, no LLM SDK. It's an
orchestration layer on top of Signal (for model calls) and Zod (for
validation).

For the *why* behind the architecture — event substrate, producer
model, Cortex-owned tool loop, rules over hooks — see
[DESIGN.md](./DESIGN.md).

---

## Quick example

One agent, one tool, one call:

```ts
import { z } from 'zod';
import { createSignal } from '@niscorp/signal';
import { defineAgent, defineTool, runAgentStandalone } from '@niscorp/cortex';

const calculator = defineTool({
  id: 'calculator',
  name: 'calculator',
  description: 'Evaluates a simple arithmetic expression.',
  input: z.object({ expression: z.string() }),
  execute: async ({ expression }) => ({ result: new Function(`return (${expression})`)() }),
});

const CalcSchema = z.object({ answer: z.number(), working: z.string() });

const calcAgent = defineAgent({
  id: 'calc',
  name: 'Calc',
  description: 'Arithmetic with a tool.',
  instructions: 'Use the calculator tool. Return JSON { answer, working }.',
  outputMode: 'structured',
  outputSchema: CalcSchema,
  tools: ['calculator'],
});

const llm = createSignal('groq', { model: 'openai/gpt-oss-120b' });

const result = await runAgentStandalone(calcAgent, 'What is (2 + 3) * 7 - 6?', {
  llm,
  tools: [calculator],
});

if (result.ok) console.log(result.data); // { answer: 29, working: '…' }
```

See [`examples/scratch.ts`](./examples/scratch.ts) for a longer walk
through text, structured, tools, plan mode, and multi-agent
delegation.

---

## Concepts

### `defineAgent`

Agents are stateless functions from `input` to typed output. State
lives in the runtime (ledger, observations, event log) or in
producers — not on the agent.

```ts
const agent = defineAgent({
  id: 'my.agent',
  name: 'My Agent',
  description: 'What it does, in one sentence.',
  instructions: 'System prompt — how it behaves.',
  outputMode: 'text' | 'structured' | 'plan',
  outputSchema: zodSchema,            // required when outputMode is 'structured'
  model: 'openai/gpt-oss-120b',       // optional; overrides manifold default
  tools: ['tool.a', 'tool.b'],        // optional whitelist
  policy: { … },                      // see Policy below
  maxToolIterations: 10,              // inner tool-loop bound
  maxTicks: 20,                       // outer tick-loop bound (plan mode)
  maxOutputRetries: 2,                // re-prompts on structured validation failure
  context: { producers: [ … ] },      // override default producer list
});
```

Structured mode without `outputSchema` **throws at definition time**.
Plan mode ignores `outputSchema` (it's always `ActionPlanSchema`).

### `defineTool`

```ts
const tool = defineTool({
  id: 'unique.tool.id',
  name: 'name_seen_by_model',
  description: 'Short description the model sees.',
  riskLevel: 'low' | 'medium' | 'high',  // used by the policy gate
  input: z.object({ … }),
  output: z.object({ … }),                // optional
  execute: async (input, ctx) => { … },   // ctx: { workflowId, agentId, signal, bus }
});
```

The tool loop validates input against the Zod schema **before**
invoking `execute`, so inside the handler the input is already typed.

### `runAgentStandalone`

One-shot execution. Builds a disposable runtime, registers the
agent/tools/rules/effects you pass in, runs the agent, tears the
runtime down. Same execution path as a long-lived manifold.

```ts
const result = await runAgentStandalone(agent, input, {
  llm,                            // SignalClient (createSignal returns one)
  tools: [calc, weather],         // registered on the ephemeral runtime
  specialists: [summarizer],      // other agents reachable via ask_agent
  rules: [rateLimitRule],         // declarative rules
  effects: [{ name: 'log', handler: async (ctx) => … }],
  onObservation: (obs) => … ,     // per-step callback
  onRetry:       (p)   => … ,     // validation-retry callback
  onBus:         (bus) => bus.on(…),
  workflowId: 'my-id',            // optional; auto-generated otherwise
});

// result: { ok: true, data: T } | { ok: false, error: CortexError }
```

### `createManifold`

For multi-turn work, shared state across runs, or when you want to
subscribe to the bus at process scope. Keep one manifold for the
lifetime of the process.

```ts
import { createManifold, CortexTopics } from '@niscorp/cortex';

const manifold = createManifold({ llm, tokenEstimation: 'fuzzy' });

manifold.registerAgent(agent);
manifold.registerTool(tool);
manifold.registerRule(rule);
manifold.registerEffect('log', logHandler);

await manifold.start();

// Inspect what the model would see, without calling it:
const preview = await manifold.previewContext(agent.agentId, input);

const result = await manifold.execute<T>(agent.agentId, input);

await manifold.stop();
```

`manifold.bus` is the source of truth — subscribe for observability,
side-effects, or UI.

### `previewContext`

The debugging API. Runs the context pipeline *without* hitting a
model and returns the resolved chunks with sources, token counts, and
eviction decisions.

```ts
const resolved = await manifold.previewContext(agentId, input);
for (const chunk of resolved.chunks) {
  console.log(`[${chunk.source}] ~${chunk.tokens}tok ${chunk.evicted ? 'EVICTED' : ''}`);
}
console.log(`total ~${resolved.totalTokens} / ${resolved.budget}`);
```

Anything you can't explain in the preview, the model can't either.

---

## The context pipeline

What the model sees on each call is assembled by an ordered pipeline
of `ContextProducer`s. Each producer contributes `ContentChunk`s;
the pipeline orders, estimates, compresses, and packs them.

```ts
const myProducer: ContextProducer = {
  id: 'my-producer',
  priority: 60,                   // 0 = most evictable, 100 = pinned
  subscribes: ['my.topic'],       // optional: stateful via bus events
  maxTokens: 2_000,               // optional per-producer budget
  build: ({ state, observations, registry }) => [
    { source: 'my-producer', role: 'system', content: 'Hint for the model' },
  ],
  compress: myCompressor,         // optional; default is tail truncation
  onEvent: (event, state) => {
    if (shouldFlag(event)) state.flag('user-frustrated');
  },
};
```

A producer with `subscribes` is automatically attached to the bus on
workflow start and detached on workflow end. Its state is private,
scoped per-workflow.

### Built-in producers

| Producer | Priority | Purpose |
|---|---:|---|
| `systemProducer(prompt)` | 100 | The agent's system prompt (pinned) |
| `actionContractProducer()` | 100 | Plan-mode only: ActionPlan rules and allowed kinds |
| `inputProducer()` | 100 | The current invocation's input as a user message |
| `toolsProducer({ filter, format })` | 90 | Registry-aware tool list, policy-filtered |
| `agentsProducer({ filter })` | 80 | Available delegates for plan-mode `ask_agent` |
| `budgetProducer()` | 70 | Remaining tokens/ticks — helps the model self-regulate |
| `recitationProducer({ goalKey })` | 60 | Re-injects the active goal to fight context drift |
| `historyProducer({ window, compress })` | 50 | Conversation history with a bounded window |
| `observationsProducer({ window, format })` | 40 | Recent observations from the current workflow |

Defaults (applied when `defineAgent` omits `context`):

- `text` / `structured`: `[system, tools, history, input]`
- `plan`: `[system, actionContract, tools, agents, budget, history, observations, input]`

### Compression

- `truncateCompressor` — free, default. Drops the lowest-priority
  chunks until the budget fits.
- `createSummarizeCompressor({ llm, model })` — one LLM call, opt-in.
  Summarizes a producer's chunks into a single system note. Cost
  flows into the parent run's ledger and surfaces in `previewContext`.

### Token estimation

- `tokenEstimation: 'fuzzy'` (default) — ~4 chars/token heuristic.
  Fast, good enough for budget decisions.
- `tokenEstimation: 'exact'` — delegates to `signal.count(model, content)`.

Budget enforcement is in **tokens**, not dollars.

---

## Plan mode and the tick loop

A plan-mode agent emits an `ActionPlan` — a list of typed nodes the
runtime executes depth-first under the policy gate. Each node
produces an `Observation`. After the plan finishes (or a `final` node
fires), the tick loop either terminates or rebuilds context with the
new observations and calls the agent again for the next tick.

### Node kinds

| Kind | Shape | What it does |
|---|---|---|
| `use_tool` | `{ kind, toolId, input }` | Invoke a registered tool via the tool loop |
| `ask_agent` | `{ kind, agentId, input }` | Delegate to another registered agent |
| `tell_topic` | `{ kind, topic, payload }` | Publish an event on the bus |
| `wait` | `{ kind, topic, timeoutMs? }` | Block until a matching event fires |
| `parallel` | `{ kind, branches: Node[] }` | Run branches concurrently |
| `reflect` | `{ kind, note }` | Log a note; no side effect |
| `final` | `{ kind, result }` | Finish the workflow with this result |

Example director plan (emitted by the model, executed by the
runtime):

```json
[
  { "kind": "parallel", "branches": [
    { "kind": "ask_agent", "agentId": "summarizer", "input": "…" },
    { "kind": "ask_agent", "agentId": "sentiment",  "input": "…" }
  ]}
]
```

After both branches complete, their results land as observations, the
tick loop re-runs the director, and the second tick is typically a
single `final` node that combines the results.

### Bounds

- `maxToolIterations` (default 10) — inner tool loop, per-agent call.
- `maxTicks` (default 20) — outer tick loop, plan mode only.
- `maxPlanDepth` (default 2) — how deeply plans may nest.

`ask_agent` is sync sugar over `cortex.execute.requested` /
`cortex.execute.completed`. In-process specialists short-circuit
through the registry as an optimization, but the events fire
regardless so observers see the whole workflow.

---

## Declarative rules

Rules are JSON `watch` clauses (accumulators over bus events) plus
ordered `rules` entries (`when` conditions → `then` effects). No code
interceptors needed for the common cases.

```ts
import { defineRule } from '@niscorp/cortex';

const rateLimit = defineRule({
  id: 'tool-rate-limit',
  description: 'Warns after 3 tool calls, aborts after 5.',
  watch: {
    toolCalls: { event: 'cortex.tool.observed', aggregate: 'count' },
  },
  rules: [
    { when: { $gte: ['$watch.toolCalls', 5] }, then: { abort: 'Hard limit: 5 tool calls.' } },
    { when: { $gte: ['$watch.toolCalls', 3] }, then: { inject: '⚠ Finalize with what you have.' } },
  ],
});

await runAgentStandalone(agent, input, { llm, tools, rules: [rateLimit] });
```

### Accumulators

Registered under `watch.<name>`; updated as matching events land:

- `{ event, aggregate: 'count' }` — number of events
- `{ event, aggregate: 'sum', field: 'dot.path' }` — running sum of a payload field
- `{ event, aggregate: 'latest', field: 'dot.path' }` — most recent value

Accumulator values appear in conditions as `$watch.<name>`.

### Conditions

Discriminated operators: `$eq`, `$neq`, `$gt`, `$gte`, `$lt`, `$lte`,
plus `$and`, `$or`, `$not`. Strings starting with `$watch.` resolve
against the accumulator scope; everything else is a literal.

### Effects

- `{ inject: 'text' }` — pushes a system message into the next
  context build; the agent sees it on its next call.
- `{ abort: 'reason' }` — terminates the workflow with a `CortexError`.
- `{ deny: 'reason' }` — denies the current tool call (fires in
  pre-tool evaluation only); the agent sees a tool error.
- `{ call: 'handler-name' }` — invokes a named effect handler you
  registered via `registerEffect` / `effects` option. Escape hatch for
  effects the DSL can't express.

Within one rule definition, **first match wins** per evaluation.

---

## Human-in-the-loop

Mark high-risk tools as `requireConfirmation` in the agent's policy.
The runtime pauses on those calls, emits
`cortex.policy.confirmation.requested`, and waits for an
approval/denial event on the bus.

```ts
const agent = defineAgent({
  /* … */
  tools: ['check_balance', 'transfer_funds'],
  policy: {
    tools: { requireConfirmation: ['transfer_funds'] },
    confirmationTimeoutMs: 30_000,
  },
});

// Your UI subscribes and responds:
manifold.bus.on(CortexTopics.confirmationRequested, async (event) => {
  const approved = await showDialog(event.payload);
  manifold.bus.emit({
    topic: approved
      ? CortexTopics.confirmationApproved.topic
      : CortexTopics.confirmationDenied.topic,
    payload: { toolId: event.payload.toolId },
    meta: { timestamp: Date.now(), correlationId: event.meta.correlationId },
  });
});
```

If the timeout fires first, the tool call is denied and the agent
reacts per its instructions.

---

## Output-validation retries

Structured-mode agents that produce invalid JSON are re-prompted up
to `maxOutputRetries` times (default 2), with the failed content and
Zod failure fed back as context. Each retry emits
`cortex.agent.retry`:

```ts
const result = await runAgentStandalone(agent, input, {
  llm,
  onRetry: ({ attempt, nextAttempt, rawContent, error }) => {
    console.log(`attempt ${attempt} failed → retrying (${nextAttempt})`);
  },
});
```

When retries exhaust, the result is
`{ ok: false, error: { code: 'output_validation_failed', … } }`.

---

## Policy and the gate

Policy constrains what an agent can do. All fields optional.

```ts
defineAgent({
  /* … */
  policy: {
    budget: {
      maxTokensPerRun: 50_000,
      maxTicksPerRun: 10,
      maxPlanDepth: 2,
      maxDurationMs: 60_000,
      maxParallelBranches: 4,
    },
    tools: {
      allow: ['tool.a', 'tool.b'],       // whitelist
      deny: ['tool.danger'],             // blacklist (overrides allow)
      requireConfirmation: ['transfer'], // see HITL above
      maxRiskLevel: 'medium',            // filter by tool.riskLevel
    },
    agents: {
      allow: ['specialist.a'],
      deny: ['specialist.rogue'],
    },
    confirmationTimeoutMs: 30_000,
  },
});
```

Denials become observations (not exceptions) so the agent can react.
`budget` exhaustion aborts the workflow with a `CortexError`.

---

## Bus and topics

The bus is the source of truth. Subscribe for observability,
side-effects, or to drive a UI.

```ts
import { CortexTopics } from '@niscorp/cortex';

manifold.bus.on(CortexTopics.workflowStarted, (e) => { /* e.payload typed */ });
manifold.bus.on(CortexTopics.toolObserved,    (e) => { /* … */ });
manifold.bus.on(CortexTopics.ruleFired,       (e) => { /* … */ });

// Wildcard subscriptions:
manifold.bus.on('cortex.execute.*', (e) => { /* … */ });

// Block until an event matches:
const ended = await manifold.bus.waitFor(CortexTopics.workflowEnded.topic, {
  filter: (e) => e.payload.workflowId === myId,
  timeoutMs: 30_000,
});
```

Reserved: `cortex.*` is the runtime namespace. User code emits under
its own namespaces; `tell_topic` and rule `call` effects can emit
anything that doesn't collide.

Selected runtime topics (see `CortexTopics` for the full typed set):

| Topic | Payload |
|---|---|
| `cortex.workflow.started` / `.ended` | `{ workflowId, agentId, input }` / `{ workflowId, result?, error?, ledger? }` |
| `cortex.tick.started` / `.ended` | `{ workflowId, tick }` |
| `cortex.agent.invoked` / `.completed` / `.retry` | `{ agentId, … }` |
| `cortex.tool.called` / `.observed` | `Observation` |
| `cortex.plan.produced` | `{ workflowId, agentId, plan }` |
| `cortex.policy.confirmation.requested` / `.approved` / `.denied` | `{ toolId, … }` |
| `cortex.rule.evaluated` / `.fired` | `{ result, accumulators }` / `{ ruleId, effect }` |
| `cortex.observation.recorded` | `Observation` |
| `cortex.error` / `cortex.warning` | `CortexError` / `{ message }` |

### Custom typed topics

```ts
import { topic } from '@niscorp/cortex';

const sentiment = topic<{ score: number }>('analysis.sentiment');

manifold.bus.on(sentiment, (e) => e.payload.score);  // typed
manifold.bus.emit({
  topic: sentiment.topic,
  payload: { score: 0.8 },
  meta: { timestamp: Date.now(), correlationId: 'x' },
});
```

---

## Errors and `Result<T>`

Cortex distinguishes **programmer errors** (throw) from **runtime
conditions** (return).

- **Throw**: unregistered agent, duplicate tool id, structured mode
  without `outputSchema`. These are bugs.
- **Return**: tool execution failed, gate denied a step, budget
  exceeded, invalid plan, model returned malformed output, validation
  retries exhausted, aborted. These surface as `{ ok: false, error:
  CortexError }`.

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

A failed tool call **inside** an agent run is an observation, not an
exception — the agent sees it and decides. The runtime only fails the
workflow when the error is structural.

---

## Building

```bash
pnpm build        # tsup ESM + CJS + DTS
pnpm test         # vitest run
pnpm typecheck    # tsc on src + examples
pnpm scratch      # examples/scratch.ts — six-scenario canary
```

The scratch canary needs `GROQ_API_KEY`; override the model with
`CORTEX_MODEL`.

---

## License

MIT
