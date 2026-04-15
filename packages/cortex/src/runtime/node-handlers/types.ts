// ═══════════════════════════════════════════════════════════
// Node handler types — shared by all plan-node handlers
// ═══════════════════════════════════════════════════════════

import type { Bus } from '../../types';
import type { ActionPlan, PlanNode, Observation } from '../../schemas';
import type { Registry } from '../../manifold/registry';
import type { Ledger } from '../../manifold/ledger';
import type { WorkflowContext } from '../../manifold/workflow-context';
import type { StateStore } from '../../store/types';
import type { CortexError } from '../../errors/cortex.errors';
import type { GateDecision } from '../gate';

export type ExecuteAgentForDelegation = (args: {
  agentId: string;
  input: unknown;
  workflowId: string;
  parentDepth: number;
}) => Promise<DelegationResult>;

export type DelegationResult =
  | { ok: true; data: unknown }
  | { ok: false; error: CortexError };

export type PlanExecutorDeps = {
  registry: Registry;
  ledger: Ledger;
  bus: Bus;
  stateStore: StateStore;
  delegate: ExecuteAgentForDelegation;
};

export type PlanExecutorInput = {
  plan: ActionPlan;
  workflow: WorkflowContext;
  agentId: string;
  tick: number;
  depth: number;
  maxPlanDepth: number;
};

export type PlanExecutorResult = {
  finalized: boolean;
  finalResult?: unknown;
  observations: Observation[];
};

// Result from a single node handler. Parallel returns child
// observations instead of a single observation.
export type NodeHandlerResult =
  | { observation: Observation }
  | { childObservations: Observation[]; finalized: boolean; finalResult?: unknown };

export type NodeHandler = (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  node: PlanNode,
  runInner: RunPlanInner,
  idempotencyCache: Map<string, Observation>,
) => Promise<NodeHandlerResult>;

// The recursive inner walk — passed to parallel so it can recurse.
export type RunPlanInner = (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  idempotencyCache: Map<string, Observation>,
) => Promise<PlanExecutorResult>;

export const now = (): number => Date.now();

export const denialMessage = (decision: GateDecision): string => {
  if (decision.allowed) return '';
  const detail = decision.detail ? ` (${decision.detail})` : '';
  return `gate_denied:${decision.reason}${detail}`;
};
