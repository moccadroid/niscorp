# `@niscorp/cortex` — design

Cortex is the agent runtime of the `@niscorp` stack. It runs typed,
tool-using agents on top of [`@niscorp/signal`](../signal) (model
calls), [`@niscorp/solid`](../solid) (partial-JSON streaming), and
`zod` (validation). This document is the *why*; usage lives in
[`README.md`](./README.md). Style rules live in
[`niscorp/STYLE_GUIDE.md`](../../STYLE_GUIDE.md) — no `any`, no `as`,
no `!`, no `enum`, no classes; arrow-const exports with explicit
return types; kebab-case files with role suffixes; named exports only.

This is the second design. The first (see git history) built an
event-bus substrate, a producer pipeline, a JSON rules engine, and a
plan-mode interpreter. A full architecture review (2026-07) found:
every real consumer used only `defineAgent` + `defineTool` +
`runAgentStandalone`; structured mode never sent the output schema to
the model; the context prefix was re-templated every iteration
(cache-hostile); the rules engine and stateful producers were broken
in ways no consumer had hit because no consumer used them. v2 keeps
what earned its place — typed tools, gating, observations,
cross-library agents, context-from-functions, preview — and rebuilds
the execution core around the pattern the field converged on: one
tool loop with a typed exit.

---

## 1. What cortex does

1. **Agents.** `defineAgent<TData, TDeps>` — configuration, not a
   class. Typed output, typed per-invocation deps.
2. **One loop.** model → tools → model. Bounded, gated, observed. The
   only execution path; there is no second mode.
3. **The envelope.** Every agent returns structured data. Terminating
   the loop is itself a tool call (`respond`).
4. **Context.** Functions of typed deps build the prefix once per
   run. The transcript is append-only after that.
5. **Gates.** Code hooks before and after every tool call. Approvals
   suspend the run; suspended runs are serializable.
6. **Events.** Every run is a typed event stream. Observability *is*
   the stream.
7. **Manifold.** A catalog of agents and tools with shared defaults
   and a run tap. Libraries (vex, prism, nova) export agents; apps
   compose them; agents consume each other as tools.

**Anti-goals.** No HTTP, no UI, no database, no LLM SDK (signal), no
JSON-parsing of streams (solid), no event-bus substrate, no
declarative rules DSL, no plan interpreter (§14), no conversation
persistence (callers own history).

**Peers:** `@niscorp/signal`, `@niscorp/solid`, `zod`.

---

## 2. The envelope

Every agent returns the same shape. There is no text mode.

```ts
type Envelope<TData> = {
  response?: string;   // human-facing text
  data: TData;         // schema-typed payload (undefined for pure chat agents)
  reasoning?: string;  // model-authored: WHY it did what it did
};
```

Why one shape:

- **Text AND data in one turn.** A chat agent can answer in prose and
  hand over a Nova screen in the same response. This is the common
  case for complex assistants, not an edge case.
- **One termination rule, one streaming path, one thing to test.** A
  chat agent is an envelope agent with `data: undefined`; a
  classifier is one with `response` omitted.
- **`reasoning`** is the model's own short justification. It is
  distinct from provider reasoning *tokens* (GLM, gpt-oss), which are
  runtime telemetry and surface as `model-delta` events with
  `channel: 'reasoning'` — never in the envelope.
- **`meta` is not a model field.** Usage, timing, resolved strategy,
  attempt counts, provider metadata — all authored by cortex + signal
  and reported on the run result and events. Models do not
  self-report metadata; self-reported metadata is noise.

```ts
type RunResult<TData> =
  | { ok: true; output: Envelope<TData>; meta: RunMeta }
  | { ok: false; error: CortexError; meta: RunMeta };

type RunMeta = {
  usage: Usage;              // aggregated; per-step usage rides on events
  strategy: OutputStrategy;  // what actually ran
  steps: number;
  outputRetries: number;
  elapsedMs: number;
};
```

---

## 3. Output strategies

