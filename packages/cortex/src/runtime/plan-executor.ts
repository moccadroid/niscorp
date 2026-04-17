// ═══════════════════════════════════════════════════════════
// Plan executor — depth-first walk over an ActionPlan
// ═══════════════════════════════════════════════════════════
//
// The walker dispatches each node to a handler in node-handlers/.
// Per-node logic (gating, tool execution, delegation, etc.) lives
// in focused handler files. This file owns only:
//   1. Depth validation
//   2. The walk loop (abort, idempotency, dispatch, observation recording)
//   3. The public entry point

import type { ActionPlan, PlanNode, Observation } from '../schemas';
import type { CortexError } from '../errors/cortex.errors';
import { makeError } from '../errors/cortex.errors';
import { recordObservation } from '../utils/observation';
import {
  type PlanExecutorDeps,
  type PlanExecutorInput,
  type PlanExecutorResult,
  now,
} from './node-handlers/types';
import { executeUseTool } from './node-handlers/use-tool.handler';
import { executeAskAgent } from './node-handlers/ask-agent.handler';
import { executeTellTopic } from './node-handlers/tell-topic.handler';
import { executeWait } from './node-handlers/wait.handler';
import { executeReflect } from './node-handlers/reflect.handler';
import { executeParallel } from './node-handlers/parallel.handler';
import { executeFinal } from './node-handlers/final.handler';

// Re-export types that execute.ts depends on.
export type { ExecuteAgentForDelegation, DelegationResult, PlanExecutorDeps, PlanExecutorInput, PlanExecutorResult } from './node-handlers/types';

// ───────────────────────────────────────────────────────────
// Depth validation
// ───────────────────────────────────────────────────────────

const validateDepth = (nodes: ActionPlan, current: number, max: number): CortexError | undefined => {
  if (current > max) {
    return makeError('plan_depth_exceeded', `Plan exceeds max depth ${max}`);
  }
  for (const node of nodes) {
    if (node.kind === 'parallel') {
      const error = validateDepth(node.branches, current + 1, max);
      if (error) return error;
    }
  }
  return undefined;
};

// ───────────────────────────────────────────────────────────
// Node dispatch
// ───────────────────────────────────────────────────────────

const dispatchNode = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  node: PlanNode,
  idempotencyCache: Map<string, Observation>,
) => {
  switch (node.kind) {
    case 'use_tool': return executeUseTool(deps, input, node);
    case 'ask_agent': return executeAskAgent(deps, input, node);
    case 'tell_topic': return executeTellTopic(deps, input, node);
    case 'wait': return executeWait(deps, input, node);
    case 'reflect': return executeReflect(deps, input, node);
    case 'parallel': return executeParallel(deps, input, node, runPlanInner, idempotencyCache);
    case 'final': return executeFinal(input, node);
  }
};

// ───────────────────────────────────────────────────────────
// Plan walker (recursive — used by parallel branches)
// ───────────────────────────────────────────────────────────

const runPlanInner = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  idempotencyCache: Map<string, Observation>,
): Promise<PlanExecutorResult> => {
  const workflowId = input.workflow.workflowId;
  const observations: Observation[] = [];

  for (const node of input.plan) {
    if (input.workflow.abort.signal.aborted) {
      observations.push({
        stepKind: 'use_tool',
        durationMs: 0,
        error: 'aborted',
        timestamp: now(),
        workflowId,
        depth: input.depth,
        tick: input.tick,
      });
      return { finalized: false, observations };
    }

    // Idempotency: if the node has a key and we've already executed
    // it in this runPlan call, return the cached observation.
    const hasMetaKey = node.kind === 'use_tool' || node.kind === 'ask_agent' || node.kind === 'tell_topic' || node.kind === 'wait';
    const idemKey = hasMetaKey ? node.idempotencyKey : undefined;
    if (idemKey) {
      const cached = idempotencyCache.get(idemKey);
      if (cached) {
        observations.push(cached);
        recordObservation(input.workflow, cached);
        continue;
      }
    }

    const result = await dispatchNode(deps, input, node, idempotencyCache);

    // Parallel returns child observations directly.
    if ('childObservations' in result) {
      for (const obs of result.childObservations) {
        observations.push(obs);
        recordObservation(input.workflow, obs);
      }
      if (result.finalized) {
        return { finalized: true, finalResult: result.finalResult, observations };
      }
      continue;
    }

    // Single-observation handlers.
    const obs = result.observation;
    if (idemKey) idempotencyCache.set(idemKey, obs);
    observations.push(obs);
    recordObservation(input.workflow, obs);

    if (node.kind === 'final') {
      return { finalized: true, finalResult: obs.result, observations };
    }
  }

  return { finalized: false, observations };
};

// ───────────────────────────────────────────────────────────
// Public entry point
// ───────────────────────────────────────────────────────────

export const runPlan = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
): Promise<PlanExecutorResult & { error?: CortexError }> => {
  const depthError = validateDepth(input.plan, input.depth, input.maxPlanDepth);
  if (depthError) {
    return { finalized: false, observations: [], error: depthError };
  }
  const idempotencyCache = new Map<string, Observation>();
  return runPlanInner(deps, input, idempotencyCache);
};
