# @niscorp/cortex

Agent runtime. One tool loop, typed envelopes, code-hook gates,
streamed events. Two peer dependencies — the app owns the one copy of
each, because both cross the API: [`@niscorp/signal`](../signal) (you
hand cortex the client) and `zod` (you hand it the schemas).
[`@niscorp/solid`](../solid) is an ordinary dependency.

```bash
pnpm add @niscorp/cortex @niscorp/signal zod
# Signal loads the provider's SDK when a model is called. For Groq, OpenAI,
# OpenRouter or any OpenAI-compatible API (the quick example runs on Groq):
pnpm add openai
```

For the *why* behind the architecture — the envelope, output
strategies, the append-only loop, gates over rules — see
[DESIGN.md](./DESIGN.md).

---

## Quick example

```ts
import { z } from 'zod';
import { createSignal } from '@niscorp/signal';
import { defineAgent, defineTool } from '@niscorp/cortex';

const calculator = defineTool({
  id: 'calculator',
  name: 'calculator',
  description: 'Evaluates a simple arithmetic expression.',
  input: z.object({ expression: z.string() }),
  execute: ({ expression }) => new Function(`return (${expression})`)(),
});

const calcAgent = defineAgent({
  id: 'calc',
  description: 'Arithmetic with a tool.',
  instructions: 'Use the calculator tool, then give the answer.',
  tools: [calculator],
  output: { schema: z.object({ answer: z.number() }) },
});

const llm = createSignal('groq'); // qwen/qwen3.8-27b — the registry default

const result = await calcAgent.run('What is (2 + 3) * 7 - 6?', { llm }).result;
if (result.ok) console.log(result.output.data.answer); // 29
else console.error(result.error.message); // a run that fails returns its reason; it does not throw
```

---

## The envelope

Every agent returns the same shape — there is no separate text mode:

```ts
type Envelope<TData> = {
  response?: string;   // human-facing text
  data: TData;         // schema-typed payload (undefined for pure chat agents)
  reasoning?: string;  // the model's short WHY
};
```

A chat agent omits `output.schema` (its `response` becomes required);
a data agent sets it; a rich assistant returns both — prose *and* a
payload in one turn. Run-level metadata (usage, resolved strategy,
attempts, elapsed) is authored by cortex on `result.meta`, never by
the model.

```ts
const result = await agent.run(input, { llm, deps }).result;
// { ok: true,  output: Envelope<T>, meta: RunMeta }
// { ok: false, error: CortexError,  meta: RunMeta }
```

---

## Output strategies

How the envelope travels from model to runtime. One field,
`output.strategy`, default `'auto'`:

| Strategy | Mechanism | Fits |
|---|---|---|
| `native` | provider `response_format: json_schema`, in-loop | small strict-compatible schemas on capable providers (auto-picked) |
| `respond` | a synthesized `respond` tool; the envelope is its arguments | where the tool params can ENFORCE the contract — the endpoint does not validate tool args itself, the schema is small, the model carries nested args intact (auto-picked there) |
| `emit` | the model's completion IS the envelope (content channel) | everything else — auto-picked wherever neither of the above enforces anything: all of Groq, big schemas, models that mangle nested tool args |

Zod validates in **every** strategy. Invalid output feeds back as a
correction *inside the same run* (the attempt and a system message
naming the issues are appended) — never a full re-run. Big recursive
schemas (Prism nodes, Nova actions) ride `emit`; cortex injects
the JSON Schema into the prompt automatically (`output.doc: 'auto'`,
via `schemaDoc()` — single-sourced from the Zod schema).

Async output validation closes generate→verify loops in-run:

```ts
output: {
  schema: ActionDefinitionSchema,
  validate: async (out) => (await mounts(out.data)) ? { ok: true } : { retry: 'why' },
}
```

---

## defineAgent

```ts
const agent = defineAgent<Data, Deps>({
  id: 'action.builder',
  description: 'One sentence.',
  llm,                                   // per-agent model binding (optional)
  instructions: ({ deps }) => `…`,       // string, or function of typed deps
  context: [                             // functions that build the prefix, ONCE per run
    'A static system chunk.',
    ({ deps }) => renderCatalog(deps.palette),
  ],
  tools: [queryTool],                    // definitions, not id strings
  output: { schema: DataSchema, validate, strategy: 'auto', forceTool: false, doc: 'auto' },
  stopWhen: [stepCount(16), tokens(100_000), duration('6m'), outputRetries(3)],
  policy: { tools: { requireApproval: ['transfer'], maxRiskLevel: 'medium' } },
  toolGates: [myGate],                   // code hooks, run BEFORE each call
  onToolResult: [redactor],              // replace/redact results
  prepareStep: ({ step, usage }) => ({ activeTools, toolChoice, inject, llm }),
});
```

Deps are per-invocation, typed, and consumed by context entries,
gates and hooks — agents are defined once, never rebuilt per call.
Defaults when `stopWhen` is omitted: `stepCount(20)`,
`outputRetries(3)`. A `stopWhen` you pass replaces both, so keep a
`stepCount` in it: `outputRetries` counts refused answers only, and
a turn of prose with no envelope in it is corrected without being
counted. `outputRetries(n)` ends the run at the n-th refused answer:
n attempts, n − 1 corrections, so `outputRetries(1)` allows no
second attempt.

`policy.tools` lists take tool **ids** (`tool.id`), not the names
the model calls: a name in `deny` or `requireApproval` matches
nothing and says nothing, and a name in `allow` leaves the tool off
the list.

Multi-turn history is caller-owned: `input` accepts a `string`, a
`Message[]` transcript, or any JSON value.

Per-run additions ride the options:

