# Signal Documentation

Complete reference for `@niscorp/signal`.

---

## Concepts

### Stateless Immutable Builder

Signal uses an immutable builder pattern. Every configuration method returns a **new instance** — the original is never modified. Nothing is sent until an execution method (`complete()`, `stream()`, `step()`, `stepStream()`, `embed()`, `decide()`) is called.

```typescript
const base = createSignal('groq').systemPrompt('You are helpful.');

// Fork for structured output — base is untouched
const structured = base.schema(z.object({ name: z.string() }));

// Fork for tools — base still untouched
const withTools = base.tools([myTool]);

// Call complete on any instance, any number of times
const r1 = await base.complete('hello');
const r2 = await structured.complete('Extract: Alice');
```

### Provider Abstraction

Signal doesn't care which LLM provider you use. Under the hood, it translates your request to the provider's API format, handles quirks (Groq can't do tools + structured output together), and normalizes the response.

### Capabilities

Each provider has a capability profile that Signal uses to pick the right strategy:

- **`nativeTools`** — Can the provider do tool calling natively?
- **`nativeJsonSchema`** — Can it enforce a JSON Schema on the response?
- **`nativeJsonMode`** — Can it guarantee JSON output?
- **`toolsWithStructuredOutput`** — Is `response_format` accepted together with `tools` in one request?
- **`validatesToolArgs`** — Does the endpoint validate tool-call arguments server-side and reject the request on a mismatch?
- **`manglesNestedToolArgs`** — Does the model corrupt nested tool-call arguments?
- **`multimodal`** — Does it accept image content?
- **`supportsEmbedding`** — Can it convert text to vectors?

You don't need to think about this unless you're overriding defaults.

---

## Creating a Signal

### Known Provider

```typescript
const signal = createSignal('groq');
```

Reads `GROQ_API_KEY` from environment automatically. Known providers: `'groq'`, `'openai'`, `'openrouter'`, `'anthropic'`, `'google'`, `'typesafe'`.

| Provider | Env var | Default model |
|----------|---------|---------------|
| `'groq'` | `GROQ_API_KEY` | `qwen/qwen3.8-27b` |
| `'openai'` | `OPENAI_API_KEY` | `gpt-4o` |
| `'openrouter'` | `OPENROUTER_API_KEY` | `openai/gpt-4o` |
| `'anthropic'` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-20250514` |
| `'google'` | `GOOGLE_API_KEY` | `gemini-2.0-flash` |
| `'typesafe'` | `TYPESAFE_API_KEY` | `jev-latest` |

`'anthropic'` and `'google'` are registry rows whose adapters are not implemented yet: the client builds and `describe()` answers, but every execution method throws `E_PROVIDER_ERROR` (`E_MISSING_API_KEY` first when no key is set; `count()`, which never reaches the adapter, still works). Reach those models through `'openrouter'`.

### Known Provider with Options

```typescript
const signal = createSignal('groq', {
  apiKey: 'gsk_...',
  model: 'qwen/qwen3.8-27b',
  systemPrompt: 'You are a data extractor.',
  retries: 3,
});
```

### Custom Provider

```typescript
const signal = createSignal({
  baseUrl: 'https://my-endpoint.com/v1',
  apiKey: 'sk-...',
  model: 'my-model',
});
```

Any OpenAI-compatible API works. A custom provider is outside the registry, so it states what it does itself — `capabilities` (a `Partial<Capabilities>`; unstated fields are `false`) and, optionally, `wire` strategy ids. `adapter` defaults to `'openai-compatible'`.

---

## Builder Methods

Every method returns a new `Signal` instance.

### `.model(name)`
Override the model for this instance.
```typescript
signal.model('qwen/qwen3.8-27b')
```

### `.systemPrompt(prompt)`
Set the system prompt.
```typescript
signal.systemPrompt('You extract structured data from text.')
```

### `.schema(zodSchema)`
Set the output schema. The response will be typed, validated, and retried on failure.
```typescript
signal.schema(z.object({
  name: z.string(),
  age: z.number(),
}))
```

### `.tools(tools)`
Set tools for tool calling. See [Tools](#tools) below.
```typescript
signal.tools([searchTool, calculatorTool])
```

### `.history(messages)`
Set conversation history for multi-turn.
```typescript
signal.history(previousMessages)
```

### `.retries(count)`
Set max validation retries (default: 2). When a response fails Zod validation, Signal feeds the error back to the model and tries again; once the retries are spent the call fails with `E_VALIDATION_FAILED`.
```typescript
signal.retries(3)
```

### `.apiKey(key)`
Override the API key.
```typescript
signal.apiKey('gsk_...')
```

### `.options(opts)`
Set LLM options: `temperature`, `maxTokens`, `topP`, `stopSequences`, `seed`, `signal` (an `AbortSignal`), `reasoningEffort`. Merged over any options already set. These are rarely needed.
```typescript
signal.options({ temperature: 0 })
```

### Capabilities — looked up, not configured
What a client can do is the provider's registry row (what the ENDPOINT
does) joined with the model's registry row (what the MODEL does, as
measured by `scripts/probe-model.ts`). There is no override: a fact about
a model is a row in `src/registry.ts`. A model with no row resolves to the
conservative `UNMEASURED_MODEL`, and `describe().modelKnown` says so.
A custom provider (by `baseUrl`) declares its own `capabilities`.
```typescript
createSignal('groq').describe()
// { provider: 'groq', model: 'qwen/qwen3.8-27b', kind: 'chat', modelKnown: true, capabilities: {…} }
```
A `reasoningEffort` the model's row does not list is refused when the
client is built (`SignalError`, `E_VALIDATION_FAILED`), not by a provider 400
mid-run. An unmeasured model is not checked.

### `.onRetry(handler)`
Hook called on each validation failure, including the last one that exhausts the retries.
```typescript
signal.onRetry((error, attempt) => console.log(`Retry ${attempt}:`, error.message))
```

### `.onToolCall(handler)`
Hook called when a tool is executed.
```typescript
signal.onToolCall((name, args) => console.log(`Calling ${name}`, args))
```

---

## Execution

### `.complete(input)`

Execute the request. Returns `{ response, history, meta }`.

```typescript
const { response, history, meta } = await signal.complete('What is 2+2?');
```

`input` can be a string or multimodal content parts:

```typescript
await signal.complete([
  { type: 'text', text: 'What is in this image?' },
  { type: 'image', source: { type: 'url', url: 'https://...' } },
]);
```

### `.stream(input, options?)`

The same run as `complete()`, delivered as it happens. Returns `AsyncIterable<StreamEvent<T>>`; `options.signal` (an `AbortSignal`) aborts it.

```typescript
for await (const event of signal.stream('Tell me a story')) {
  if (event.type === 'text') process.stdout.write(event.text);
  if (event.type === 'done') console.log(event.meta.usage);
}
```

```typescript
type StreamEvent<T> =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; name: string; args: unknown }
  | { type: 'tool_end'; name: string; result: unknown }
  | { type: 'retry'; reason: string; attempt: number }
  | { type: 'error'; error: Error; recovered: boolean }
  | { type: 'done'; response: T; history: Message[]; meta: SignalMeta };
