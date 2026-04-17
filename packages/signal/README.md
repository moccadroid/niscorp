# @niscorp/signal

Universal LLM abstraction. Stateless, immutable, provider-agnostic. Structured output with Zod, tool calling, zero hard dependencies.

## Install

```bash
pnpm add @niscorp/signal zod
# Plus the provider SDK you want to use:
pnpm add openai  # for OpenAI, Groq, OpenRouter, or any OpenAI-compatible API
```

## Quick Example

```typescript
import { createSignal } from '@niscorp/signal';
import { z } from 'zod';

const signal = createSignal('groq');

// Simple text completion
const { response } = await signal.complete('What is 2+2?');

// Structured output — response is typed
const { response: user } = await signal
  .schema(z.object({ name: z.string(), age: z.number() }))
  .complete('Extract: Alice is 30 years old');
// user.name === 'Alice', user.age === 30
```

## Documentation

- **[DOCS.md](./DOCS.md)** — Full API reference with examples
- **[DESIGN.md](./DESIGN.md)** — Architecture, design decisions, and trade-offs

## API

Every builder method returns a new immutable instance. `complete()`
and `stream()` run the full Signal pipeline (schema, retries, tool
loop). `step()` and `stepStream()` are the low-level primitives — one
adapter call, no auto tool execution — used by orchestrators like
`@niscorp/cortex` that own their own tool loop.

```typescript
// Create
const signal = createSignal('groq');               // known provider
const signal = createSignal('groq', { apiKey, model, systemPrompt, retries });

// Configure (each returns a new instance)
signal.model('openai/gpt-oss-120b')
signal.systemPrompt('You are helpful.')
signal.schema(zodSchema)           // typed structured output
signal.tools([myTool])             // tool calling
signal.history(messages)           // multi-turn
signal.retries(3)                  // validation retries
signal.capabilities({ ... })      // override provider defaults
signal.onRetry(handler)            // retry hook
signal.onToolCall(handler)         // tool call hook

// Execute — high level
const { response, history, meta } = await signal.complete('user message');

// Execute — streaming
for await (const event of signal.stream('user message')) {
  if (event.type === 'text') process.stdout.write(event.text);
  if (event.type === 'done') console.log(event.meta.usage);
}

// Execute — low level (single adapter call, no tool execution)
const { content, toolCalls, usage, finishReason } = await signal.step({
  messages: [...], tools: [{ name, description, parameters }],
});

// Execute — streaming low level (symmetric with step())
for await (const event of signal.stepStream({ messages, tools })) {
  if (event.type === 'text') process.stdout.write(event.text);
  if (event.type === 'done') {
    // event.result is the aggregated StepResult — same shape as step()
  }
}
```

## Providers

| Provider | String | SDK |
|----------|--------|-----|
| Groq | `'groq'` | `openai` |
| OpenAI | `'openai'` | `openai` |
| OpenRouter | `'openrouter'` | `openai` |
| Anthropic | `'anthropic'` | stub (use OpenRouter) |
| Google | `'google'` | stub (use OpenRouter) |

API keys are read from environment variables (`GROQ_API_KEY`, `OPENAI_API_KEY`, etc.) or passed via `.apiKey()` / options.

## License

MIT
