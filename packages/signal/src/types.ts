import type { z } from 'zod';

// ═══════════════════════════════════════════════════════════
// Messages
// ═══════════════════════════════════════════════════════════

export type ImageSource =
  | { type: 'url'; url: string }
  | { type: 'base64'; mediaType: string; data: string };

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; source: ImageSource };

// A tool call attached to an assistant message. Mirrors the OpenAI
// chat-completion `tool_calls` shape: each call has an id (used to
// reference back from a later 'tool' message), the function name,
// and a JSON-stringified arguments payload.
export type AssistantToolCall = {
  id: string;
  name: string;
  // OpenAI-format tool calls carry arguments as a JSON string. We
  // keep that contract so adapters can pass them straight through
  // without re-stringifying.
  args: string;
};

export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  // Assistant messages may carry tool calls when the model wants to
  // invoke tools. Both `content` and `toolCalls` are present together
  // when the model returns text alongside tool calls; tool-call-only
  // turns have empty content but a non-empty toolCalls array.
  | { role: 'assistant'; content: string; toolCalls?: AssistantToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

// ═══════════════════════════════════════════════════════════
// Tool Types
// ═══════════════════════════════════════════════════════════

export type ToolConfig<TInput = unknown> = {
  name: string;
  description: string;
  input: z.ZodType<TInput>;
  execute: (input: TInput) => Promise<unknown> | unknown;
};

export type Tool = {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  execute: (input: unknown) => Promise<unknown> | unknown;
};

export type ToolCallRecord = {
  name: string;
  args: unknown;
  result: unknown;
  durationMs: number;
};

// ═══════════════════════════════════════════════════════════
// Capabilities
// ═══════════════════════════════════════════════════════════

export type Capabilities = {
  nativeTools: boolean;
  nativeJsonSchema: boolean;
  nativeJsonMode: boolean;
  // Can the provider combine response_format with tool calling in ONE
  // request? OpenAI can; Groq and OpenRouter reject the combination.
  // Orchestrators (cortex) use this to pick an output strategy.
  toolsWithStructuredOutput: boolean;
  // Does the provider validate tool-call arguments SERVER-SIDE against
  // the declared `parameters` schema and 400 the whole request on a
  // mismatch (Groq's tool_use_failed)? When true, orchestrators keep
  // the wire `parameters` of large/repairable payloads permissive and
  // validate client-side — a client sees the attempt and can repair or
  // correct specifically; a server 400 destroys it.
  validatesToolArgs: boolean;
  // Does the provider/model corrupt STRUCTURED tool-call arguments?
  // Observed on Groq gpt-oss: nested arrays inside function args arrive
  // JSON-STRINGIFIED (`"children": "[{\"component\":..."`), while the
  // model emits the identical JSON cleanly on the content channel.
  // When true, orchestrators should carry large structured payloads on
  // the content channel (cortex resolves output strategy to 'emit')
  // instead of through tool args.
  manglesNestedToolArgs: boolean;
  multimodal: boolean;
  supportsEmbedding: boolean;
};

// ═══════════════════════════════════════════════════════════
// Options (rarely set)
// ═══════════════════════════════════════════════════════════

export type SignalOptions = {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  seed?: number;
  signal?: AbortSignal;
  // How hard a REASONING model thinks before it answers. The scale is the
  // provider's, not ours (OpenAI stops at 'high'; OpenRouter routes models that
  // also take 'max'), so the union is the union of what providers accept and an
  // unsupported rung is the provider's to reject. Models whose reasoning is
  // mandatory default to their own top rung — on a long agentic loop that is the
  // difference between a run that finishes inside its budget and one that does
  // not, so the caller gets to say.
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
};

// ═══════════════════════════════════════════════════════════
// Result
// ═══════════════════════════════════════════════════════════

export type ProviderError = {
  code: string;
  message: string;
  recovered: boolean;
  raw?: unknown;
};

export type SignalMeta = {
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  durationMs: number;
  retries: number;
  toolCalls: ToolCallRecord[];
  provider: {
    raw: unknown;
    errors: ProviderError[];
  };
};

export type SignalResult<T> = {
  response: T;
  history: Message[];
  meta: SignalMeta;
};

// ═══════════════════════════════════════════════════════════
// Step API — single model call, no auto tool execution
// ═══════════════════════════════════════════════════════════
//
// Used by callers (notably @niscorp/cortex) that want to own the
// tool loop themselves. signal.step() runs ONE adapter call and
// returns the model's raw output, including any tool calls the
// model wants to make. The caller is responsible for executing
// tool calls and feeding results back via subsequent step() calls.

export type StepToolCall = {
  id: string;
  name: string;
  // Parsed JSON object — Signal converts the provider's stringified
  // arguments into a typed value before returning. Callers should
  // still validate against their tool's input schema.
  args: unknown;
};

export type StepInputMessage =
  | Message
  | {
      role: 'tool';
      toolCallId: string;
      name: string;
      content: string;
    };

// ═══════════════════════════════════════════════════════════
// Wire contract — the routed view of one model response
// ═══════════════════════════════════════════════════════════
//
// Signal's contract is "what comes out conforms to the schema that
// went in". Every response (and every recovered provider rejection)
// is normalized by the wire layer (src/wire) and ROUTED: a call
// matching a declared tool is a tool call; anything else whose
// repaired value validates against the acceptance schema is output;
// what survives neither is a typed failure with evidence.

// A provider rejected the model's emission; a recovery entry pulled
// what it could from the error body.
export type Rejection = {
  // Tool name, when the attempt parsed (possibly after closing a
  // truncated body) as a { name, arguments } call.
  name?: string;
  // Parsed arguments, when parseable.
  args?: unknown;
  // The raw recovered bytes — always present, may be ''.
  argsText: string;
  // The recovered bytes ended mid-structure.
  truncated: boolean;
};

export type StepOutcome =
  | { kind: 'tool_calls'; calls: StepToolCall[] }
  // value is the RAW accepted candidate, not the schema-transformed
  // parse: the acceptance schema is a GATE (a transport concern —
  // "is this a real attempt"), semantics stay the caller's.
  | { kind: 'output'; value: unknown }
  | { kind: 'failed'; evidence: string; truncated?: boolean };

// How the outcome came to be — evidence for events/telemetry, and how
// dead-weight recovery entries get found.
export type WireReport = {
  // The ladder rung or recovery entry that produced the accepted
  // candidate ('parse' when nothing had to be repaired).
  rung?: string;
  // An error-hook recovery entry recovered a provider rejection.
  recovered?: { strategy: string; name?: string; truncated: boolean };
  notes?: string[];
};

// A tool descriptor for step(). Note: NO `execute` field — step() never
// runs tools, it only describes them to the model. The caller owns the
// loop and is responsible for executing whatever the model asks for.
export type StepToolDescriptor = {
  name: string;
  description: string;
  // JSON Schema for the tool's input. Use z.toJSONSchema() if you have
  // a Zod schema; pass any draft-07-compatible object otherwise.
  parameters: Record<string, unknown>;
};

// Response-format constraint passed through to the provider. Shared by
// StepRequest (caller-facing) and ProviderRequest (adapter-facing).
export type ResponseFormat =
  | {
      type: 'json_schema';
      jsonSchema: { name: string; strict: boolean; schema: Record<string, unknown> };
    }
  | { type: 'json_object' };

export type StepRequest = {
  messages: ReadonlyArray<StepInputMessage>;
  tools?: ReadonlyArray<StepToolDescriptor>;
  // Force tool selection. 'auto' (default), 'none', 'required' (the model
  // MUST call some tool this turn), or a specific tool name.
  toolChoice?: 'auto' | 'none' | 'required' | { name: string };
  // Routing acceptance. When set, signal NORMALIZES the response
  // (solid's repair ladder, provider wire strategies — all rescue-only
  // and gated by this schema) and ROUTES it: StepResult.outcome says
  // whether the turn is tool calls, a final output that validates, or
  // a typed failure with evidence. The schema is a GATE, not a
  // transform — outcome.value is the raw accepted candidate. Provider
  // rejections that carry the attempt (Groq failed_generation) are
  // recovered and routed the same way: a rejected call to a DECLARED
  // tool comes back as a normal tool call. `outputTool` names the
  // synthetic exit tool (respond transport) whose calls are OUTPUT,
  // never tool calls.
  output?: { accept: z.ZodType; outputTool?: string };
  // Provider-native response format (json_schema / json_object), passed
  // through verbatim. Check Capabilities.toolsWithStructuredOutput before
  // combining with `tools` — providers that can't combine reject the request.
  responseFormat?: ResponseFormat;
  options?: SignalOptions;
};

export type StepResult = {
  content: string;
  toolCalls: StepToolCall[];
  // What the call cost, AS THE PROVIDER REPORTED IT. Zero means the provider
  // said zero; `reported: false` means it said nothing at all, which is a
  // different fact and must not be summed as if it were free.
  //
  // OpenAI-compatible streams send the usage frame after the last content
  // chunk and are not reliable about it — the same provider that emits it
  // twice on one call omits it on the next. A consumer that cannot tell the
  // two apart reports an agent as costing nothing.
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reported: boolean;
  };
  finishReason: string;
  raw: unknown;
  // The routed view (present when the request carried output.accept,
  // and always on recovered provider rejections). Consumers should
  // switch on this instead of parsing content/toolCalls themselves.
  outcome?: StepOutcome;
  // How the outcome came to be (repair rung, recovery entry).
  wire?: WireReport;
};

