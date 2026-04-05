# Design Document: `@niscorp/signal` — Universal LLM Abstraction

## Purpose

One interface for any LLM provider. Fallbacks, structured output, streaming, tool calling, middleware. The foundation every other package in the platform builds on.

**One sentence:** A composable LLM client with provider plugins, middleware, and structured output - designed so the rest of the platform never thinks about which model it's talking to.

---

## What We Learned

The original LLM abstraction prototype (*rnd.proteus*) was barebones but proved the concept: unified interface, OpenRouter as a meta-provider, fallback chains. What was wrong:

- **OpenRouter coupling.** The "universal" interface was really just an OpenRouter wrapper with some retry logic. The abstraction leaked.
- **No middleware.** Observability, caching, rate limiting, cost tracking were either baked in or missing. Should be composable layers.
- **Streaming was awkward.** AsyncIterable works for Node but not for web (ReadableStream). Need both.
- **Tool calling was single-shot.** Real agents need the full loop: call → tool result → continue → maybe more tools → final answer.
- **No model capability metadata.** Can this model do tools? Vision? What's its context window? Routing decisions need this info.
- **Structured output was afterthought.** Should be first-class with Zod schema → JSON Schema conversion built in.

---

## Architecture

```
┌─────────────────────────────────────┐
│           User Code                 │
│  client.chat(messages, options)     │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│         Middleware Stack            │
│  logging → cache → rate-limit →    │
│  cost-tracking → retry → ...       │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│         Router / Fallback          │
│  Try model A → fail → try model B  │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│         Provider Plugin            │
│  OpenAI / Anthropic / Groq / ...   │
│  Translates to provider API        │
└─────────────────────────────────────┘
```

---

## Public API

### Core

```typescript
// ═══════════════════════════════════════════════════════════
// Client Creation
// ═══════════════════════════════════════════════════════════

export const createClient: (config: ClientConfig) => LlmClient;

// ═══════════════════════════════════════════════════════════
// Provider Registration
// ═══════════════════════════════════════════════════════════

export const createProvider: (config: ProviderConfig) => Provider;

// Built-in providers (separate entry points for tree-shaking)
// import { openai } from '@niscorp/signal/providers/openai';
// import { anthropic } from '@niscorp/signal/providers/anthropic';
// import { groq } from '@niscorp/signal/providers/groq';
// import { openrouter } from '@niscorp/signal/providers/openrouter';

// ═══════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════

export type Middleware = (next: ChatFn) => ChatFn;

// Built-in middleware
export const withLogging: (logger: Logger) => Middleware;
export const withRetry: (options?: RetryOptions) => Middleware;
export const withCostTracking: (handler: CostHandler) => Middleware;
export const withCache: (cache: CacheBackend) => Middleware;
export const withRateLimit: (options: RateLimitOptions) => Middleware;
export const withTimeout: (ms: number) => Middleware;

// ═══════════════════════════════════════════════════════════
// Structured Output
// ═══════════════════════════════════════════════════════════

export const withStructuredOutput: <T>(schema: z.ZodType<T>) => OutputConstraint<T>;

// ═══════════════════════════════════════════════════════════
// Tool Calling
// ═══════════════════════════════════════════════════════════

export const defineTool: <TInput, TOutput>(config: ToolConfig<TInput, TOutput>) => Tool;
```

### Client Interface

```typescript
type LlmClient = {
  // Basic chat completion
  chat: (messages: Message[], options?: ChatOptions) => Promise<ChatResponse>;

  // Streaming chat
  stream: (messages: Message[], options?: ChatOptions) => AsyncIterable<StreamChunk>;

  // Structured output (Zod schema → validated response)
  generate: <T>(messages: Message[], schema: z.ZodType<T>, options?: ChatOptions) => Promise<T>;

  // Tool calling loop (iterates until model stops calling tools)
  chatWithTools: (messages: Message[], tools: Tool[], options?: ToolOptions) => Promise<ToolChatResponse>;

  // Embeddings
  embed: (input: string | string[], options?: EmbedOptions) => Promise<number[][]>;
};
```