```

Schema validation happens at the end of the stream; when the retries are spent the stream ends with an `error` event (which `complete()` throws).

### `.step(request)` / `.stepStream(request, options?)`

The low-level primitives `complete()` and `stream()` are built on: one model call, no tool execution, no schema retries. The caller owns the loop. `step()` takes a `StepRequest` (`messages`, `tools`, `toolChoice`, `output`, `responseFormat`, `options`) and returns a `StepResult` (`content`, `toolCalls`, `usage`, `finishReason`, `raw`, and — when the request carried `output.accept` — the routed `outcome` and `wire` report). `stepStream()` yields `text`, `reasoning` and `tool_call_delta` events and a final `done` carrying the `StepResult`.

### `.count(input)`

Rough token count for a string or a message list. A heuristic (about 4 characters per token), not a tokenizer.
```typescript
const tokens = await signal.count('How long is this?');
```

---

## Response

```typescript
type SignalResult<T> = {
  response: T;         // string if no schema, typed if schema set
  history: Message[];  // full conversation including tool calls
  meta: SignalMeta;    // usage, timing, tool calls, provider details
};
```

### Meta

```typescript
type SignalMeta = {
  model: string;                    // actual model used
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  durationMs: number;               // wall clock time
  retries: number;                  // validation retries that occurred
  toolCalls: ToolCallRecord[];      // tools called, args, results, timing
  provider: {
    raw: unknown;                   // raw API response for debugging (an array when the run took several calls)
    errors: ProviderError[];        // currently always empty
  };
};
```

---

## Structured Output

Pass a Zod schema via `.schema()`. The response is parsed, validated, and typed.

```typescript
const { response } = await createSignal('groq')
  .schema(z.object({
    name: z.string(),
    age: z.number(),
    city: z.string(),
  }))
  .complete('Extract: Alice is 30 years old and lives in Berlin.');

// response.name === 'Alice'
// response.age === 30
// response.city === 'Berlin'
```

### How It Works

1. Zod schema is converted to JSON Schema (draft-07)
2. Based on capabilities:
   - `nativeJsonSchema` (and, when tools are set, `toolsWithStructuredOutput`) → sends JSON Schema as `response_format`
   - otherwise `nativeJsonMode` and no tools → sends `response_format: json_object` + schema in a system message
   - otherwise → schema in a system message only
3. The response is normalized by the wire layer (JSON extraction and repairs, each counted only if the result passes the schema)
4. Validated with `schema.safeParse()`
5. On failure: the evidence is sent back to the model as a correction message
6. Retries up to `retries` times (default: 2), then fails with `E_VALIDATION_FAILED`
7. Returns typed, validated result

---

## Tools

### Defining Tools

```typescript
import { defineTool } from '@niscorp/signal';
import { z } from 'zod';