How the envelope travels from model to runtime. The output is ALWAYS
the JSON envelope; a strategy only picks the TRANSPORT — which channel
carries its bytes. Three transports, one config field, `auto` default:

| Strategy | Transport | Termination | Schema reaches model via |
|---|---|---|---|
| `respond` (default) | tool-call arguments (synthetic `respond` tool) | the `respond` call, OR an emitted envelope on the content channel | tool params (small schemas) or prompt docs (large) |
| `native` | content channel under provider grammar (`response_format: json_schema`) | a content turn with no tool calls | provider grammar |
| `emit` | content channel; the model's completion IS the envelope | a content turn with no tool calls | prompt docs |

Zod validates the envelope in **every** strategy. Providers enforce
at most syntax; cortex enforces the contract.

### 3.1 `respond` — the default

Cortex registers one synthetic tool per run:

- **Params, auto-detailed.** If the serialized `data` schema is
  strict-compatible (no recursion, no open records, no refinements)
  and small (≤ ~8 KB serialized), it is inlined into the tool params.
  Otherwise params are loose (`data: object, see OUTPUT SCHEMA in the
  system prompt`) and the schema documentation is injected into
  context (§3.4). This is what makes Prism's `NodeSchema` and Nova's
  `ActionDefinitionSchema` work: a ~60-way recursive union cannot be
  provider-enforced anywhere — the schema was always going to live in
  the prompt; the strategy only decides the delivery channel of the
  answer.
- **Permissive params on hard-validating providers.** When the
  provider validates tool args server-side and 400s the request on a
  mismatch (Groq's `tool_use_failed`; signal capability
  `validatesToolArgs`), the wire params name the envelope fields but
  constrain nothing (`{ response: {}, data: {}, reasoning: {} }`).
  A server 400 destroys exactly the attempts the client-side decode/
  repair ladder saves (a stringified `data` is repairable); with
  permissive params the attempt arrives and gets repaired or a
  specific correction. The contract rides the respond description +
  the schema doc; validation is always client-side anyway.
- **Emit is a legal exit (respond-or-finish).** A turn with no tool
  calls is first parsed (fence-tolerant) and validated as the
  envelope; a valid one finishes the run exactly like a `respond`
  call. Some models (gpt-oss on Groq) are unreliable tool-call
  finishers but emit clean JSON — both doors lead to the same
  validated envelope. Only a turn with no valid envelope in it is an
  error.
- **The unwrap rung.** Models regularly produce the PAYLOAD instead
  of the envelope around it — especially when the payload has its
  own `data`-named field (a Nova action) colliding with the
  envelope's. When the output is not a plausible envelope but
  validates cleanly against the data schema, it is accepted as
  `{ data: <raw> }`. Envelope-first precedence; safe only because
  real data schemas are strict and discriminating — a correct
  answer is never failed for missing its coat.
- **Validation feedback in-loop.** Invalid `respond` args produce a
  tool error result carrying the Zod issues; the model retries the
  call. One extra step, transcript intact, tools still warm — never a
  full re-run.
- **`respond` must be called alone.** If it appears alongside other
  tool calls in one turn, it receives an error result and the other
  calls execute normally.
- **Termination without a result** (model stops on prose that is not
  an envelope) is a protocol violation: cortex appends a correction
  offering both exits (call `respond`, or emit ONLY the envelope) and
  continues, bounded by the `outputRetries` stop condition. Per-agent
  hardening: `output.forceTool: true` sets `toolChoice: 'required'`
  so every turn must be a tool call and `respond` is the only exit —
  opt-in, because some models get tool-happy under `required`.
- **Groq-safe.** No `response_format` in any request, so tools and
  structured output never conflict. gpt-oss-120b runs this at full
  speed.

### 3.2 `native`

`auto` picks it only when the provider capability
`toolsWithStructuredOutput` is true (or the agent has no tools) AND
the envelope schema passes the strict-compatibility walk. Small
extractors and classifiers on OpenAI-class providers land here and
get grammar-level enforcement for free.

### 3.3 `emit`

