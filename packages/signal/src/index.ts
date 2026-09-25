// ═══════════════════════════════════════════════════════════
// @niscorp/signal — Universal LLM Abstraction
// ═══════════════════════════════════════════════════════════

// Core
export { createSignal } from './signal';
export type { Signal, SignalDescription } from './signal';

// Tools
export { defineTool } from './tools/define-tool';

// Errors
export { SignalError, ErrorCode } from './errors';

// Registry — what an endpoint does (providerRegistry) and what a model does on
// it, as measured (modelRegistry). Read-only consumers: preview instruments,
// capability-aware orchestrators, apps that offer a model picker.
export { providerRegistry, chatProviderEntry, modelRegistry, modelEntry, modelKey, UNMEASURED_MODEL } from './registry';
export type { ProviderEntry, ChatProviderEntry, DecisionProviderEntry, ModelEntry } from './registry';

// Wire layer — routed outcomes and the strategy seam. Consumers switch
// on StepResult.outcome; strategies are selected via registry entries.
export type { StepOutcome, WireReport, Rejection } from './types';
export type { WireStrategy, ErrorWireStrategy, ResponseWireStrategy } from './wire/strategies';
// The router itself — exported so scripted test clients (cortex's
// stub signal) route exactly like production.
export { routeResponse, routeRejection } from './wire/router';
// The repair mechanisms — pure, rescue-only, validation-gated at the
// call site. Exported for callers that gate repairs with their OWN
// schemas (cortex's envelope deep-decode, tool-input rescue).
export {
  extractJson,
  repairEscapeDamage,
  decodeJsonish,
  deepDecodeJsonish,
  closeTruncated,
  isTruncatedJson,
} from './wire/repair';
export type { ExtractResult } from './wire/repair';

// Transport — how the caller's output contract travels on THIS
// provider. Pure resolution: previews resolve exactly like runs.
export { resolveTransport, RESPOND_TOOL_NAME } from './transport/resolve';
export type { OutputTransport, ResolvedTransport, TransportSpec } from './transport/resolve';

// Types
export type {
  Message,
  AssistantToolCall,
  ContentPart,
  ImageSource,
  Tool,
  ToolConfig,
  ToolCallRecord,
  Capabilities,
  EndpointCapabilities,
  ModelCapabilities,
  ReasoningEffort,
  SignalOptions,
  SignalResult,
  SignalMeta,
  StreamEvent,
  StepStreamEvent,
  StreamOptions,
  ProviderError,
  // Step API (single model call, no auto tool execution)
  StepRequest,
  StepResult,
  StepToolCall,
  StepToolDescriptor,
  StepInputMessage,
  ResponseFormat,
  CountInput,
  // Embedding
  EmbedOptions,
  EmbedRequest,
  EmbedResponse,
  // Decisions
  Question,
  Questions,
  ChoiceQuestion,
  ScoreQuestion,
  NoulQuestion,
  DecideState,
  DecideRequest,
  DecideResult,
  DecideMeta,
  CalibratedDecision,
  UncalibratedDecision,
} from './types';

export type {
  SignalConfig,
  CustomProviderConfig,
  CustomChatProviderConfig,
  CustomDecisionProviderConfig,
} from './config';

export { REASONING_EFFORTS } from './types';
