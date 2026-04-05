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

export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string }
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
// Stream Events
// ═══════════════════════════════════════════════════════════

export type StreamEvent<T> =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; name: string; args: unknown }
  | { type: 'tool_end'; name: string; result: unknown }
  | { type: 'error'; error: Error; recovered: boolean }
  | { type: 'done'; response: T; history: Message[]; meta: SignalMeta };

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
};