The envelope travels on the content channel: the model's final
completion IS the envelope, as raw JSON — no tool call, no provider
grammar. First-class, not degraded: same envelope, same Zod
validation, same correction retries (appended messages, bounded by
`outputRetries`), same solid streaming via content deltas.
Fence-tolerant parse. It exists because tool-call arguments are a
LOSSIER channel on some models — gpt-oss on Groq stringifies nested
arrays inside function args while emitting the identical JSON cleanly
as content — and because some models compose very large payloads
better as a completion than as function args. `auto` resolves to it
when the provider capability `manglesNestedToolArgs` is true (Groq);
explicit `respond`/`native` choices are still honored.
`output.forceTool` cannot combine with emit — the final turn must be
a content-only message.

### 3.4 Schema documentation

`schemaDoc(schema)` renders a Zod schema as prompt documentation —
single-sourced from the same schema Zod validates against, so docs
and validation cannot drift. When `respond` resolves to loose or
permissive params (or strategy is `emit`), cortex injects
`OUTPUT SCHEMA:\n…` as the
last system chunk automatically. Agents that hand-author a full DSL
guide (the architect pattern) disable it with `output.doc: 'off'` or
replace it with a string.

---

## 4. The loop

```
prefix   = assemble(context fns, input)          — once, at run start
messages = [...prefix]                           — append-only from here on

step:
  stopWhen checks (steps, tokens, duration, outputRetries)
  prepareStep hook → activeTools mask, toolChoice, injected messages, llm swap
  signal.stepStream({ messages, tools, responseFormat? })
    → model-delta events (text + reasoning channels)
    → tool-call-delta events → output-delta / output-partial for respond args
  for each tool call, in order:
    tool gates (allow / deny / ask)               — BEFORE execution
    execute (Zod-validated input, timeout)
    onToolResult hooks (replace / redact / truncate)
    append tool result message; emit tool-end observation
  respond call → validate envelope → end (or error result + continue)
```

Rules the loop lives by:

- **Append-only transcript.** The prefix is built once and never
  re-templated. Rule injections, corrections, and budget nudges are
  *appended* messages. This is the KV-cache lesson: on the models we
  run, cached input is ~10× cheaper than uncached, and v1 paid the
  uncached price on every iteration.
- **Tool calls execute sequentially, in model order.** Deterministic
  gating and event order beat latency here; parallel execution is a
  future knob (§15).
- **Tool failures are observations, not exceptions.** A failed or
  denied call becomes an error result the model sees and reacts to.
  The run only fails on structural conditions (stop limits, model
  call failure, abort, retries exhausted).
- **The model sees `tool.name`; `tool.id` is the policy identity.**
  Descriptors carry the name (prompts say "call `query`"); the loop
  resolves incoming calls by name OR id; gates, observations and
  traces always carry the canonical id. Both namespaces must be
  collision-free per run, and nothing may claim `respond`. (v1 sent
  ids on the wire while documenting names — a prompt-literal model
  exposed the lie.)
- **Streaming is not a mode.** The loop always consumes
  `signal.stepStream`; `await run.result` is the opt-out. There is no
  `stream: true` bifurcation to test twice.

Bounds are `stopWhen` predicates — one vocabulary instead of v1's
maxToolIterations / maxTicks / maxDurationMs / budget tangle:

```ts
stopWhen: [stepCount(20), tokens(100_000), duration('5m'), outputRetries(3)]
```

Defaults: `stepCount(20)`, `outputRetries(3)`. No default duration or
token cap — v1's 60-second default was overridden at every call site,
which is what a wrong default looks like.

---

## 5. Context — producers

The v1 producer insight was right — context comes from PRODUCERS,
and how a producer constructs its content is irrelevant. v1 failed on
machinery (priorities, state, no per-invocation data); the machinery
is deleted, the concept and the name stay:

