// ═══════════════════════════════════════════════════════════
// @niscorp/cortex — public API
// ═══════════════════════════════════════════════════════════
//
// Phase A surface. The execution path (tool loop, agent execute,
// runAgentStandalone) lands in the next session once the upstream
// Signal additions are in place. previewContext, schemas, registry,
// bus, and the context pipeline are all live and tested.

// Definitions
export { defineAgent } from './agent/define-agent';
export type { AgentConfig, AgentDefinition } from './agent/define-agent';

export { defineTool } from './tool/define-tool';
export type { ToolConfig, ToolDefinition, ToolContext } from './tool/define-tool';

// Agent execution
export { executeAgent } from './agent/execute';
export type { ExecuteAgentArgs, ExecuteAgentDeps, ExecuteAgentOutcome } from './agent/execute';
export { runAgentStandalone } from './agent/standalone';
export type { StandaloneOptions, RetryEventPayload } from './agent/standalone';
export {
  parseTextOutput,
  parseStructuredOutput,
  parsePlanOutput,
  trustAgentReturn,
} from './agent/output-parser';

// Tool loop
export { runToolLoop } from './tool-loop/loop';
export type { ToolLoopInput, ToolLoopResult } from './tool-loop/loop';

// LLM client contract
export type {
  SignalClient,
  CortexLlmMessage,
  CortexLlmToolDefinition,
  CortexLlmToolCall,
  CortexLlmStepRequest,
  CortexLlmStepResult,
  CortexLlmCountInput,
  CortexMessageRole,
} from './llm';

// Manifold
export {
  createManifold,
  createBus,
  createRegistry,
  createLedger,
  DEFAULT_BUDGET,
} from './manifold';
export type {
  Manifold,
  ManifoldConfig,
  ManifoldHooks,
  ExecuteOptions,
  CreateBusOptions,
  Registry,
  Ledger,
  LedgerBudget,
  LedgerSnapshot,
  LedgerEntry,
} from './manifold';

// Stores
export { createMemoryStateStore, createMemoryEventLog } from './store';
export type { StateStore, EventLog, EventLogReadOptions } from './store';

// Context engineering
export {
  runPipeline,
  createProducerState,
  fuzzyCount,
  exactCount,
  counterFor,
  truncateCompressor,
  systemProducer,
  inputProducer,
  toolsProducer,
  budgetProducer,
  historyProducer,
} from './context';
export type {
  BuildContext,
  Compressor,
  ContextProducer,
  ContextSpec,
  ProducerState,
  ReadonlyRegistry,
  RegistryAgentView,
  RegistryToolView,
  ResolvedChunk,
  ResolvedContext,
  RunPipelineOptions,
  TokenCounter,
  TokenEstimationMode,
  ToolsProducerOptions,
  HistoryProducerOptions,
  HistoryEntry,
} from './context';

// Schemas (Zod) and inferred types
export {
  ActionPlanSchema,
  PlanNodeSchema,
  ObservationSchema,
  ContentChunkSchema,
  PlanNodeKindSchema,
  ToolRiskLevelSchema,
  ToolConfigSchema,
  AgentOutputModeSchema,
  AgentConfigSchema,
  PolicyConfigSchema,
} from './schemas';
export type {
  ActionPlan,
  PlanNode,
  PlanNodeMeta,
  UseToolNode,
  AskAgentNode,
  TellTopicNode,
  WaitNode,
  ParallelNode,
  ReflectNode,
  FinalNode,
  Observation,
  ContentChunk,
  ContentPart,
  PlanNodeKind,
  ToolRiskLevel,
  ToolConfigInput,
  ToolConfigParsed,
  AgentOutputMode,
  AgentConfigInput,
  AgentConfigParsed,
  PolicyConfig,
} from './schemas';

// Plan execution + policy gate (Phase B)
export { runPlan } from './runtime/plan-executor';
export type {
  PlanExecutorDeps,
  PlanExecutorInput,
  PlanExecutorResult,
  ExecuteAgentForDelegation,
  DelegationResult,
} from './runtime/plan-executor';
export { checkBudget, checkTool, checkAgent } from './runtime/gate';
export type { GateInput, GateDecision, GateDenialReason, CheckToolInput, CheckAgentInput } from './runtime/gate';

// Plan-mode producers
export { actionContractProducer, agentsProducer, observationsProducer } from './context';
export type { AgentsProducerOptions, ObservationsProducerOptions } from './context';

// Errors and Result
export { makeError, ok, err, isOk, isErr, throwCortex } from './errors/cortex.errors';
export type { CortexError, ErrorCode } from './errors/cortex.errors';

// Bus and shared types
export type {
  Bus,
  BusEvent,
  BusHandler,
  EventMeta,
  Unsubscribe,
  WaitForOptions,
  Result,
  BudgetState,
  ReadonlyLedger,
} from './types';

// System event topics
export { CortexTopics, type CortexTopic } from './topics';

// Rules engine (Phase C)
export {
  defineRule,
  createRulesEngine,
  createEffectRegistry,
  evaluateCondition,
  attachAccumulators,
  isInjectEffect,
  isAbortEffect,
  isDenyEffect,
  isCallEffect,
  RuleDefinitionSchema,
  RuleEntrySchema,
  RuleEffectSchema,
  ConditionSchema,
  AccumulatorDefSchema,
} from './rules';
export type {
  RegisteredRule,
  EvaluationResult,
  RulesEngine,
  RuleEffect,
  EffectContext,
  EffectHandler,
  EffectRegistry,
  ConditionScope,
  AccumulatorDef,
  WatchDefs,
  AccumulatorState,
  RuleDefinition,
  RuleDefinitionInput,
  RuleEntry,
} from './rules';

// Utils
export { matchesTopic, compileTopicPattern } from './utils/wildcard';
export { newWorkflowId, newCorrelationId, newRunId, newEventId } from './utils/id';
