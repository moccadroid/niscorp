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

Every method returns a new immutable instance. `complete()` is the only method that executes.

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

// Execute
const { response, history, meta } = await signal.complete('user message');
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