// ═══════════════════════════════════════════════════════════
// Token counting
// ═══════════════════════════════════════════════════════════

export type CountInput = string | ReadonlyArray<StepInputMessage>;

// ═══════════════════════════════════════════════════════════
// Embedding
// ═══════════════════════════════════════════════════════════

export type EmbedOptions = {
  dimensions?: number;
  // Per-call usage sink — a sibling of `dimensions`, not one of the builder's
  // persistent handlers (onRetry/onToolCall). The provider reports embedding
  // usage on every call and the adapter parses it (EmbedResponse.usage), but
  // `embed`'s whole ergonomic is vector-in/vector-out, so the number has
  // nowhere to ride the return without breaking every caller. This hands it
  // back instead: invoked after a successful call with the adapter's usage and
  // the model that actually resolved (registry defaults mean the caller may not
  // know which). A caller that meters model spend measures the embed exactly
  // rather than re-counting it as a ~4-char/token guess. Not called when the
  // adapter throws — there was no usage.
  onUsage?: (usage: { inputTokens: number; totalTokens: number }, model: string) => void;
};

export type EmbedRequest = {
  model: string;
  input: string | string[];
  dimensions?: number;
};

export type EmbedResponse = {
  embeddings: number[][];
  usage: {
    inputTokens: number;
    totalTokens: number;
  };
};