```ts
// What enters context: one system chunk, several (a producer can emit a
// GROUP — each string its own system message), or raw messages.
type ContextEntry = string | string[] | Message[];

// What makes one. Always a function — the name says so. Annotate shared
// definitions `satisfies Producer` so what a thing is stays obvious at
// the definition site while the value keeps its narrow callable type.
type Producer<TDeps = undefined> =
  (ctx: ProducerArgs<TDeps>) => ContextEntry | Promise<ContextEntry>;

type ProducerArgs<TDeps> = { deps: TDeps; input: RunInput; agent: AgentInfo };

// defineAgent
context?: ReadonlyArray<ContextEntry | Producer<TDeps>>;
```

**The principle: context is owned by whoever owns the knowledge, and
composed by spreading.** An agent owns its identity (`instructions`).
A LIBRARY owns its contract and exports it as a producer (vex's
`vexGuide()`, prism's schema). An APP owns its ambient facts and
exports its shared set (`[...appProducers(), …]` — the same list
attached to every agent, so "one agent knew today, the other didn't"
cannot happen). A TOOL owns its own usage knowledge (below). Nothing
is ever hand-summarized into a prompt on behalf of another owner —
that is how knowledge drifts.

- Strings and string returns become system messages; `Message[]`
  returns give full control. Order is the array — placement IS the
  array position ("today first" = put it first). No priorities, no
  eviction, no compressors, no token modes, no producer state.
- `instructions` is sugar for the first producer. It exists once.
- **`RunOptions.producers`** appends per-run producers after the
  agent's own — an app attaches shared knowledge to ANY agent without
  editing its definition.
- **Tools bring their own guides.** `defineTool({ guide })` carries
  the tool's usage knowledge (a string or a deferred `() => string`,
  e.g. composing a library's exported guide). The run assembles one
  TOOL GUIDES section from the ACTIVE tools — add a tool and its
  guide arrives, change it and every agent updates, remove it and the
  guide leaves. Instructions never describe tools.
- Prefix order: instructions → agent producers → run producers →
  tool guides → schema doc → finish protocol → input. The finish
  protocol is ONE cortex-owned chunk stating how the run ends under
  the RESOLVED transport (call `respond` / emit the envelope / reply
  under grammar) — agents never author finish lines; they cannot know
  which transport resolution picked.
- Producers run **once, at run start**, to build the prefix. Dynamic
  steering mid-run belongs to `prepareStep` (append a note, mask
  tools, force a tool choice, swap the model) — the 20% case as one
  hook instead of a rules engine.
- `input` is `string | Message[] | unknown` (non-message values are
  JSON-stringified into the user turn). Multi-turn history is
  caller-owned and arrives as `Message[]` — ray's transcript becomes
  the supported path instead of a workaround.
- Compaction (summarize-when-near-limit) is a future single hook on
  the transcript (§15), not a v1 pipeline.

**Preview survives, better.** `agent.preview(input, { deps })`
returns the exact assembled messages, the resolved tool list
(including `respond` and its actual params), the resolved strategy,
and a token estimate — no model call. Anything you can't explain in
the preview, the model can't either.

---

## 6. Gates and hooks

All steering is plain typed functions in arrays, composed in order.
Declarative config is sugar that compiles into the same arrays —
never a parallel engine.

```ts
type ToolGate<TDeps> = (call: ToolCallInfo, ctx: RunCtx<TDeps>) =>
  | { allow: true; args?: unknown }     // optionally rewrite args
  | { deny: string }                    // model sees a tool error
  | { ask: { reason: string } }         // suspend for approval
  | Promise<…>;

type ToolResultHook<TDeps> = (obs: ToolObservation, ctx: RunCtx<TDeps>) =>
  { result?: unknown } | void | Promise<…>;   // replace / redact / truncate

type PrepareStep<TDeps> = (s: StepInfo<TDeps>) =>
  { activeTools?: string[]; toolChoice?: ToolChoice; inject?: Message[]; llm?: SignalClient } | void;

type StopCondition = (s: RunProgress) => boolean;
```

- **Gates run before execution.** A deny reaches the model as a tool
  error; the run continues. (v1 evaluated rules after the observation
  — a rule could never stop the call that tripped it.)
- **Policy sugar** covers the declarative 80%:

  ```ts
  policy: {
    tools: { allow, deny, requireApproval, maxRiskLevel },
    approvalTimeoutMs,   // optional; no timeout by default
  }
  ```

  compiles to one built-in gate. Anything the sugar can't express is
  a function.
- **Approvals suspend the run.** `ask` emits `approval-required`
  with a stable id; the pending call blocks (tools are sequential, so
  one pending approval at a time). `run.approve(id, { args? })` —
  approve, optionally with edited args — or `run.deny(id, reason)`.
  `run.snapshot()` serializes the suspended run (messages, pending
  call, usage); `resumeRun(agent, snapshot, opts)` restores it — so
  approvals survive reloads and restarts.
- **Output validation** closes the generate→verify loop in-run:

  ```ts
  output: {
    schema: ActionAgentOutputSchema,
    validate: async (out) => ok ? { ok: true } : { retry: issues },  // async, can do I/O
  }
  ```

  A failed validator feeds back like a failed Zod parse — correction
  in the same run, tools still warm. (This replaces the architect's
  hand-rolled verify-once harness bolt-on.)

What hooks deliberately can't do: react to *other* runs (cross-run
choreography is app code around `manifold.onRun`), mutate past
transcript (append-only is load-bearing), veto text mid-generation
(validation happens at boundaries: tool call, step end, output). If
remotely-configured steering is ever needed, it lands as a compiler
from a config shape *to* a gate function — on top, not underneath.

