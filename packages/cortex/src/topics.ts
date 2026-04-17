// ═══════════════════════════════════════════════════════════
// CortexTopics — typed system event topics
// ═══════════════════════════════════════════════════════════
//
// Each system topic carries a phantom type describing its payload.
// The bus uses TypedTopic<T> to infer payload types at emit/on
// call sites — no `as` casts needed.
//
// User-defined topics (from tell_topic, from custom rules) remain
// free-form strings with `unknown` payloads.

import { topic } from './utils/typed-topic';
import type { CortexError, Result } from './types';
import type { Observation } from './schemas/observation.schema';
import type { ActionPlan } from './schemas/action-plan.schema';
import type { LedgerSnapshot } from './manifold/ledger';
import type { EvaluationResult } from './rules/engine';

// ───────────────────────────────────────────────────────────
// Payload types — co-located with the topics they describe
// ───────────────────────────────────────────────────────────

export type ExecuteRequestedPayload = {
  agentId: string;
  input: unknown;
  workflowId: string;
  abort?: AbortSignal;
  stream?: boolean;
};

export type ExecuteCompletedPayload = {
  result: Result<unknown>;
  workflowId: string;
};

export type ExecuteFailedPayload = {
  error: CortexError;
  workflowId: string;
};

export type WorkflowStartedPayload = {
  workflowId: string;
  agentId: string;
  input: unknown;
};

export type WorkflowEndedPayload = {
  workflowId: string;
  result?: unknown;
  error?: CortexError;
  ledger?: LedgerSnapshot;
};

export type TickPayload = {
  workflowId: string;
  tick: number;
};

export type AgentInvokedPayload = {
  agentId: string;
  input: unknown;
};

export type AgentCompletedPayload = {
  agentId: string;
  output: unknown;
};

export type AgentRetryPayload = {
  agentId: string;
  workflowId: string;
  attempt: number;
  nextAttempt: number;
  rawContent: string;
  error: CortexError;
};

export type PlanProducedPayload = {
  workflowId: string;
  agentId: string;
  plan: ActionPlan;
};

export type ConfirmationRequestedPayload = {
  workflowId: string;
  toolId: string;
  input: unknown;
};

export type ConfirmationResponsePayload = {
  toolId: string;
};

export type RuleEvaluatedPayload = {
  result: EvaluationResult;
  accumulators: Record<string, Record<string, unknown>>;
};

export type RuleFiredPayload = {
  ruleId: string;
  effect: unknown;
  accumulators: Record<string, Record<string, unknown>>;
};

export type LlmDeltaPayload = {
  workflowId: string;
  agentId: string;
  text: string;
  tick: number;
  iteration: number;
};

export type ErrorPayload = CortexError;

export type WarningPayload = {
  message: string;
};

// ───────────────────────────────────────────────────────────
// Typed topics
// ───────────────────────────────────────────────────────────

export const CortexTopics = {
  // ─── Execution lifecycle ────────────────────────────────
  executeRequested: topic<ExecuteRequestedPayload>('cortex.execute.requested'),
  executeCompleted: topic<ExecuteCompletedPayload>('cortex.execute.completed'),
  executeFailed: topic<ExecuteFailedPayload>('cortex.execute.failed'),

  // ─── Workflow lifecycle ─────────────────────────────────
  workflowStarted: topic<WorkflowStartedPayload>('cortex.workflow.started'),
  workflowEnded: topic<WorkflowEndedPayload>('cortex.workflow.ended'),

  // ─── Tick lifecycle (plan mode only) ────────────────────
  tickStarted: topic<TickPayload>('cortex.tick.started'),
  tickEnded: topic<TickPayload>('cortex.tick.ended'),

  // ─── Agent lifecycle ────────────────────────────────────
  agentInvoked: topic<AgentInvokedPayload>('cortex.agent.invoked'),
  agentCompleted: topic<AgentCompletedPayload>('cortex.agent.completed'),
  agentRetry: topic<AgentRetryPayload>('cortex.agent.retry'),

  // ─── Tool lifecycle ─────────────────────────────────────
  toolCalled: topic<Observation>('cortex.tool.called'),
  toolObserved: topic<Observation>('cortex.tool.observed'),

  // ─── Observations ───────────────────────────────────────
  observationRecorded: topic<Observation>('cortex.observation.recorded'),

  // ─── Plan ───────────────────────────────────────────────
  planProduced: topic<PlanProducedPayload>('cortex.plan.produced'),
  planGated: topic<unknown>('cortex.plan.gated'),

  // ─── Policy / confirmation ──────────────────────────────
  confirmationRequested: topic<ConfirmationRequestedPayload>('cortex.policy.confirmation.requested'),
  confirmationApproved: topic<ConfirmationResponsePayload>('cortex.policy.confirmation.approved'),
  confirmationDenied: topic<ConfirmationResponsePayload>('cortex.policy.confirmation.denied'),

  // ─── Rules engine ───────────────────────────────────────
  ruleEvaluated: topic<RuleEvaluatedPayload>('cortex.rule.evaluated'),
  ruleFired: topic<RuleFiredPayload>('cortex.rule.fired'),

  // ─── Context ────────────────────────────────────────────
  contextBuilt: topic<unknown>('cortex.context.built'),

  // ─── LLM streaming ──────────────────────────────────────
  llmDelta: topic<LlmDeltaPayload>('cortex.llm.delta'),

  // ─── Errors / warnings ─────────────────────────────────
  error: topic<ErrorPayload>('cortex.error'),
  warning: topic<WarningPayload>('cortex.warning'),

  // ─── Wildcard patterns (plain strings, payload: unknown) ─
  executePattern: 'cortex.execute.*',
  confirmationPattern: 'cortex.policy.confirmation.*',
} as const;

export type CortexTopic = (typeof CortexTopics)[keyof typeof CortexTopics];
