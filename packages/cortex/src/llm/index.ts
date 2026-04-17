export type { SignalClient } from './signal-client';

// Re-export Signal's LLM types under the CortexLlm* naming used
// throughout the codebase. These are re-exports — not redefinitions —
// of Signal's types, so the two packages share a single source of
// truth. Cortex consumers can type a SignalClient handler without
// importing from @niscorp/signal directly.
export type {
  Message as CortexLlmMessage,
  AssistantToolCall as CortexLlmAssistantToolCall,
  StepRequest as CortexLlmStepRequest,
  StepResult as CortexLlmStepResult,
  StepToolCall as CortexLlmToolCall,
  StepToolDescriptor as CortexLlmToolDefinition,
  StepStreamEvent as CortexLlmStreamEvent,
  StreamOptions as CortexLlmStreamOptions,
  CountInput as CortexLlmCountInput,
} from '@niscorp/signal';
