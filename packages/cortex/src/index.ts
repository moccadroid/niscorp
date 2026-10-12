export { defineAgent } from './agent/define-agent';
export type { AgentConfig, AgentDefinition, OutputConfig, RunArgs } from './agent/define-agent';

export { defineTool } from './tool/define-tool';
export type { ToolConfig, ToolDefinition, ToolContext } from './tool/define-tool';

export { resumeRun } from './agent/run';
export type { RunHandle, RunOptions, RunSnapshot } from './agent/run';
export type { ResolvedPreview } from './agent/preview';

export { createManifold } from './manifold/manifold';
export type { Manifold, ManifoldConfig, Registrable, ManifoldAsToolOptions } from './manifold/manifold';
export { asTool } from './manifold/as-tool';
export type { AsToolOptions } from './manifold/as-tool';
export type { ErasedAgent, ErasedRunOptions } from './manifold/types';

export type {
  Envelope,
  RunResult,
  RunMeta,
  Usage,
  OutputStrategy,
  StopReason,
  CortexError,
  ErrorCode,
  ToolObservation,
  SignalClient,
  Unsubscribe,
} from './types';
export type { ResponseMode } from './schemas/envelope.schema';
export type { OutputValidator } from './loop/loop';

export type { CortexEvent, CortexEventBody, ApprovalRequest } from './events/types';

export { flattenSchemaIssues } from './utils/schema-issues';
export type { SchemaIssue } from './utils/schema-issues';

export { schemaDoc } from './context/schema-doc';
export { inputMessages, estimateTokens, toolGuidesMessage } from './context/assemble';
export type { ContextEntry, Producer, ProducerArgs, RunInput, AgentInfo } from './context/assemble';
export type { Message } from '@niscorp/signal';

export { policyGate } from './gates/policy';
export type { ToolPolicy } from './gates/policy';
export type {
  ToolGate,
  GateDecision,
  ToolCallInfo,
  RunCtx,
  ToolResultHook,
  PrepareStep,
  PrepareStepInfo,
  PrepareStepResult,
  StopCondition,
  StopVerdict,
  RunProgress,
} from './gates/types';
export { stepCount, tokens, duration, outputRetries, repeatedCalls, DEFAULT_STOP_CONDITIONS } from './gates/stop';