---

## 7. Events and observability

Every run exposes one ordered, typed stream. No global bus.

```ts
const run = agent.run(input, { deps });
for await (const e of run.events) { … }
const result = await run.result;
```

| Event | Payload | Notes |
|---|---|---|
| `run-start` | `{ input }` | |
| `step-start` | `{ step }` | |
| `model-delta` | `{ text, channel: 'text' \| 'reasoning' }` | provider reasoning tokens land here |
| `tool-start` | `{ call }` | before gates + execution — drives live UIs |
| `tool-end` | `{ observation }` | typed union incl. denials; no casting |
| `approval-required` | `{ id, toolId, args, reason }` | run suspends |
| `output-delta` | `{ text }` | raw envelope JSON fragments |
| `output-partial` | `{ output }` | solid-parsed partial envelope |
| `retry` | `{ kind: 'output' \| 'termination' \| 'provider', attempt, issues }` | consumers reset partial state; `issues` carries the evidence (Zod issues, the rejected attempt, or the stray text) |
| `run-end` | `{ result, meta }` | |

Every event carries `{ runId, agentPath, seq, ts }`. When an agent
runs inside another (`asTool`), the child's events forward into the
parent stream with the extended `agentPath` — one subscription sees
the whole tree. Per-step usage rides on step events and aggregates
into `RunMeta.usage`; that is the whole ledger.

Process-level watching is the manifold's tap: `onRun(run => …)` hands
you every run created through it. That is the one legitimate job the
v1 bus had, kept, without the bus. (Precedent: AutoGen v0.4 built the
bus-first agent substrate; Microsoft retired it within a year for
plain awaited runs with typed-edge composition.)

---

## 8. The manifold

A catalog, defaults, and the tap. Not a lifecycle, not a substrate,
not an execution path.

```ts
const manifold = createManifold({
  llm: groq120b,                    // default model
  gates: [uiApprovalGate],          // shared gates
  onRun: (run) => trace.attach(run),
});

manifold.register(vexQueryAgent, novaLayoutAgent, queryTool);

const run = manifold.run('action.builder', { intent }, { deps: env });
const asToolDef = manifold.asTool('vex.query', { description });
```

- `agent.run()` standalone and `manifold.run()` are the same
  function; the manifold merges defaults. There is no
  `runAgentStandalone`.
- Agents may bind their own `llm`; the manifold's is the fallback.
  (The architect's GLM-reasoning / Groq-support split becomes
  configuration.)
- `asTool(agent, { description?, select? })` wraps an agent as an
  ordinary `ToolDefinition`. Default result mapping: envelope `data`
  if present, else `response`; `select` overrides. Child events
  forward (§7).
