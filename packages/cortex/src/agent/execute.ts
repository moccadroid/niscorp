// ═══════════════════════════════════════════════════════════
// executeAgent — mode dispatch + tick loop
// ═══════════════════════════════════════════════════════════
//
// The single entry point for running an agent. Dispatches to
// the right parser by mode (text / structured / plan) and
// drives the plan-mode tick loop. The tool loop, retry wrapper,
// and raw invocation are in their own focused modules.
//
// Per-workflow runtime state lives on `WorkflowContext`: abort
// signal, streaming intent, live policy (mutable by rules), and
// rule injections. See manifold/workflow-context.ts.

import type { AgentDefinition } from './define-agent';
import type { Bus, Result } from '../types';
import type { ContextSpec } from '../context/types';
import type { SignalClient } from '../llm/signal-client';
import type { Ledger } from '../manifold/ledger';
import type { Registry } from '../manifold/registry';
import type { WorkflowContext } from '../manifold/workflow-context';
import type { TokenEstimationMode } from '../context/tokens';
import type { CortexError } from '../errors/cortex.errors';
import type { Observation, ActionPlan } from '../schemas';
import type { StateStore } from '../store/types';
import { parseTextOutput, parseStructuredOutput, parsePlanOutput, trustAgentReturn } from './output-parser';
import { CortexTopics, type ExecuteFailedPayload, type ExecuteCompletedPayload } from '../topics';
import { newCorrelationId } from '../utils/id';
import { runPlan, type ExecuteAgentForDelegation } from '../runtime/plan-executor';
import { runWithRetries } from './retry';
import { ok, err, makeError } from '../errors/cortex.errors';

const DEFAULT_MAX_TICKS = 20;
const DEFAULT_MAX_PLAN_DEPTH = 2;

// ───────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────

export type ExecuteAgentDeps = {
  registry: Registry;
  llm: SignalClient;
  ledger: Ledger;
  bus: Bus;
  stateStore: StateStore;
  state: ReadonlyMap<string, unknown>;
  packBudgetTokens?: number;
  tokenMode?: TokenEstimationMode;
  defaultContextSpec?: ContextSpec;
};

export type ExecuteAgentArgs<T> = {
  agent: AgentDefinition<T>;
  input: unknown;
  workflow: WorkflowContext;
  tick?: number;
};

export type ExecuteAgentOutcome<T> = {
  output: T | string;
  observations: ReadonlyArray<Observation>;
  iterations: number;
};

// ───────────────────────────────────────────────────────────
// Public: executeAgent
// ───────────────────────────────────────────────────────────