const searchTool = defineTool({
  name: 'search',
  description: 'Search for information',
  input: z.object({
    query: z.string().describe('Search query'),
  }),
  execute: async ({ query }) => {
    const results = await mySearchApi(query);
    return results;
  },
});
```

The Zod `input` schema validates the model's arguments before `execute` runs. The return value is stringified and sent back to the model. A call to an unknown tool, arguments that fail the schema, and an `execute` that throws do not fail the run: each goes back to the model as an `error: …` tool result (and is recorded in `meta.toolCalls`).

### Using Tools

```typescript
const { response, meta } = await createSignal('groq')
  .tools([searchTool])
  .schema(z.object({ answer: z.string() }))
  .complete('Find the current weather in Berlin');

// meta.toolCalls shows what was called
// response.answer contains the final answer
```

### How Tool Calling Works

Tools use the provider's native `tools` parameter and `tool_calls` response; the model decides when to call them. A provider without `nativeTools` cannot take tools — the call throws `E_PROVIDER_ERROR`. Signal handles the loop:

1. Model responds with tool calls
2. Signal validates args with Zod, executes the tool
3. Tool result is sent back to the model
4. Model responds with the final answer
5. With a schema set, the final answer is validated against it

Where the model cannot combine `response_format` with tools (`toolsWithStructuredOutput: false`, e.g. Groq), the schema rides a system message instead and is validated client-side. A run that is still calling tools after 10 tool turns (plus the retry budget) fails with `E_MAX_ITERATIONS`.

---

## Multi-Turn Conversations

Signal is stateless — it doesn't track conversation history. The caller owns history and threads it back:

```typescript
const signal = createSignal('groq');

const r1 = await signal.complete('My name is Alice.');
const r2 = await signal.history(r1.history).complete('What is my name?');
// r2.response contains "Alice"
```

`complete()` returns `history` which includes all messages (system, user, assistant, tool calls). Pass it back via `.history()` for the next turn.

---

## Embedding

Convert text to dense vectors for similarity search, RAG, clustering, and classification.

### Basic Usage

```typescript
const embedder = createSignal('openai').model('text-embedding-3-small');

// Single text → single vector
const vector = await embedder.embed('wireless headphones');
// vector: number[] (1536 dimensions by default)

// Batch — single API call
const vectors = await embedder.embed([
  'wireless headphones',
  'bluetooth earbuds',
  'industrial pump manual',
]);
// vectors: number[][] (3 vectors)
```

### Dimensions

Some models support output truncation. Smaller vectors are faster to store and compare.

```typescript
const small = await embedder.embed('text', { dimensions: 256 });
// small: number[256]
```

### Usage

`embed()` returns vectors only. To read what the call cost, pass `onUsage` — called after a successful call with the provider's usage and the model that resolved:

```typescript
await embedder.embed('text', { onUsage: (usage, model) => meter(model, usage.totalTokens) });
```

### Similarity

Cosine similarity between embedding vectors measures semantic relatedness:

```typescript
const cosine = (a: number[], b: number[]) => {
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const mag = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return dot / (mag(a) * mag(b));
};

const [a, b] = await embedder.embed([
  'comfortable running shoes',
  'athletic footwear for jogging',
]);
const similarity = cosine(a, b);
// ~0.92 — semantically similar
```

### Provider Support

Only providers with `supportsEmbedding: true` can embed. Currently: **OpenAI** (`text-embedding-3-small`, `text-embedding-3-large`). Calling `embed()` on a provider without support throws `E_PROVIDER_ERROR`.

Use a separate Signal client for embedding — embedding models are different from chat models:

```typescript
const chat = createSignal('openrouter', { model: 'qwen/qwen3.8-27b' });
const embed = createSignal('openai', { model: 'text-embedding-3-small' });
```

---

## Decisions

A decision model takes a state and typed questions and answers each with a pick and a probability distribution. It generates no text, so `decide()` is a sibling of `embed()`: one request, one response — no messages, no history, no tools.

### Basic Usage

```typescript
const jev = createSignal('typesafe');

const result = await jev.decide({
  state: { message: 'I was charged twice for order 7429', verified: true },
  questions: {
    intent: {
      type: 'choice',
      instructions: 'What is the customer asking for?',
      criteria: { refund: 'Money back', bug: 'A defect report', other: 'Anything else' },
    },
    needsHuman: { type: 'noul', instructions: 'Does this need a person?' },
    urgency: { type: 'score', instructions: 'How urgent is it?', criteria: ['Low', 'Medium', 'High'] },
  },
});