---

## Core Types

### Messages

```typescript
type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; source: ImageSource };

type ImageSource =
  | { type: 'url'; url: string }
  | { type: 'base64'; mediaType: string; data: string };
```

### Chat Options

```typescript
type ChatOptions = {
  model?: string;                    // Override default model
  temperature?: number;              // 0-2
  maxTokens?: number;
  stopSequences?: string[];
  topP?: number;
  seed?: number;                     // For reproducibility (if supported)
  signal?: AbortSignal;              // Cancellation
  metadata?: Record<string, string>; // Passed to middleware (tracing, etc.)
};
```

### Chat Response

```typescript
type ChatResponse = {
  content: string;
  model: string;                     // Actual model used (may differ from requested)
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  toolCalls?: ToolCall[];
};
```

### Streaming

```typescript
type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_call_start'; toolCall: { id: string; name: string } }
  | { type: 'tool_call_delta'; toolCallId: string; args: string }
  | { type: 'tool_call_end'; toolCallId: string }
  | { type: 'usage'; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'done'; finishReason: string };
```

The stream is an `AsyncIterable<StreamChunk>`. For web consumers, provide a helper:

```typescript
export const toReadableStream: (iterable: AsyncIterable<StreamChunk>) => ReadableStream<StreamChunk>;
```

---

## Provider Plugin System

### Provider Interface

```typescript
type Provider = {
  id: string;                        // e.g., 'openai', 'anthropic', 'groq'
  chat: (request: ProviderRequest) => Promise<ProviderResponse>;
  stream: (request: ProviderRequest) => AsyncIterable<ProviderStreamChunk>;
  embed?: (request: EmbedRequest) => Promise<number[][]>;
  models: () => ModelInfo[];         // Available models and capabilities
};

type ProviderRequest = {
  model: string;
  messages: ProviderMessage[];       // Provider-native message format
  temperature?: number;
  maxTokens?: number;
  tools?: ProviderTool[];
  responseFormat?: ResponseFormat;
  signal?: AbortSignal;
};
```

### Provider Factory

Each provider is a factory function that takes API configuration and returns a `Provider`:

```typescript
// providers/openai.ts
export const openai = (config: { apiKey: string; baseUrl?: string }): Provider => {
  // ... implementation
};

// providers/anthropic.ts
export const anthropic = (config: { apiKey: string }): Provider => {
  // ... implementation
};

// providers/groq.ts
export const groq = (config: { apiKey: string }): Provider => {
  // ... implementation
};

// providers/openrouter.ts
export const openrouter = (config: { apiKey: string }): Provider => {
  // ... implementation using OpenRouter API
};
```

Providers are in separate entry points so unused providers are tree-shaken:

```typescript
import { openai } from '@niscorp/signal/providers/openai';
import { anthropic } from '@niscorp/signal/providers/anthropic';
```

### Model Info & Capabilities

```typescript
type ModelInfo = {
  id: string;                        // e.g., 'gpt-4o', 'claude-sonnet-4-20250514'
  name: string;                      // Human-readable
  contextWindow: number;             // Max tokens
  maxOutputTokens: number;
  capabilities: {
    tools: boolean;
    vision: boolean;
    streaming: boolean;
    structuredOutput: boolean;        // Native JSON Schema support
    embeddings: boolean;
  };
  pricing?: {
    inputPer1k: number;              // USD per 1K input tokens
    outputPer1k: number;             // USD per 1K output tokens
  };
};
```

This powers intelligent routing: "give me the cheapest model that supports tools and has a 128K context window."

---

## Middleware System

### Middleware Type

```typescript
type ChatFn = (messages: Message[], options: ChatOptions) => Promise<ChatResponse>;
type Middleware = (next: ChatFn) => ChatFn;
```

Middleware wraps the chat function. Composition is left-to-right (first middleware in the array runs first):

```typescript
const client = createClient({
  provider: openai({ apiKey: '...' }),
  model: 'gpt-4o',
  middleware: [
    withLogging(console),
    withRetry({ maxAttempts: 3, backoff: 'exponential' }),
    withCostTracking((cost) => ledger.record(cost)),
    withTimeout(30_000),
  ],
});
```

