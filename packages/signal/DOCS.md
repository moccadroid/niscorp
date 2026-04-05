# Signal Documentation

Complete reference for `@niscorp/signal`.

---

## Concepts

### Stateless Immutable Builder

Signal uses an immutable builder pattern. Every configuration method returns a **new instance** — the original is never modified. `complete()` is the only method that executes.

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
- **`multimodal`** — Does it accept image content?

You don't need to think about this unless you're overriding defaults.

---

## Creating a Signal

### Known Provider

```typescript
const signal = createSignal('groq');
```

Reads `GROQ_API_KEY` from environment automatically. Known providers: `'groq'`, `'openai'`, `'openrouter'`, `'anthropic'`, `'google'`.

### Known Provider with Options

```typescript
const signal = createSignal('groq', {
  apiKey: 'gsk_...',
  model: 'openai/gpt-oss-120b',
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

Any OpenAI-compatible API works.

---

## Builder Methods

Every method returns a new `Signal` instance.

### `.model(name)`
Override the model for this instance.
```typescript
signal.model('openai/gpt-oss-120b')
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
Set max validation retries (default: 2). When a response fails Zod validation, Signal feeds the error back to the model and tries again.
```typescript
signal.retries(3)
```

### `.apiKey(key)`
Override the API key.
```typescript
signal.apiKey('gsk_...')
```

### `.options(opts)`
Set LLM options (temperature, maxTokens, etc.). These are rarely needed.
```typescript
signal.options({ temperature: 0 })
```

### `.capabilities(caps)`
Override provider capability defaults.
```typescript
signal.capabilities({ nativeTools: true })
```

### `.onRetry(handler)`
Hook called on each validation retry.
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

### `.stream(input)`

Not yet implemented. Will return `AsyncIterable<StreamEvent<T>>`.

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
    raw: unknown;                   // raw API response for debugging
    errors: ProviderError[];        // all errors including recovered ones
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

1. Zod schema is converted to JSON Schema via `z.toJSONSchema()`
2. Based on provider capabilities:
   - `nativeJsonSchema` → sends JSON Schema as `response_format`
   - `nativeJsonMode` → sends `response_format: json_object` + schema in system prompt
   - Neither → schema in system prompt only
3. Response is parsed as JSON
4. Validated with `schema.safeParse()`
5. On failure: Zod errors are sent back to the model as a correction message
6. Retries up to `retries` times (default: 2)
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

The Zod `input` schema validates the model's arguments before `execute` runs. The return value is stringified and sent back to the model.

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

Signal picks a strategy based on provider capabilities:

**Native tools** (OpenAI) — Uses the provider's native `tools` parameter and `tool_calls` response. The model decides when to call tools.

**Unified schema** (Groq, others) — Tool descriptions are injected into the system prompt. The response format includes a discriminator field (`_action: "call" | "respond"`). Signal handles the loop:

1. Model responds with `_action: "call"` + tool name + args
2. Signal validates args with Zod, executes the tool
3. Tool result is sent back to the model
4. Model responds with `_action: "respond"` + final answer
5. Final answer is validated against the output schema

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

## Error Handling

All errors are `SignalError` instances with a `.code` and optional `.context`:

| Code | When |
|------|------|
| `E_PROVIDER_NOT_FOUND` | Unknown provider string |
| `E_MISSING_API_KEY` | No API key found (env or explicit) |
| `E_MISSING_MODEL` | No model specified for custom provider |
| `E_MISSING_SDK` | Provider SDK not installed |
| `E_VALIDATION_FAILED` | Response failed Zod validation after all retries |
| `E_MAX_RETRIES` | Retry loop exhausted |
| `E_PROVIDER_ERROR` | Provider API error (rate limit, server error, etc.) |
| `E_TOOL_NOT_FOUND` | Model called an unknown tool |
| `E_TOOL_EXECUTION` | Tool execute() threw |
| `E_TOOL_VALIDATION` | Tool args failed Zod validation |

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

- **No native tools + structured output together.** Signal uses the unified schema strategy automatically.
- **`json_validate_failed` errors.** Groq sometimes returns the model's failed output in the error. Signal extracts and recovers from this.
- **Model-dependent capabilities.** Not all Groq models support `json_schema` response format. Signal defaults to `json_mode` for Groq.

You don't need to handle any of this — Signal does it automatically based on the provider registry.
