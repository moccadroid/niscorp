// ═══════════════════════════════════════════════════════════
// executeAgent — the single agent execution path
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §4.3 / §7. There is exactly one execution path.
// Standalone (via runAgentStandalone) and manifold-mode (via
// manifold.execute) both call into this function. The difference
// is just whether the caller-supplied Manifold is a real one or
// a micro-manifold.
//
// Three execution modes branch here:
//   - text       → tool loop, return string
//   - structured → tool loop, parse JSON, validate via outputSchema
//   - plan       → tick loop: tool loop → ActionPlan → plan executor
//                  → repeat until final or maxTicks
//
// The WorkflowContext carries all per-workflow runtime state:
// abort signal, live policy (mutable by rules), and injections.
// No threading of policy/abort/denials — the tool loop and plan
// executor read from the shared WorkflowContext on every iteration.

import type { AgentDefinition } from './define-agent';
import type { Bus, BudgetState, Result } from '../types';
import type { ContextProducer, ContextSpec } from '../context/types';
import type { SignalClient } from '../llm/signal-client';
import type { Ledger } from '../manifold/ledger';
import type { Registry } from '../manifold/registry';
import type { WorkflowContext } from '../manifold/workflow-context';
import type { TokenEstimationMode } from '../context/tokens';
import type { ToolDefinition } from '../tool/define-tool';
import type { CortexError } from '../errors/cortex.errors';
import type { Observation, ActionPlan, ContentChunk } from '../schemas';
import type { StateStore } from '../store/types';
import { runToolLoop, type ToolLoopResult } from '../tool-loop/loop';
import { parseTextOutput, parseStructuredOutput, parsePlanOutput, trustAgentReturn } from './output-parser';
import { CortexTopics, type ExecuteFailedPayload, type ExecuteCompletedPayload } from '../topics';
import { newCorrelationId } from '../utils/id';
import { defaultContextSpecFor } from '../context/defaults';
import { runPlan, type ExecuteAgentForDelegation } from '../runtime/plan-executor';
import { ok, err, makeError } from '../errors/cortex.errors';

const DEFAULT_PACK_BUDGET_TOKENS = 32_000;
const DEFAULT_MAX_TOOL_ITERATIONS = 10;
const DEFAULT_MAX_TICKS = 20;
const DEFAULT_MAX_PLAN_DEPTH = 2;
const DEFAULT_MAX_OUTPUT_RETRIES = 2;

const resolveTools = (
  registry: Registry,
  whitelist: ReadonlyArray<string> | undefined,
): ToolDefinition[] => {
  const all = Array.from(registry.asReadonly().listTools()).map((view) =>
    registry.requireTool(view.id),
  );
  if (!whitelist) return all;
  if (whitelist.length === 1 && whitelist[0] === '*') return all;
  const allow = new Set(whitelist);
  return all.filter((t) => allow.has(t.toolId));
};

const snapshotBudget = (ledger: Ledger, workflowId: string): BudgetState => {
  const s = ledger.snapshot(workflowId);
  return {
    tokensUsed: s.tokensUsed,
    tokensRemaining: s.tokensRemaining,
    ticksUsed: s.ticksUsed,
    ticksRemaining: s.ticksRemaining,
    toolCallsUsed: s.toolCallsUsed,
  };
};

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
// Inner: one tool-loop run + output parse
// ───────────────────────────────────────────────────────────

type FailedAttempt = {
  attempt: number;
  rawContent: string;
  error: CortexError;
};

const retryFeedbackProducer = (attempts: ReadonlyArray<FailedAttempt>): ContextProducer => ({
  id: 'cortex.retry-feedback',
  priority: 95,
  build: (): ContentChunk[] => {
    if (attempts.length === 0) return [];
    const lines: string[] = ['## Your previous attempts failed validation'];
    lines.push(
      'Each entry below shows what you returned and why it was rejected. Fix the specific issues and respond with the corrected JSON only. No prose. No markdown fences.',
    );
    lines.push('');
    for (const entry of attempts) {
      lines.push(`### Attempt ${entry.attempt}`);
      lines.push('Your output was:');
      lines.push('```json');
      lines.push(entry.rawContent);
      lines.push('```');
      lines.push('Validation error:');
      lines.push(entry.error.message);
      lines.push('');
    }
    return [
      {
        role: 'system',
        content: lines.join('\n'),
        source: 'cortex.retry-feedback',
        tags: ['retry', 'validation-feedback'],
      },
    ];
  },
});

type RawRunResult =
  | { ok: true; loop: ToolLoopResult }
  | { ok: false; error: CortexError };