### Built-in Middleware

#### `withRetry`

```typescript
type RetryOptions = {
  maxAttempts?: number;              // Default: 3
  backoff?: 'exponential' | 'linear' | 'none';
  baseDelayMs?: number;             // Default: 1000
  retryOn?: (error: Error) => boolean;  // Default: retry on rate limit + server errors
};
```

#### `withCostTracking`

```typescript
type CostEvent = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  metadata: Record<string, string>;
  timestamp: number;
};

type CostHandler = (event: CostEvent) => void;
```

#### `withCache`

```typescript
type CacheBackend = {
  get: (key: string) => Promise<ChatResponse | undefined>;
  set: (key: string, value: ChatResponse, ttlMs?: number) => Promise<void>;
};
```

Cache key is computed from messages + model + temperature + relevant options. Useful for deterministic calls (temperature 0, same prompt).

#### `withRateLimit`

```typescript
type RateLimitOptions = {
  maxRequestsPerMinute?: number;
  maxTokensPerMinute?: number;
  strategy?: 'queue' | 'reject';    // Queue waits, reject throws
};
```

#### `withLogging`

```typescript
type Logger = {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
};
```

Logs request/response with timing, token usage, model used. Redacts message content by default (configurable).

---

## Fallback & Routing

### Fallback Chains

```typescript
const client = createClient({
  provider: openai({ apiKey: '...' }),
  model: 'gpt-4o',
  fallbacks: [
    { provider: anthropic({ apiKey: '...' }), model: 'claude-sonnet-4-20250514' },
    { provider: groq({ apiKey: '...' }), model: 'llama-3.3-70b-versatile' },
  ],
});
```

When the primary fails (rate limit, server error, timeout), the client tries fallbacks in order. Each fallback can specify a different provider AND model.

### Model Router (advanced)

```typescript
const client = createClient({
  router: (messages, options) => {
    const tokenEstimate = estimateTokens(messages);
    if (tokenEstimate > 100_000) return { provider: anthropicProvider, model: 'claude-sonnet-4-20250514' };
    if (options.metadata?.priority === 'fast') return { provider: groqProvider, model: 'llama-3.3-70b' };
    return { provider: openaiProvider, model: 'gpt-4o' };
  },
});
```

The router is a function that receives the request and returns the target. This enables any routing strategy: by token count, by priority, by cost budget, by capability requirement.

---

## Structured Output

### `generate<T>()`

```typescript
const user = await client.generate(
  [{ role: 'user', content: 'Extract the user info from: John Smith, john@example.com, age 32' }],
  z.object({
    name: z.string(),
    email: z.string().email(),
    age: z.number(),
  }),
);
// user is typed as { name: string; email: string; age: number }
```

Under the hood:
1. Convert Zod schema → JSON Schema
2. If provider supports native `json_schema` response format, use it
3. Otherwise, include schema in system prompt and parse response as JSON
4. Validate with Zod
5. If validation fails and retries are configured, retry with the validation error as feedback

### `withStructuredOutput<T>(schema)` for chat options

```typescript
const response = await client.chat(messages, {
  responseFormat: withStructuredOutput(MySchema),
});
// response.parsed is the validated object
```

---

## Tool Calling

### Tool Definition

```typescript
const searchTool = defineTool({
  name: 'search',
  description: 'Search the web for information',
  input: z.object({
    query: z.string().describe('Search query'),
    maxResults: z.number().optional().describe('Max results to return'),
  }),
  execute: async (input) => {
    const results = await searchApi(input.query, input.maxResults);
    return JSON.stringify(results);
  },
});
```

The `input` schema is Zod. It's converted to JSON Schema for the LLM, and used to validate the LLM's tool call arguments before `execute` runs.

### Tool Calling Loop

