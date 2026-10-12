import type { z } from 'zod';

export type ImageSource =
  | { type: 'url'; url: string }
  | { type: 'base64'; mediaType: string; data: string };

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; source: ImageSource };

export type AssistantToolCall = {
  id: string;
  name: string;
  // A JSON string, as the OpenAI wire carries it.
  args: string;
};

export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string; toolCalls?: AssistantToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

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

export type EndpointCapabilities = {
  nativeTools: boolean;
  nativeJsonMode: boolean;
  validatesToolArgs: boolean;
  supportsEmbedding: boolean;
};

export type ModelCapabilities = {
  nativeJsonSchema: boolean;
  toolsWithStructuredOutput: boolean;
  manglesNestedToolArgs: boolean;
  multimodal: boolean;
};

export type Capabilities = EndpointCapabilities & ModelCapabilities;

// Every value some provider accepts, not one provider's scale: `default` is Groq's for
// Qwen, `xhigh` and `max` are OpenRouter's.
export const REASONING_EFFORTS = ['none', 'default', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export type SignalOptions = {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  seed?: number;
  signal?: AbortSignal;
  reasoningEffort?: ReasoningEffort;
};

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

export type StepToolCall = {
  id: string;
  name: string;
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

export type Rejection = {
  name?: string;
  args?: unknown;
  argsText: string;
  truncated: boolean;
};

export type StepOutcome =
  | { kind: 'tool_calls'; calls: StepToolCall[] }
  // `value` is the accepted candidate as it arrived, not the schema's parsed output: the
  // acceptance schema gates and does not transform.
  | { kind: 'output'; value: unknown }
  | { kind: 'failed'; evidence: string; truncated?: boolean };

export type WireReport = {
  rung?: string;
  recovered?: { strategy: string; name?: string; truncated: boolean };
  notes?: string[];
};

export type StepToolDescriptor = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ResponseFormat =
  | {
      type: 'json_schema';
      jsonSchema: { name: string; strict: boolean; schema: Record<string, unknown> };
    }
  | { type: 'json_object' };

export type StepRequest = {
  messages: ReadonlyArray<StepInputMessage>;
  tools?: ReadonlyArray<StepToolDescriptor>;
  toolChoice?: 'auto' | 'none' | 'required' | { name: string };
  output?: { accept: z.ZodType; outputTool?: string };
  responseFormat?: ResponseFormat;
  options?: SignalOptions;
};

export type StepResult = {
  content: string;
  toolCalls: StepToolCall[];
  // `reported: false` means the provider sent no usage and the numbers are an estimate:
  // OpenAI-compatible streams do not reliably send the usage frame.
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reported: boolean;
  };
  finishReason: string;
  raw: unknown;
  outcome?: StepOutcome;
  wire?: WireReport;
};

export type CountInput = string | ReadonlyArray<StepInputMessage>;

export type EmbedOptions = {
  dimensions?: number;
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

export type ChoiceQuestion<K extends string = string> = {
  type: 'choice';
  instructions: string;
  criteria: Record<K, string>;
};

// `criteria` lists the levels lowest first; a level is its index.
export type ScoreQuestion = {
  type: 'score';
  instructions: string;
  criteria: readonly string[];
};

// A yes/no, answered as the probability of yes.
export type NoulQuestion = {
  type: 'noul';
  instructions: string;
  criteria?: { true: string; false: string };
};

export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion;
export type Questions = Record<string, Question>;

export type DecideState = string | Record<string, unknown> | readonly unknown[];

export type UncalibratedDecision<Q extends Question> =
  Q extends ChoiceQuestion<infer K> ? { choice: K }
  : Q extends ScoreQuestion ? { level: number }
  : { answer: boolean };

// `level` is the most probable level and `score` the probability-weighted one; `answer`
// is `noul >= 0.5`.
export type CalibratedDecision<Q extends Question> =
  Q extends ChoiceQuestion<infer K> ? { choice: K; probabilities: Record<K, number>; confidence: number }
  : Q extends ScoreQuestion ? { level: number; score: number; probabilities: number[]; confidence: number }
  : { answer: boolean; noul: number };

export type DecideRequest<Qs extends Questions> = {
  state: DecideState;
  questions: Qs;
  options?: { signal?: AbortSignal };
};

export type DecideMeta = {
  model: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; reported: boolean };
  durationMs: number;
  provider: { raw: unknown };
};

// A text model returns picks and no probabilities. The uncalibrated branch has none
// in its type: an invented 1.0 would clear every caller's threshold.
export type DecideResult<Qs extends Questions> =
  | { calibrated: true; decisions: { [N in keyof Qs]: CalibratedDecision<Qs[N]> }; meta: DecideMeta }
  | { calibrated: false; decisions: { [N in keyof Qs]: UncalibratedDecision<Qs[N]> }; meta: DecideMeta };

export type StreamEvent<T> =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; name: string; args: unknown }
  | { type: 'tool_end'; name: string; result: unknown }
  | { type: 'retry'; reason: string; attempt: number }
  | { type: 'error'; error: Error; recovered: boolean }
  | { type: 'done'; response: T; history: Message[]; meta: SignalMeta };

export type StepStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call_delta'; index: number; id?: string; name?: string; argsText: string }
  | { type: 'done'; result: StepResult };

export type StreamOptions = {
  signal?: AbortSignal;
};

export type ProviderStreamDelta =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; index: number; id?: string; name?: string; argsFragment?: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; totalTokens: number }
  | { type: 'finish'; finishReason: string };

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

export type ChatAdapter = {
  kind: 'chat';
  id: string;
  chat: (request: ProviderRequest) => Promise<ProviderResponse>;
  chatStream: (request: ProviderRequest, options?: { signal?: AbortSignal }) => AsyncIterable<ProviderStreamDelta>;
  embed?: (request: EmbedRequest) => Promise<EmbedResponse>;
};

export type DecisionAdapter = {
  kind: 'decisions';
  id: string;
  decide: (request: DecisionRequest, options?: { signal?: AbortSignal }) => Promise<DecisionResponse>;
};

export type ProviderAdapter = ChatAdapter | DecisionAdapter;

export type DecisionRequest = {
  model: string;
  state: DecideState;
  questions: Questions;
};

export type DecisionResponse = {
  model?: string;
  answers: unknown;
  usage?: { inputTokens: number; outputTokens: number };
  raw: unknown;
};
