# Signal — Design Document

Architecture, design decisions, and trade-offs behind `@niscorp/signal`. For usage documentation, see [DOCS.md](./DOCS.md).

---

## Architecture

```
User Code
    ↓
createSignal('groq', options?)     → immutable config bag
    .model(...)                    → new config bag
    .schema(zodSchema)             → new config bag (generic changes)
    .tools([...])                  → new config bag
    ↓
    .complete('user message')      → execute (returns Promise<SignalResult>)
    .stream('user message')        → stream  (returns AsyncIterable<StreamEvent>)
    .step({ messages, tools })     → one adapter call  (returns Promise<StepResult>)
    .stepStream({ messages, tools}) → streaming step  (returns AsyncIterable<StepStreamEvent>)
    ↓
Strategy Layer (picks approach based on capabilities)
    ↓
Provider Adapter (translates to provider API)
    ↓ chat()                       ↓ chatStream()
    ↓ Promise<ProviderResponse>    ↓ AsyncIterable<ProviderStreamDelta>
HTTP (via dynamically imported SDK)
```

### Immutable Builder

Every builder method creates a new config object via spread. The factory closure captures the config. `complete()` reads the captured config and executes. No mutable state on the returned object.

The adapter is lazily created and cached in the closure — keyed by provider+baseUrl+apiKey so forking with a different API key creates a new adapter.

### Strategy Layer

Two decisions are made based on provider capabilities:

**Structured output strategy:**
1. `nativeJsonSchema` → provider's `response_format: json_schema`
2. `nativeJsonMode` → provider's `response_format: json_object` + schema in system prompt
3. Neither → schema in system prompt only, parse JSON from response

**Tool calling strategy:**
1. `nativeTools` (and no schema conflict) → provider's native tool calling
2. Otherwise → unified schema: tools embedded in system prompt, discriminated union response (`_action: "call" | "respond"`)

Zod validates the final result regardless of strategy. Provider-side schemas are compliance hints.

### Unified Schema Strategy

For providers that can't do native tools + structured output simultaneously (Groq):

1. Tool descriptions injected into system prompt with usage instructions
2. Response format is a discriminated union: `{ _action: "call", tool, args }` or `{ _action: "respond", ...userSchema }`
3. On `_action: "call"` → validate args with tool's Zod schema, execute, send result back, loop
4. On `_action: "respond"` → strip framework fields, validate against output schema
5. On invalid JSON / invalid `_action` → send correction message, retry up to `retries` times

The `_action` underscore prefix avoids collision with user schema fields.

### Embedding

`embed()` converts text to dense vectors via the provider's `/v1/embeddings` endpoint. Same builder pattern, different execution method:

```typescript
const embedder = createSignal('openai').model('text-embedding-3-small');
const vector = await embedder.embed('search query');                    // number[]
const vectors = await embedder.embed(['text a', 'text b']);            // number[][]
const small = await embedder.embed('text', { dimensions: 256 });       // truncated
```

Embedding is a separate concern from chat — different models, different API endpoint, different use case. Use a separate Signal client for embedding. The `supportsEmbedding` capability in the registry indicates which providers support it (currently: OpenAI only).

The adapter's `embed()` method is optional. Calling `embed()` on a provider without support throws. The embed function is lazy-loaded — the SDK instance for embeddings is created only on first call.

### Provider Adapters

Three adapters cover all providers:

- **openai-compatible** — OpenAI, Groq, OpenRouter, any OpenAI-compat endpoint. Supports `chat`, `chatStream`, and `embed`.
- **anthropic** (stub) — Anthropic Messages API
- **google** (stub) — Google Gemini API