```typescript
const result = await client.chatWithTools(messages, [searchTool, calculatorTool], {
  maxIterations: 10,        // Safety limit
  onToolCall: (call) => {   // Optional: observe tool calls
    console.log(`Calling ${call.name} with`, call.args);
  },
});

// result.content - final text response
// result.messages - full message history (including tool calls and results)
// result.toolCallCount - how many tool calls were made
```

The loop:
1. Send messages + tool definitions to LLM
2. If response contains tool calls, execute them (in parallel if multiple)
3. Append tool results as messages
4. Send again
5. Repeat until LLM responds without tool calls, or maxIterations reached

---

## Embeddings

```typescript
const vectors = await client.embed('Hello world');
// vectors[0] is number[] of length model-dependent

const batchVectors = await client.embed(['Hello', 'World']);
// batchVectors[0], batchVectors[1]
```

Embedding model is configured per-provider or overridden per-call:

```typescript
const vectors = await client.embed('Hello', { model: 'text-embedding-3-small' });
```

---

## File Structure

```
src/
├── index.ts                      # Public API
├── types.ts                      # Core types (Message, ChatResponse, etc.)
├── schemas.ts                    # Zod schemas for all public types
├── client.ts                     # createClient implementation
├── middleware/
│   ├── index.ts                  # Barrel + Middleware type
│   ├── retry.ts                  # withRetry
│   ├── cost-tracking.ts          # withCostTracking
│   ├── cache.ts                  # withCache
│   ├── rate-limit.ts             # withRateLimit
│   ├── logging.ts                # withLogging
│   └── timeout.ts                # withTimeout
├── tools/
│   ├── index.ts                  # defineTool, tool loop
│   ├── types.ts                  # Tool types
│   └── loop.ts                   # Tool calling loop implementation
├── structured/
│   ├── index.ts                  # withStructuredOutput, generate
│   └── schema-converter.ts       # Zod → JSON Schema
├── router/
│   ├── index.ts                  # Fallback chain + custom router
│   └── types.ts
├── providers/
│   ├── types.ts                  # Provider interface
│   ├── openai.ts                 # OpenAI provider
│   ├── anthropic.ts              # Anthropic provider
│   ├── groq.ts                   # Groq provider
│   └── openrouter.ts             # OpenRouter provider
└── utils/
    ├── tokens.ts                 # Token estimation
    └── streams.ts                # AsyncIterable ↔ ReadableStream
```

### Package Exports

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./providers/openai": "./dist/providers/openai.js",
    "./providers/anthropic": "./dist/providers/anthropic.js",
    "./providers/groq": "./dist/providers/groq.js",
    "./providers/openrouter": "./dist/providers/openrouter.js"
  }
}
```

---

## Dependencies

- `zod` (peer, ^4.0.0) - Schema validation, structured output
- `zod-to-json-schema` - Schema conversion (could be vendored)

Provider-specific:
- Each provider plugin imports its own SDK or uses raw `fetch`. No shared HTTP client dependency. Providers that use `fetch` have zero additional deps.

---

## Key Design Decisions

1. **Why middleware, not built-in features?** Composability. Not everyone needs cost tracking. Not everyone needs caching. Middleware lets you add exactly what you need. The core client is tiny.

2. **Why separate provider plugins?** Tree-shaking. If you only use Anthropic, you don't bundle the OpenAI adapter. Each provider is a separate entry point.

3. **Why both `chat` and `generate`?** Different use cases. `chat` returns text. `generate` returns typed, validated data. The structured output path is different enough (schema conversion, validation, retry-on-parse-failure) to justify a separate method.

4. **Why `chatWithTools` as a separate method?** The tool loop is complex (iterate, execute, re-send). Mixing it into `chat` would make the basic path harder to understand. Separation of concerns.

5. **Why AsyncIterable for streaming?** It's the most composable primitive. `for await (const chunk of stream)` works everywhere. The `toReadableStream` helper covers web use cases.

6. **Why not just use Vercel AI SDK?** Vercel AI SDK is React-coupled (useChat, useCompletion), Next.js-opinionated, and doesn't support the middleware/plugin architecture we need. We need framework-agnostic, composable building blocks that work in Node, Deno, Workers, and the browser.