const runRawInvocation = async (
  deps: ExecuteAgentDeps,
  agent: AgentDefinition<unknown>,
  workflow: WorkflowContext,
  input: unknown,
  tick: number,
  carriedObservations: ReadonlyArray<Observation>,
  extraInlineProducers: ReadonlyArray<ContextProducer>,
): Promise<RawRunResult> => {
  const workflowId = workflow.workflowId;
  const spec =
    agent.config.context ??
    deps.defaultContextSpec ??
    defaultContextSpecFor(agent.config.outputMode, agent.config.instructions, agent.config.tools);
  const registryProducers = deps.registry.producersFor(agent.agentId);
  const producers = [...spec.producers, ...registryProducers, ...extraInlineProducers];
  const tools = resolveTools(deps.registry, agent.config.tools);
  const budget = snapshotBudget(deps.ledger, workflowId);

  let loopResult: Awaited<ReturnType<typeof runToolLoop>>;
  try {
    loopResult = await runToolLoop({
      agentId: agent.agentId,
      workflow,
      tick,
      input,
      producers,
      packBudgetTokens: spec.budgetTokens ?? deps.packBudgetTokens ?? DEFAULT_PACK_BUDGET_TOKENS,
      tokenMode: deps.tokenMode ?? 'fuzzy',
      maxToolIterations: agent.config.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS,
      availableTools: tools,
      registry: deps.registry.asReadonly(),
      fullRegistry: deps.registry,
      state: deps.state,
      budget,
      llm: deps.llm,
      ledger: deps.ledger,
      bus: deps.bus,
      seedObservations: carriedObservations,
    });
  } catch (e) {
    return {
      ok: false,
      error: makeError(
        'model_call_failed',
        e instanceof Error ? e.message : String(e),
        { agentId: agent.agentId, workflowId, cause: e },
      ),
    };
  }
  if (!loopResult.ok) return { ok: false, error: loopResult.error };
  return { ok: true, loop: loopResult.data };
};

const runWithRetries = async <T>(
  deps: ExecuteAgentDeps,
  agent: AgentDefinition<unknown>,
  workflow: WorkflowContext,
  input: unknown,
  tick: number,
  carriedObservations: ReadonlyArray<Observation>,
  parse: (content: string) => Result<T>,
): Promise<Result<T>> => {
  const workflowId = workflow.workflowId;
  const maxRetries = agent.config.maxOutputRetries ?? DEFAULT_MAX_OUTPUT_RETRIES;
  const failed: FailedAttempt[] = [];

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const extraProducers = failed.length > 0 ? [retryFeedbackProducer(failed)] : [];
    const raw = await runRawInvocation(
      deps,
      agent,
      workflow,
      input,
      tick,
      carriedObservations,
      extraProducers,
    );
    if (!raw.ok) return err(raw.error);

    const parsed = parse(raw.loop.content);
    if (parsed.ok) return parsed;

    const code = parsed.error.code;
    const isValidationError = code === 'output_validation_failed' || code === 'invalid_plan';
    if (!isValidationError || attempt > maxRetries) return parsed;

    failed.push({ attempt, rawContent: raw.loop.content, error: parsed.error });
    deps.bus.emit({
      topic: CortexTopics.agentRetry,
      payload: {
        agentId: agent.agentId,
        workflowId,
        attempt,
        nextAttempt: attempt + 1,
        rawContent: raw.loop.content,
        error: parsed.error,
      },
      meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
    });
  }
  return err(
    makeError('output_validation_failed', 'retry loop exited unexpectedly', {
      agentId: agent.agentId,
      workflowId,
    }),
  );
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

  deps.bus.emit({
    topic: CortexTopics.agentInvoked,
    payload: { agentId: agent.agentId, input },
    meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
  });

  const emitFinalError = (error: CortexError): void => {
    deps.bus.emit({
      topic: CortexTopics.error,
      payload: error,
      meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
    });
  };
  const emitCompleted = (output: unknown): void => {
    deps.bus.emit({
      topic: CortexTopics.agentCompleted,
      payload: { agentId: agent.agentId, output },
      meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
    });
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

  // Delegation callback for ask_agent: dispatch through the bus.
  // Each delegation gets its own correlationId so completions route
  // back to exactly this waitFor, not to the parent or any sibling.
  const delegate: ExecuteAgentForDelegation = async ({ agentId: targetId, input: subInput, workflowId: wf }) => {
    const subCorrelationId = newCorrelationId();
    // Subscribe BEFORE dispatching.
    const completionPromise = deps.bus.waitFor(CortexTopics.executePattern, {
      filter: (e) =>
        e.meta.correlationId === subCorrelationId &&
        (e.topic === CortexTopics.executeCompleted || e.topic === CortexTopics.executeFailed),
      timeoutMs: 60_000,
      signal: workflow.abort.signal,
    });
    deps.bus.dispatch(
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
    deps.bus.emit({
      topic: CortexTopics.tickStarted,
      payload: { workflowId, tick: currentTick },
      meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
    });

    const planResultParsed = await runWithRetries<ActionPlan>(
      deps, agent, workflow, input, currentTick, carriedObservations,
      (content) => parsePlanOutput<ActionPlan>(content, ctx),
    );
    if (!planResultParsed.ok) {
      emitFinalError(planResultParsed.error);
      return err(planResultParsed.error);
    }
    const plan = planResultParsed.data;
    deps.bus.emit({
      topic: CortexTopics.planProduced,
      payload: { workflowId, agentId: agent.agentId, plan },
      meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
    });

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
      deps.bus.emit({
        topic: CortexTopics.error,
        payload: planResult.error,
        meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
      });
      return err(planResult.error);
    }
    for (const obs of planResult.observations) carriedObservations.push(obs);

    deps.bus.emit({
      topic: CortexTopics.tickEnded,
      payload: { workflowId, tick: currentTick },
      meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
    });

    if (planResult.finalized) {
      deps.bus.emit({
        topic: CortexTopics.agentCompleted,
        payload: { agentId: agent.agentId, output: planResult.finalResult },
        meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
      });
      return ok(trustAgentReturn<T>(planResult.finalResult));
    }
    currentTick += 1;
  }

  const error: CortexError = makeError(
    'ticks_exceeded',
    `Plan-mode agent exceeded ${maxTicks} ticks without finalizing`,
    { agentId: agent.agentId, workflowId },
  );
  deps.bus.emit({
    topic: CortexTopics.error,
    payload: error,
    meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
  });
  return err(error);
};