```ts
agent.run(input, {
  llm, deps,
  tools: [perRequestTool],   // appended to the agent's static tools
  gates: [uiApprovalGate],
  onToolResult: [traceHook],
  onEvent: (e) => …,
  signal: abortController.signal,
});
```

---

## Events — the run is the stream

```ts
const run = agent.run(input, { llm, deps });
for await (const e of run.events) {
  // run-start · step-start · model-delta · tool-start · tool-end
  // approval-required · output-delta · output-partial · retry · run-end
}
const result = await run.result;   // the no-streaming opt-out
```

- `tool-start` fires **before** execution — drives live "running…" UIs.
- `tool-end` carries a typed `ToolObservation` union (result / error /
  denied / unknown-tool). No casting. Through Signal, `unknown-tool`
  is rare: Signal routes only calls to tools the step declared, and
  reads a call to any other name as an attempted answer. It is
  validated as the envelope (a `retry`, or the run's output if it
  passes), or dropped when it comes beside a call to a declared tool,
  and never reaches `tool-start`. The kind arises when `resumeRun` is
  not handed the per-run tool the pending call names, or with a
  client that does its own routing.
- `output-delta` streams the raw envelope JSON as it generates;
  `output-partial` streams the progressively parsed envelope via
  [`@niscorp/solid`](../solid) — a chat `response` streams token-ish,
  a Nova screen in `data` becomes renderable before the run ends.
  Both stream before cortex knows how the step ends: words written
  beside a tool call (under `emit` and `native`) and a `respond` sent
  beside other calls arrive as `output-delta` too and are not the
  answer. The answer is what the last step streamed.
- `retry` resets partial-output state (same contract consumers had
  in v1).
- Nested runs (`asTool`) forward their events into the parent stream
  with an extended `agentPath` — one subscription sees the tree.

---

## Gates and approvals

All steering is plain typed functions; `policy` is sugar that
compiles into one gate. Gates run **before** the call; a deny becomes
a tool error the model reacts to; the run continues.

```ts
type GateDecision =
  | { allow: true; args?: unknown }   // optionally rewrite args
  | { deny: string }
  | { ask: { reason: string } };      // suspend for a human
```

`ask` emits `approval-required` and suspends the run:

```ts
run.onEvent((e) => {
  if (e.type === 'approval-required') {
    void showDialog(e.approval).then((ok) =>
      ok ? run.approve(e.approval.id, { args: maybeEdited }) : run.deny(e.approval.id, 'user said no'),
    );
  }
});
```

Suspended runs serialize: `run.snapshot()` → JSON →
`resumeRun(agent, snapshot, { llm, deps })` re-asks the pending
approval and continues — approvals survive reloads and restarts.
`policy.approvalTimeoutMs` turns an unanswered ask into a denial
(an observation, not a run failure).

---

## The manifold

A catalog, defaults, and a tap — `agent.run()` and `manifold.run()`
are the same execution path.

```ts
const manifold = createManifold({
  llm: groqQwen,                  // fallback model
  gates: [uiApprovalGate],        // appended to every run
  onRun: (run) => trace.attach(run),
});

manifold.register(vexQueryAgent, novaLayoutAgent, queryTool);
const run = manifold.run<Query>('vex.query', input, { deps });
```

Delegation is a tool call:

```ts
import { asTool } from '@niscorp/cortex';

const orchestrator = defineAgent({
  id: 'orchestrator',
  instructions: 'Delegate, then respond.',
  tools: [asTool(vexQueryAgent, { deps, llm: groqQwen })],
});
// or from the catalog: manifold.asTool('vex.query')
```

The child's envelope maps to the tool result (`data` if present, else
`response`; override with `select`), and its events nest in the
parent stream.

---

## preview

The exact messages and tools a run would send — no model call:

```ts
const p = await agent.preview(input, { deps, llm });
p.strategy;          // 'respond' | 'native' | 'emit' — what would actually run
p.messages;          // the assembled prefix, including injected schema docs
p.tools;             // real descriptors, including the respond tool's params
p.estimatedTokens;
```

Anything you can't explain in the preview, the model can't either.

---

## Errors

Programmer errors throw at definition/registration time. Runtime
conditions return:

```ts
type CortexError = {
  code: 'model_call_failed' | 'output_invalid' | 'stopped' | 'aborted' | 'unknown';
  stop?: 'steps' | 'tokens' | 'duration' | 'output_retries' | 'repeated_calls' | 'custom';
  message: string;
  runId: string;
  agentPath: ReadonlyArray<string>;
};
```

Tool failures are **observations**, not exceptions — the model sees
them and decides; the run fails only on structural conditions.

A tool's `input` schema validates; it does not convert. It does two
jobs: the model is sent its JSON Schema, taken from the schema's
output side, and a call's arguments are parsed with it twice — by the
loop, then again in front of `execute`. Converting belongs inside
`execute`, and this is what it costs in the schema:

- A schema with no JSON Schema (a `.transform()`, a `z.date()`) fails
  the run before the model is asked: `code: 'unknown'`, with Zod's
  message (`Transforms cannot be represented in JSON Schema`).
- A schema whose output is another kind than its input
  (`z.stringbool()`) is described to the model by its output and then
  refuses what its own first parse produced: every call ends in an
  `error` observation and `execute` never runs.
- A schema that changes a value (`.overwrite()`) changes it twice.
  That is harmless where a second pass changes nothing (`.trim()`),
  and wrong where it does; the observation's `args` hold the value
  as parsed once.

---

## Building

```bash
pnpm build        # tsup ESM + CJS + DTS
pnpm test         # vitest run — scripted SignalClient stub, no network
pnpm typecheck    # tsc on src + test
```

---

## License

Apache-2.0