Adapters are thin: translate Signal's message format to the provider's, call the API, normalize the response. Error recovery (Groq's `failed_generation`) lives in the adapter.

### SDK Loading

Zero hard dependencies. The openai SDK is dynamically imported at runtime. If the user hasn't installed it, they get a clear error message. The user can also pass a pre-configured client instance to skip SDK loading entirely.

---

## Provider Registry

Known providers are registered with defaults:

```
'groq'       → api.groq.com       GROQ_API_KEY       openai-compatible  nativeTools:false  nativeJsonSchema:false  embedding:false
'openai'     → api.openai.com     OPENAI_API_KEY      openai-compatible  nativeTools:true   nativeJsonSchema:true   embedding:true
'openrouter' → openrouter.ai      OPENROUTER_API_KEY  openai-compatible  nativeTools:true   nativeJsonSchema:true   embedding:false
'anthropic'  → api.anthropic.com  ANTHROPIC_API_KEY   anthropic          nativeTools:true   nativeJsonSchema:false  embedding:false
'google'     → googleapis.com     GOOGLE_API_KEY      google             nativeTools:true   nativeJsonSchema:false  embedding:false
```

The user can override any capability via `.capabilities()`.

> OpenRouter can proxy some embedding models, but coverage is model-dependent, so the registry defaults it to `false`. Override via `.capabilities({ supportsEmbedding: true })` if your chosen model supports it.

---

## Validation & Retry

When a schema is set, responses are validated with Zod's `safeParse`. On failure:

1. The Zod error details are formatted and sent back to the model as a correction message
2. The model gets another chance to produce valid output
3. Repeats up to `retries` times (default: 2)
4. After exhausting retries, throws `SignalError` with `E_VALIDATION_FAILED` and the last Zod issues

This works because LLMs usually produce almost-correct JSON that fails on one field. Feeding the specific error back fixes it 90%+ of the time.

---

## File Structure

```
src/
├── index.ts                           # Public API
├── signal.ts                          # Factory + immutable builder + complete + stream
├── types.ts                           # Message, SignalResult, StreamEvent, etc.
├── config.ts                          # SignalConfig type
├── errors.ts                          # SignalError + error codes
├── registry.ts                        # Known provider registry
├── strategy/
│   ├── structured-output.ts           # Schema strategy selection
│   ├── tool-calling.ts                # Tool strategy selection
│   └── unified-schema.ts             # Unified schema builder + loop
├── stream/
│   └── execute-stream.ts             # Streaming execution: text, tools, schema retry
├── providers/
│   ├── openai-compatible.adapter.ts   # OpenAI/Groq/OpenRouter adapter (chat + chatStream)
│   ├── anthropic.adapter.ts           # Stub
│   └── google.adapter.ts             # Stub
├── tools/
│   ├── define-tool.ts                 # defineTool factory
│   └── tool-loop.ts                   # Native tool execution loop (non-streaming)
├── validation/
│   └── retry.ts                       # Zod validation + retry with correction (non-streaming)
└── utils/
    └── sdk-loader.ts                  # Dynamic SDK import
```

---

## Dependencies

- `zod` (peer, ^4.0.0) — Schema validation, JSON Schema generation
- Provider SDKs dynamically imported (zero bundled)

---

## Design Decisions

1. **Factory function, not class.** Signal returns a plain object from a closure. No `this`, no `new`, no prototype chain. Aligns with the style guide ("no classes unless genuinely needed").

2. **Immutable builder via spread.** Each method returns `createSignalFromConfig({ ...config, [field]: value })`. Cheap, forkable, no mutation, no clearing.

3. **`complete()` takes one argument.** The user message. Everything else is configured on the instance. No optional parameter chains.

4. **String provider names.** `'groq'` is the common path. Registry handles base URLs, env vars, capability defaults. Object config for custom endpoints.

5. **Capabilities drive strategy, not provider identity.** Signal doesn't hardcode "if Groq then do X". It checks capabilities and picks the right strategy.

6. **Unified schema for tool calling.** When native tools aren't available, tools are embedded in the system prompt and the response is a discriminated union. Battle-tested pattern.

7. **Zero hard dependencies.** SDKs are dynamically imported. The user installs what they need.

8. **Zod is the source of truth.** Provider-side JSON Schema is a compliance hint. Zod validates the actual response. Retries feed Zod errors back to the model.

9. **History is external.** Signal doesn't track conversation state. `complete()` returns full history. The caller threads it back via `.history()`.

10. **Hooks, not middleware.** `onRetry` and `onToolCall` cover observability without middleware complexity.

11. **`parseResponse` throws, never swallows.** If the response doesn't match the schema after the tool/unified loop, it's a `SignalError`. The caller always gets either a valid typed result or an explicit error.

12. **`stream()` is an async generator that mirrors `complete()`'s contract.** Same strategy selection, same tool loop shape, same Zod validation at end-of-stream, same retry-with-correction. The only differences: text deltas are yielded as they arrive, tool calls are assembled from chunked deltas, and a `retry` event tells the consumer to reset downstream state (e.g. a `@niscorp/solid` stream) before the next attempt.

13. **Streaming validation is end-of-stream, not mid-stream.** Signal validates the complete response buffer after the SSE closes. Mid-stream structural validation is `@niscorp/solid`'s job — the consumer pipes `text` deltas into solid, which kind-checks at value-open. Signal doesn't know about solid; solid doesn't know about signal. The consumer is the glue.

14. **`AbortSignal` for external cancellation.** `stream(input, { signal })` checks the signal between deltas. `for await + break` also works (iterator `return()` closes the underlying SSE). Both paths are clean and composable.

15. **`step()` and `stepStream()` are the low-level primitives.** `complete()`/`stream()` run the full pipeline (schema retries, native tool execution); `step()`/`stepStream()` make exactly one adapter call and return what the model said — tool calls as data, no auto execution, no schema validation, no retries. They exist for orchestrators like `@niscorp/cortex` that own their own tool loop and need per-call attribution, gating, and observation. `stepStream()` is the streaming variant: yields `{type:'text'}` deltas as text arrives, then one `{type:'done', result}` with the aggregated `StepResult` — same shape as `step()`'s return. Keeping the two pairs symmetric (`complete`/`stream`, `step`/`stepStream`) means streaming is never a special case of the API, only of delivery.
