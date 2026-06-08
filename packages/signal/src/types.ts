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

export type StepRequest = {
  messages: ReadonlyArray<StepInputMessage>;
  tools?: ReadonlyArray<StepToolDescriptor>;
  // Force tool selection. 'auto' (default), 'none', or a specific tool name.
  toolChoice?: 'auto' | 'none' | { name: string };
  options?: SignalOptions;
};

export type StepResult = {
  content: string;
  toolCalls: StepToolCall[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  raw: unknown;
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
// does not execute tools or handle schema retries. Text deltas are
// emitted incrementally; tool calls are delivered in aggregate on the
// final `done` event as part of the StepResult.
export type StepStreamEvent =
  | { type: 'text'; text: string }
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
  | { type: 'tool_call'; index: number; id?: string; name?: string; argsFragment?: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; totalTokens: number }
  | { type: 'finish'; finishReason: string };

// ═══════════════════════════════════════════════════════════
// Provider Adapter Interface
// ═══════════════════════════════════════════════════════════

export type ProviderRequest = {
  model: string;
  messages: Message[];
  responseFormat?: {
    type: 'json_schema';
    jsonSchema: { name: string; strict: boolean; schema: Record<string, unknown> };
  } | {
    type: 'json_object';
  };
  tools?: Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }>;
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
  chatStream: (request: ProviderRequest) => AsyncIterable<ProviderStreamDelta>;
  embed?: (request: EmbedRequest) => Promise<EmbedResponse>;
};
