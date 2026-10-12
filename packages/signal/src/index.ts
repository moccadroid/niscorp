export { createSignal } from './signal';
export type { Signal, SignalDescription } from './signal';

export { defineTool } from './tools/define-tool';

export { SignalError, ErrorCode } from './errors';

export { providerRegistry, chatProviderEntry, modelRegistry, modelEntry, modelKey, UNMEASURED_MODEL } from './registry';
export type { ProviderEntry, ChatProviderEntry, DecisionProviderEntry, ModelEntry } from './registry';

export type { StepOutcome, WireReport, Rejection } from './types';
export type { WireStrategy, ErrorWireStrategy, ResponseWireStrategy } from './wire/strategies';
export { routeResponse, routeRejection } from './wire/router';
export {
  extractJson,
  repairEscapeDamage,
  decodeJsonish,
  deepDecodeJsonish,
  closeTruncated,
  isTruncatedJson,
} from './wire/repair';
export type { ExtractResult } from './wire/repair';

export { resolveTransport, RESPOND_TOOL_NAME } from './transport/resolve';
export type { OutputTransport, ResolvedTransport, TransportSpec } from './transport/resolve';

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
  StepRequest,
  StepResult,
  StepToolCall,
  StepToolDescriptor,
  StepInputMessage,
  ResponseFormat,
  CountInput,
  EmbedOptions,
  EmbedRequest,
  EmbedResponse,
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
