// ═══════════════════════════════════════════════════════════
// @niscorp/cortex — public API
// ═══════════════════════════════════════════════════════════
//
// One loop, one output contract (the envelope), typed events,
// code-hook gates, and a thin manifold. See DESIGN.md.

// ─── Definitions ────────────────────────────────────────────
export { defineAgent } from './agent/define-agent';
export type { AgentConfig, AgentDefinition, OutputConfig, RunArgs } from './agent/define-agent';

export { defineTool } from './tool/define-tool';
export type { ToolConfig, ToolDefinition, ToolContext } from './tool/define-tool';

// ─── Execution ──────────────────────────────────────────────
export { resumeRun } from './agent/run';
export type { RunHandle, RunOptions, RunSnapshot } from './agent/run';
export type { ResolvedPreview } from './agent/preview';

// ─── Composition ────────────────────────────────────────────
export { createManifold } from './manifold/manifold';
export type { Manifold, ManifoldConfig, Registrable, ManifoldAsToolOptions } from './manifold/manifold';
export { asTool } from './manifold/as-tool';
export type { AsToolOptions } from './manifold/as-tool';
export type { ErasedAgent, ErasedRunOptions } from './manifold/types';

// ─── The envelope + results ─────────────────────────────────
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

// ─── Events ─────────────────────────────────────────────────
export type { CortexEvent, CortexEventBody, ApprovalRequest } from './events/types';

// ─── Schema-issue formatting — union errors that teach ──────
export { flattenSchemaIssues } from './utils/schema-issues';
export type { SchemaIssue } from './utils/schema-issues';

// ─── Context — entries and the producers that make them ─────
export { schemaDoc } from './context/schema-doc';
export { inputMessages, estimateTokens, toolGuidesMessage } from './context/assemble';
export type { ContextEntry, Producer, ProducerArgs, RunInput, AgentInfo } from './context/assemble';

// ─── Gates, hooks, stop conditions ──────────────────────────
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
export { stepCount, tokens, duration, outputRetries, DEFAULT_STOP_CONDITIONS } from './gates/stop';