export const executeAgent = async <T>(
  deps: ExecuteAgentDeps,
  args: ExecuteAgentArgs<T>,
): Promise<Result<T>> => {
  const { agent, input, workflow } = args;
  const workflowId = workflow.workflowId;
  const tick = args.tick ?? 0;
  const ctx = { agentId: agent.agentId, workflowId };

  workflow.emit(CortexTopics.agentInvoked, { agentId: agent.agentId, input });

  const emitFinalError = (error: CortexError): void => {
    workflow.emit(CortexTopics.error, error);
  };
  const emitCompleted = (output: unknown): void => {
    workflow.emit(CortexTopics.agentCompleted, { agentId: agent.agentId, output });
  };

  // ─── text mode ────────────────────────────────────────────
  if (agent.config.outputMode === 'text') {
    const result = await runWithRetries<T>(
      deps, agent, workflow, input, tick, [],
      (content) => parseTextOutput<T>(content),
    );
    if (!result.ok) { emitFinalError(result.error); return result; }
    emitCompleted(result.data);
    return result;
  }

  // ─── structured mode ──────────────────────────────────────
  if (agent.config.outputMode === 'structured') {
    if (!agent.config.outputSchema) {
      const error = makeError(
        'output_validation_failed',
        `Agent '${agent.agentId}' is structured-mode but has no outputSchema`,
        ctx,
      );
      emitFinalError(error);
      return err(error);
    }
    const schema = agent.config.outputSchema;
    const result = await runWithRetries<T>(
      deps, agent, workflow, input, tick, [],
      (content) => parseStructuredOutput<T>(content, schema, ctx),
    );
    if (!result.ok) { emitFinalError(result.error); return result; }
    emitCompleted(result.data);
    return result;
  }

  // ─── plan mode: tick loop ─────────────────────────────────
  const maxTicks = agent.config.maxTicks ?? DEFAULT_MAX_TICKS;

  const delegate: ExecuteAgentForDelegation = async ({ agentId: targetId, input: subInput, workflowId: wf }) => {
    const subCorrelationId = newCorrelationId();
    const completionPromise = deps.bus.waitFor(CortexTopics.executePattern, {
      filter: (e) =>
        e.meta.correlationId === subCorrelationId &&
        (e.topic === CortexTopics.executeCompleted || e.topic === CortexTopics.executeFailed),
      // Bound the delegation by the running workflow's configured budget, not a
      // hardcoded ceiling — same knob as the top-level run deadline.
      timeoutMs: deps.ledger.budgetOf(workflowId).maxDurationMs,
      signal: workflow.abort.signal,
    });
    deps.bus.emit(
      CortexTopics.executeRequested,
      { agentId: targetId, input: subInput, workflowId: wf },
      { correlationId: subCorrelationId, workflowId: wf },
    );
    try {
      const completion = await completionPromise;
      if (completion.topic === CortexTopics.executeFailed) {
        const payload = completion.payload as ExecuteFailedPayload;
        return { ok: false, error: payload.error };
      }
      const payload = completion.payload as ExecuteCompletedPayload;
      if (!payload.result.ok) return { ok: false, error: payload.result.error };
      return { ok: true, data: payload.result.data };
    } catch (e) {
      return {
        ok: false,
        error: makeError(
          'timeout',
          `ask_agent delegation to '${targetId}' timed out or was aborted`,
          { agentId: targetId, workflowId: wf, cause: e },
        ),
      };
    }
  };

  const carriedObservations: Observation[] = [];
  let currentTick = tick;
  while (currentTick < maxTicks) {
    deps.ledger.addTick(workflowId);
    workflow.emit(CortexTopics.tickStarted, { workflowId, tick: currentTick });

    const planResultParsed = await runWithRetries<ActionPlan>(
      deps, agent, workflow, input, currentTick, carriedObservations,
      (content) => parsePlanOutput<ActionPlan>(content, ctx),
    );
    if (!planResultParsed.ok) {
      emitFinalError(planResultParsed.error);
      return err(planResultParsed.error);
    }
    const plan = planResultParsed.data;
    workflow.emit(CortexTopics.planProduced, { workflowId, agentId: agent.agentId, plan });

    const planResult = await runPlan(
      {
        registry: deps.registry,
        ledger: deps.ledger,
        bus: deps.bus,
        stateStore: deps.stateStore,
        delegate,
      },
      {
        plan,
        workflow,
        agentId: agent.agentId,
        tick: currentTick,
        depth: 0,
        maxPlanDepth: DEFAULT_MAX_PLAN_DEPTH,
      },
    );
    if (planResult.error) {
      workflow.emit(CortexTopics.error, planResult.error);
      return err(planResult.error);
    }
    for (const obs of planResult.observations) carriedObservations.push(obs);

    workflow.emit(CortexTopics.tickEnded, { workflowId, tick: currentTick });

    if (planResult.finalized) {
      workflow.emit(CortexTopics.agentCompleted, { agentId: agent.agentId, output: planResult.finalResult });
      return ok(trustAgentReturn<T>(planResult.finalResult));
    }
    currentTick += 1;
  }

  const error: CortexError = makeError(
    'ticks_exceeded',
    `Plan-mode agent exceeded ${maxTicks} ticks without finalizing`,
    { agentId: agent.agentId, workflowId },
  );
  workflow.emit(CortexTopics.error, error);
  return err(error);
};
