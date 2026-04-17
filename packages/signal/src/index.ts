// ═══════════════════════════════════════════════════════════
// @niscorp/signal — Universal LLM Abstraction
// ═══════════════════════════════════════════════════════════

// Core
export { createSignal } from './signal';
export type { Signal } from './signal';

// Tools
export { defineTool } from './tools/define-tool';

// Errors
export { SignalError, ErrorCode } from './errors';

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
  CountInput,
} from './types';

export type { SignalConfig, CustomProviderConfig } from './config';