- Duplicate ids throw at registration. Registration is a Map insert;
  there is no `start`/`stop`/`drain`.

---

## 9. Errors

Same two principles as v1, smaller taxonomy:

1. **Programmer errors throw** at definition/registration time:
   duplicate ids, malformed configs.
2. **Runtime conditions return** as `Result` (§2). Tool failures are
   observations (§4), not run failures.

```ts
type CortexError = {
  code: 'model_call_failed' | 'output_invalid' | 'stopped' | 'aborted' | 'unknown';
  stop?: 'steps' | 'tokens' | 'duration' | 'output_retries' | 'custom';   // when code === 'stopped'
  message: string;
  runId: string;
  agentPath: ReadonlyArray<string>;
  cause?: unknown;
};
```

An approval timeout is NOT an error code: it denies the pending call
(an observation the model reacts to) and the run continues — same
principle as every other tool denial.

---

## 10. Streaming

Always on (§4). Solid is a peer dependency and powers
`output-partial`: `respond` arg deltas (or content deltas under
`native`/`emit`) stream through solid's partial parser into
progressively-typed envelopes — a chat `response` string streams
token-ish while it forms inside the JSON, and a Nova screen in `data`
becomes renderable before the run ends. The `retry` event resets
partial-output state, same contract as v1's `cortex.agent.retry`.

---

## 11. Public API surface

```ts
// definition
defineAgent<TData, TDeps>(config): AgentDefinition<TData, TDeps>
defineTool(config): ToolDefinition                     // v1 shape, kept
schemaDoc(schema, opts?): string

// execution
agent.run(input, { deps, llm?, tools?, gates?, onToolResult?, onEvent?, signal? }): RunHandle<TData>
//   tools: per-run tools whose execute closes over per-invocation
//   dependencies (vex builds its query tools around the caller's
//   adapter + schema); appended to the agent's static tools.
agent.preview(input, { deps }): ResolvedPreview
resumeRun(agent, snapshot, opts): RunHandle<TData>

// RunHandle
run.events: AsyncIterable<CortexEvent>
run.result: Promise<RunResult<TData>>
run.approve(id, { args? }) / run.deny(id, reason?)
run.snapshot(): RunSnapshot
run.abort(reason?)

// composition
createManifold({ llm, gates?, onRun? }): Manifold
manifold.register / run / asTool / preview

// stop conditions
stepCount(n), tokens(n), duration(ms | '5m'), outputRetries(n)
```

`defineAgent` config:

```ts
{
  id, description,
  llm?,                       // per-agent binding; manifold/run option is fallback
  instructions,               // string | (ctx) => string — sugar for the first producer
  context?: Producer<TDeps>[],   // compose shared sets by spreading: [...appProducers(), …]
  tools?: ToolDefinition[],   // definitions, not id strings; each may carry its own `guide`
  output?: {
    schema?: ZodType<TData>,          // omitted → pure chat agent (data: undefined)
    response?: 'required' | 'optional',  // default: required without schema, optional with
    strategy?: 'auto' | 'respond' | 'native' | 'emit',   // default 'auto'
    forceTool?: boolean,              // toolChoice:'required' hardening
    doc?: 'auto' | 'off' | string,    // schema docs injection, default 'auto'
    validate?: (out) => { ok: true } | { retry: string } | Promise<…>,
  },
  toolGates?, onToolResult?, prepareStep?, stopWhen?, policy?,
}
```

---

## 12. Signal changes this design requires

1. **`stepStream` emits `tool-call-delta`** — `{ index, id?, name?,
   argsText }` fragments as function args stream. The SSE chunks
   already contain them; the adapter currently drops them. This is
   the enabler for `respond`-strategy streaming and solid, and is
   built first.
2. **`StepRequest.responseFormat`** passthrough (json_schema /
   json_object) for the `native` strategy.
3. **Capabilities truth.** Groq `nativeTools: true` (stale since the
   registry was written; ray proves it daily). New capability:
   `toolsWithStructuredOutput: boolean` — encodes the
   can't-combine-format-and-tools constraint that shaped §3.
