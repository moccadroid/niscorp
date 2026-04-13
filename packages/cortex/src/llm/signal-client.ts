// ═══════════════════════════════════════════════════════════
// SignalClient — the structural interface Cortex requires
// ═══════════════════════════════════════════════════════════
//
// Cortex does not depend on the full @niscorp/signal builder API.
// It only needs two primitives: step() (one model call, no auto
// tool execution) and count() (token estimation). This interface
// is a structural subset of @niscorp/signal's Signal type.
//
// Tests use a stub implementation; production code passes a real
// Signal instance, which satisfies this shape automatically.

export type CortexMessageRole = 'system' | 'user' | 'assistant' | 'tool';

// Tool call attached to an assistant message. The shape mirrors
// Signal's AssistantToolCall (which mirrors OpenAI's tool_calls).
// args is a JSON STRING, not a parsed value, because that's what
// the provider expects on the wire and the structural typing through
// Signal's `Message` type carries it that way.
export type CortexLlmAssistantToolCall = {
  id: string;
  name: string;
  args: string;
};

export type CortexLlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  // Assistant messages may carry tool calls. When present, a
  // matching `tool` message must follow with the result keyed
  // by the same id. Cortex's tool loop builds these turns
  // explicitly between iterations.
  | { role: 'assistant'; content: string; toolCalls?: CortexLlmAssistantToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export type CortexLlmToolDefinition = {
  name: string;
  description: string;
  // JSON Schema (draft-07-ish) for the tool's input. Cortex generates
  // this from the tool's Zod input schema via z.toJSONSchema().
  parameters: Record<string, unknown>;
};

export type CortexLlmToolCall = {
  id: string;
  name: string;
  args: unknown; // Already parsed JSON, per signal.step() contract.
};

export type CortexLlmStepRequest = {
  messages: ReadonlyArray<CortexLlmMessage>;
  tools?: ReadonlyArray<CortexLlmToolDefinition>;
  toolChoice?: 'auto' | 'none' | { name: string };
  // Pass-through provider options. Kept opaque so Cortex doesn't
  // need to know which provider is underneath.
  options?: Record<string, unknown>;
};

export type CortexLlmStepResult = {
  content: string;
  toolCalls: ReadonlyArray<CortexLlmToolCall>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason: string;
};

export type CortexLlmCountInput = string | ReadonlyArray<CortexLlmMessage>;

export type SignalClient = {
  step: (request: CortexLlmStepRequest) => Promise<CortexLlmStepResult>;
  count: (input: CortexLlmCountInput) => Promise<number>;
};