// ═══════════════════════════════════════════════════════════
// Stream Events (emitted by signal.stream())
// ═══════════════════════════════════════════════════════════

export type StreamEvent<T> =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; name: string; args: unknown }
  | { type: 'tool_end'; name: string; result: unknown }
  | { type: 'retry'; reason: string; attempt: number }
  | { type: 'error'; error: Error; recovered: boolean }
  | { type: 'done'; response: T; history: Message[]; meta: SignalMeta };

// Step-stream events — emitted by signal.stepStream(). Narrower than
// StreamEvent because step-level streaming does one adapter call and
// does not execute tools or handle schema retries. Text deltas and
// tool-call argument fragments are emitted incrementally; tool calls
// are ALSO delivered fully assembled on the final `done` event as part
// of the StepResult. `tool_call_delta` is what makes progressive
// parsing of function-call payloads possible (cortex → solid).
export type StepStreamEvent =
  | { type: 'text'; text: string }
  // The model's THINKING, streamed separately from its answer. Passed through
  // untouched — never folded into StepResult.content — so a caller can show the
  // reasoning in flight and keep it out of the output. Only providers that
  // stream it (and are asked, where asking is needed) produce these.
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call_delta'; index: number; id?: string; name?: string; argsText: string }
  | { type: 'done'; result: StepResult };

// ═══════════════════════════════════════════════════════════
// Stream options
// ═══════════════════════════════════════════════════════════

export type StreamOptions = {
  signal?: AbortSignal;
};

// ═══════════════════════════════════════════════════════════
// Provider Stream Deltas (normalized adapter output)
// ═══════════════════════════════════════════════════════════

export type ProviderStreamDelta =
  | { type: 'text'; text: string }
  // Reasoning tokens, from `choice.delta.reasoning` or `.reasoning_content`
  // depending on the provider. Normalized to one shape here.
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; index: number; id?: string; name?: string; argsFragment?: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; totalTokens: number }
  | { type: 'finish'; finishReason: string };

// ═══════════════════════════════════════════════════════════
// Provider Adapter Interface
// ═══════════════════════════════════════════════════════════

export type ProviderRequest = {
  model: string;
  messages: Message[];
  responseFormat?: ResponseFormat;
  tools?: Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }>;
  toolChoice?: 'auto' | 'none' | 'required' | { name: string };
  options?: SignalOptions;
};

export type ProviderResponse = {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: string;
  }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  raw: unknown;
};

export type ProviderAdapter = {
  id: string;
  chat: (request: ProviderRequest) => Promise<ProviderResponse>;
  // `options.signal`, when given, is handed to the underlying fetch so an abort
  // tears down the HTTP request itself — not just the delta loop above it. An
  // adapter that does not forward it simply keeps aborting between deltas.
  chatStream: (request: ProviderRequest, options?: { signal?: AbortSignal }) => AsyncIterable<ProviderStreamDelta>;
  embed?: (request: EmbedRequest) => Promise<EmbedResponse>;
};