4. Later, not blocking: signal's own `complete()` tool loop can slim
   once cortex is the loop owner; real tokenizer behind `count()`.

---

## 13. What v2 deletes from v1

| Deleted | Why |
|---|---|
| Event bus, topics, wildcard matching, typed-topic | substrate carried no load; per-run event streams + `onRun` cover the real uses |
| Rules engine (watch/when/then, accumulators, effects) | underpowered (counter thresholds), broken (global un-reset state, dead `call`, `deny`-all-forever, duplicating `inject`), post-hoc by construction; gates + `prepareStep` replace it |
| Plan mode: ActionPlan schema, plan executor, node handlers, tick loop | ~830 lines duplicating what the tool loop does, fed by fragile text parse; delegation is `asTool`; revisit as a todo/recitation tool if ever needed (§15) |
| Producer pipeline: priorities, eviction, compressors, token modes, producer state, stores | fought its consumers (no deps param), features unreachable or fake (`exact` mode ≡ fuzzy, per-producer compress unreachable, stateful producers had no read path) |
| Manifold lifecycle (`start`/`stop`/`drain`), ledger object, state store, event log | decorative or folded into run meta/events |
| `runAgentStandalone` | `agent.run()` is the standalone path |
| Full-loop validation retries | in-loop corrections (§3.1) |

---

## 14. Plan mode, revisited later — the record

v1 bet on model-emitted ActionPlans executed by a runtime. The field
data: BabyAGI (the pattern's origin) is archived; AutoGPT pivoted
away; every mainstream SDK (OpenAI Agents, Vercel, Pydantic AI,
Mastra) ships a native tool loop with code-first composition; the
survivors of "planning" are recitation todo-lists the model itself
maintains in-loop (Manus todo.md, Claude Code TodoWrite). If explicit
planning returns to cortex it returns as that: a small todo tool plus
a context entry, on top of the loop — not an interpreter under it.

---

## 15. Future work (known, deferred)

- **Compaction** — one hook: summarize the transcript when a token
  threshold nears, keep the prefix stable. Field-standard; not needed
  for current workloads.
- **Parallel tool execution** — opt-in per agent once gate/event
  ordering under concurrency is specified.
- **Durable run store** — `snapshot()` already serializes; a store
  interface + replay is additive.
- **Declarative gate config** — a compiler from config to gate
  functions, if remote-configured steering is ever needed.
- **Exact token counting** — behind `signal.count()` when a real
  tokenizer lands.
- **`respond` vs `emit` A/B** on the big-DSL agents (prism mapping,
  nova layout, architect) — they start on `respond`; flip per-agent
  only if measured quality says so.

---

## 16. Source layout

```
src/
├── index.ts                      # public API
├── types.ts                      # shared core types
│
├── schemas/
│   ├── envelope.schema.ts        # Envelope<TData> factory
│   ├── agent-config.schema.ts
│   └── tool-config.schema.ts
│
├── agent/
│   ├── define-agent.ts
│   ├── run.ts                    # RunHandle, resumeRun
│   └── preview.ts
│
├── loop/
│   ├── loop.ts                   # the loop (§4) — all three transports
│   ├── strategy-resolve.ts       # auto resolution + strict-compat walk
│   ├── respond-tool.ts           # synthetic respond descriptor + corrections
│   └── partials.ts               # solid partial-output tracking
│
├── context/
│   ├── assemble.ts
│   └── schema-doc.ts
│
├── gates/
│   ├── types.ts
│   ├── policy.ts                 # sugar → built-in gate
│   └── approval.ts               # suspend / approve / deny / snapshot
│
├── events/
│   ├── types.ts                  # CortexEvent vocabulary
│   └── stream.ts                 # per-run emitter + forwarding
│
├── manifold/
│   ├── manifold.ts
│   └── as-tool.ts
│
├── tool/define-tool.ts
├── errors/cortex.errors.ts
└── utils/
```