result.decisions.intent.choice;      // 'refund' | 'bug' | 'other'
result.decisions.needsHuman.answer;  // boolean
result.decisions.urgency.level;      // 0 | 1 | 2 — index into criteria
```

### The Questions Are the Schema

You declare the questions once and never write an output type. Signal derives both halves from them:

- **The result type.** `choice` → the union of the `criteria` keys; `score` → a level index into `criteria`; `noul` → a boolean.
- **The acceptance gate.** The same derivation at runtime: a choice outside the asked options, a question left unanswered, a distribution over other keys, a probability outside [0, 1] — each fails the call with `E_VALIDATION_FAILED` and the provider's body under `context.raw`.

There is no repair and no correction retry. A decision model writes no bytes to repair and cannot be told what it got wrong.

### Calibrated or Not

`result.calibrated` is the discriminant. Probabilities exist in the type only where a model produced them:

```typescript
if (result.calibrated) {
  result.decisions.intent.probabilities;  // Record<'refund' | 'bug' | 'other', number>
  result.decisions.intent.confidence;     // 0–1
  result.decisions.needsHuman.noul;       // probability of yes
  result.decisions.urgency.score;         // probability-weighted level, e.g. 1.05
  result.decisions.urgency.probabilities; // number[], one per level
}
```

On a chat provider `decide()` still works: the same questions run through structured output (native grammar where it exists, the repair ladder, correction retries) and come back as picks alone with `calibrated: false`. Signal does not invent a `1.0` — it would clear every threshold. Emulation is one to two orders of magnitude slower; a caller on a latency budget checks first:

```typescript
if (signal.describe().kind === 'decisions') { /* sub-second */ }
```

### Abort

```typescript
const controller = new AbortController();
jev.decide({ state, questions, options: { signal: controller.signal } });
controller.abort(); // tears down the HTTP request
```

### Provider Support

A provider is one of two kinds. A **decision provider** (`typesafe`) has `decide()` and nothing else — `complete`, `stream`, `step`, `stepStream` and `embed` fail with `E_VERB_NOT_SUPPORTED` before any request is built. A **chat provider** has every verb, `decide()` included, by emulation.

A decision provider by base URL — self-hosted, or the fake a check runs — names its protocol:

```typescript
const local = createSignal({ baseUrl: 'http://127.0.0.1:8790/v1', apiKey: 'dev', model: 'fake', adapter: 'systemone' });
```

`meta.usage.reported` is `false` when the provider sent no usage, and always `false` under emulation: `complete()` sums reported and estimated usage without saying which.

---

## Error Handling

All errors are `SignalError` instances with a `.code` and optional `.context`:

| Code | When |
|------|------|
| `E_PROVIDER_NOT_FOUND` | Unknown provider string |
| `E_MISSING_API_KEY` | No API key found (env or explicit) |
| `E_MISSING_MODEL` | No model specified for custom provider |
| `E_MISSING_SDK` | Provider SDK not installed |
| `E_VALIDATION_FAILED` | Response failed Zod validation after all retries; a `decide()` answer failed its gate; a `reasoningEffort` the model does not take |
| `E_MAX_ITERATIONS` | The tool loop did not finish within its turn limit |
| `E_PROVIDER_ERROR` | Provider API error (rate limit, server error, etc.); tools or `embed()` on a provider without support; an adapter that is not implemented |
| `E_MAX_RETRIES`, `E_TOOL_NOT_FOUND`, `E_TOOL_EXECUTION`, `E_TOOL_VALIDATION` | Declared in `ErrorCode`, not currently thrown — tool failures go back to the model as tool results, and exhausted retries are `E_VALIDATION_FAILED` |
| `E_VERB_NOT_SUPPORTED` | A chat verb was called on a decision provider |

```typescript
import { SignalError } from '@niscorp/signal';

try {
  await signal.complete('...');
} catch (error) {
  if (error instanceof SignalError) {
    console.log(error.code, error.context);
  }
}
```

---

## Groq Specifics

Groq is fast and cheap but has quirks:

- **No native tools + structured output together.** With tools set, Signal sends no `response_format` there; the schema rides a system message and is validated client-side.
- **`json_validate_failed` errors.** Groq sometimes returns the model's failed output in the error. Signal extracts and recovers from this.
- **Model-dependent capabilities.** What each Groq model does (json_schema, nested tool args, reasoning efforts) is its own row in the model registry, measured by the probe.
- **Tool args are validated server-side.** So `respond` params would enforce nothing on Groq, and `auto` resolves every agent there to `emit`.

You don't need to handle any of this — Signal does it automatically based on the registry.
