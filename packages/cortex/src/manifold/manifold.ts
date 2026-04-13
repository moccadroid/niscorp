// ═══════════════════════════════════════════════════════════
// Manifold — central coordinator
// ═══════════════════════════════════════════════════════════
//
// The bus is the substrate. manifold.execute() dispatches a
// request event and awaits the completion. The manifold's internal
// handler picks up the request, runs the agent, and emits
// completed or failed on the same correlationId. Concurrent
// executions are routed by correlationId — no cross-talk.
//
// Per-workflow runtime state lives in a WorkflowContext — one per
// active workflow. The tool loop, plan executor, and gate all read
// from it. Rules write to it. The manifold creates and destroys it.

import type { AgentDefinition } from '../agent/define-agent';
import type { ToolDefinition } from '../tool/define-tool';
import type { Bus, BudgetState, Result, Unsubscribe } from '../types';
import type { ContextProducer, ContextSpec, ResolvedContext } from '../context/types';
import type { SignalClient } from '../llm/signal-client';
import type { CortexError } from '../errors/cortex.errors';
import { runPipeline } from '../context/pipeline';
import { counterFor, type TokenEstimationMode } from '../context/tokens';
import { executeAgent } from '../agent/execute';
import { defaultContextSpecFor } from '../context/defaults';
import { createBus, type CreateBusOptions } from './bus';
import { createRegistry, type Registry } from './registry';
import { createLedger, DEFAULT_BUDGET, type Ledger, type LedgerBudget } from './ledger';
import { createWorkflowContext, destroyWorkflowContext, type WorkflowContext } from './workflow-context';
import type { StateStore, EventLog } from '../store/types';
import { createMemoryStateStore } from '../store/memory-state.store';
import { createMemoryEventLog } from '../store/memory-event.log';
import { newWorkflowId, newCorrelationId } from '../utils/id';
import { makeError, throwCortex, err } from '../errors/cortex.errors';
import { createProducerState } from '../context/producer-state';
import {
  createRulesEngine,
  createEffectRegistry,
  type RegisteredRule,
  type RulesEngine,
  type EffectHandler,
  type EffectRegistry,
  isInjectEffect,
  isAbortEffect,
  isDenyEffect,
} from '../rules';
import { CortexTopics, type ExecuteFailedPayload, type ExecuteCompletedPayload } from '../topics';

// ───────────────────────────────────────────────────────────
// Public surface
// ───────────────────────────────────────────────────────────

export type ManifoldHooks = {
  onWorkflowStart?: (workflowId: string) => void;
  onWorkflowEnd?: (workflowId: string, result: unknown) => void;
  onError?: (error: unknown, context: { workflowId?: string; agentId?: string }) => void;
};

export type ManifoldConfig = {
  llm?: SignalClient;
  stateStore?: StateStore;
  eventLog?: EventLog;
  defaultContextSpec?: ContextSpec;
  defaultBudget?: Partial<LedgerBudget>;
  defaultPackBudget?: number;
  tokenEstimation?: TokenEstimationMode;
  compressorModel?: string;
  hooks?: ManifoldHooks;
  bus?: CreateBusOptions;
};

export type ExecuteOptions = {
  workflowId?: string;
  signal?: AbortSignal;
};

export type Manifold = {
  registerAgent: (agent: AgentDefinition) => Unsubscribe;
  registerTool: (tool: ToolDefinition) => Unsubscribe;
  addProducer: (producer: ContextProducer, scope?: { agentId?: string }) => Unsubscribe;
  registerRule: (rule: RegisteredRule) => Unsubscribe;
  registerEffect: (name: string, handler: EffectHandler) => void;
  bus: Bus;
  getState: (workflowId: string, key: string) => Promise<unknown>;
  setState: (workflowId: string, key: string, value: unknown) => Promise<void>;
  execute: <T>(agentId: string, input: unknown, options?: ExecuteOptions) => Promise<Result<T>>;
  previewContext: (agentId: string, input: unknown, options?: ExecuteOptions) => Promise<ResolvedContext>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  drain: () => Promise<void>;
  readonly _internal: {
    registry: Registry;
    ledger: Ledger;
    stateStore: StateStore;
    eventLog: EventLog;
    config: ManifoldConfig;
    rulesEngine: RulesEngine;
    effectRegistry: EffectRegistry;
    workflows: ReadonlyMap<string, WorkflowContext>;
  };
};

const DEFAULT_PACK_BUDGET_TOKENS = 32_000;

// ───────────────────────────────────────────────────────────
// Factory
// ───────────────────────────────────────────────────────────

export const createManifold = (config: ManifoldConfig = {}): Manifold => {
  const registry = createRegistry();
  const bus = createBus(config.bus ?? {});
  const ledger = createLedger({ defaultBudget: config.defaultBudget });
  const stateStore = config.stateStore ?? createMemoryStateStore();
  const eventLog = config.eventLog ?? createMemoryEventLog();
  const tokenMode: TokenEstimationMode = config.tokenEstimation ?? 'fuzzy';
  const packBudget = config.defaultPackBudget ?? DEFAULT_PACK_BUDGET_TOKENS;
  const hooks = config.hooks ?? {};

  // ─── Rules engine ───────────────────────────────────────
  const effectRegistry = createEffectRegistry();
  const rulesEngine = createRulesEngine(bus, effectRegistry);

  // ─── Per-workflow runtime state ─────────────────────────
  //
  // One WorkflowContext per active workflow. The tool loop, plan
  // executor, and gate all read from it. Rules write to it.
  const workflows = new Map<string, WorkflowContext>();

  // The inject producer reads injections from the active workflow.
  // Since producers don't receive the workflowId directly, we look
  // up the workflow by the BuildContext's workflowId.
  const ruleInjectProducer: ContextProducer = {
    id: 'cortex.rule-inject',
    priority: 85,
    build: (ctx) => {
      const wf = workflows.get(ctx.workflowId);
      if (!wf || wf.injections.length === 0) return [];
      return wf.injections.map((msg) => ({
        role: 'system' as const,
        content: msg,
        source: 'cortex.rule-inject',
        tags: ['rule', 'inject'],
      }));
    },
  };

  // Tee bus → event log so the log captures everything.
  const teeUnsub = bus.on('#', async (event) => {
    try { await eventLog.append(event); } catch (e) { hooks.onError?.(e, {}); }
  });

  let started = false;
  let draining = false;
  let inFlight = 0;

  // ─── Stateful producer wiring ───────────────────────────
  //
  // Producers with `subscribes` are attached to the bus when a
  // workflow starts. Unsub functions are stored on the workflow's
  // producerUnsubs array, cleaned up by destroyWorkflowContext.

  const attachStatefulProducers = (workflow: WorkflowContext): void => {
    const allProducers = registry.allProducers();
    for (const producer of allProducers) {
      if (!producer.subscribes?.length || !producer.onEvent) continue;
      const state = createProducerState();
      const storeKey = `cortex.producer.${producer.id}`;
      void stateStore.set(workflow.workflowId, storeKey, state.toObject());
      for (const topic of producer.subscribes) {
        workflow.producerUnsubs.push(
          bus.on(topic, (event) => {
            producer.onEvent!(event, state);
            void stateStore.set(workflow.workflowId, storeKey, state.toObject());
          }),
        );
      }
    }
  };

  // ─── Execution handler ──────────────────────────────────
  //
  // The bus-driven execution substrate. This handler is the ONLY
  // place where executeAgent is called. manifold.execute() is just
  // dispatch + waitFor.

  bus.on(CortexTopics.executeRequested, async (event) => {
    const { agentId, input, workflowId, abort: externalAbort } = event.payload;
    const correlationId = event.meta.correlationId;

    // Validate preconditions.
    let agent: AgentDefinition<unknown>;
    try {
      agent = registry.requireAgent(agentId);
    } catch {
      bus.emit({
        topic: CortexTopics.executeFailed,
        payload: {
          error: makeError('agent_not_registered', `No agent: ${agentId}`, { agentId }),
          workflowId,
        },
        meta: { timestamp: Date.now(), correlationId, workflowId },
      });
      return;
    }

    if (!config.llm) {
      bus.emit({
        topic: CortexTopics.executeFailed,
        payload: {
          error: makeError('model_call_failed', 'Manifold requires an `llm` SignalClient.', { agentId }),
          workflowId,
        },
        meta: { timestamp: Date.now(), correlationId, workflowId },
      });
      return;
    }

    // Lifecycle: open ledger, create WorkflowContext, attach
    // stateful producers, emit workflow.started.
    const ownLedger = !ledger.isOpen(workflowId);
    if (ownLedger) ledger.open(workflowId);
    inFlight += 1;

    const workflow = createWorkflowContext(
      workflowId,
      agent.config.policy ?? {},
      externalAbort,
    );
    workflows.set(workflowId, workflow);
    attachStatefulProducers(workflow);

    bus.emit({
      topic: CortexTopics.workflowStarted,
      payload: { workflowId, agentId, input },
      meta: { timestamp: Date.now(), correlationId, workflowId },
    });
    hooks.onWorkflowStart?.(workflowId);

    try {
      const stateSnapshot = await stateStore.snapshot(workflowId);
      const result = await executeAgent<unknown>(
        {
          registry,
          llm: config.llm,
          ledger,
          bus,
          stateStore,
          state: stateSnapshot,
          packBudgetTokens: packBudget,
          tokenMode,
          ...(config.defaultContextSpec && { defaultContextSpec: config.defaultContextSpec }),
        },
        {
          agent,
          input,
          workflow,
        },
      );

      const finalLedger = ledger.isOpen(workflowId) ? ledger.snapshot(workflowId) : undefined;

      bus.emit({
        topic: CortexTopics.workflowEnded,
        payload: {
          workflowId,
          result: result.ok ? result.data : undefined,
          error: result.ok ? undefined : result.error,
          ...(finalLedger && { ledger: finalLedger }),
        },
        meta: { timestamp: Date.now(), correlationId, workflowId },
      });
      hooks.onWorkflowEnd?.(workflowId, result.ok ? result.data : undefined);

      bus.emit({
        topic: CortexTopics.executeCompleted,
        payload: { result, workflowId },
        meta: { timestamp: Date.now(), correlationId, workflowId },
      });
    } catch (e) {
      const error: CortexError = makeError(
        'unknown',
        e instanceof Error ? e.message : String(e),
        { agentId, workflowId, cause: e },
      );
      hooks.onError?.(e, { workflowId, agentId });

      const finalLedger = ledger.isOpen(workflowId) ? ledger.snapshot(workflowId) : undefined;
      bus.emit({
        topic: CortexTopics.workflowEnded,
        payload: { workflowId, error, ...(finalLedger && { ledger: finalLedger }) },
        meta: { timestamp: Date.now(), correlationId, workflowId },
      });

      bus.emit({
        topic: CortexTopics.executeFailed,
        payload: { error, workflowId },
        meta: { timestamp: Date.now(), correlationId, workflowId },
      });
    } finally {
      destroyWorkflowContext(workflow);
      workflows.delete(workflowId);
      inFlight -= 1;
      if (ownLedger) ledger.close(workflowId);
    }
  });

  // ─── execute: dispatch + waitFor ────────────────────────

  const execute = async <T>(
    agentId: string,
    input: unknown,
    options: ExecuteOptions = {},
  ): Promise<Result<T>> => {
    const correlationId = newCorrelationId();
    const workflowId = options.workflowId ?? newWorkflowId();

    const isCompletionOrFailure = (e: { topic: string; meta: { correlationId: string } }): boolean =>
      e.meta.correlationId === correlationId &&
      (e.topic === CortexTopics.executeCompleted || e.topic === CortexTopics.executeFailed);

    const completionPromise = bus.waitFor(CortexTopics.executePattern, {
      filter: isCompletionOrFailure,
      timeoutMs: DEFAULT_BUDGET.maxDurationMs,
      ...(options.signal && { signal: options.signal }),
    });

    bus.dispatch(
      CortexTopics.executeRequested,
      { agentId, input, workflowId, ...(options.signal && { abort: options.signal }) },
      { correlationId, workflowId },
    );

    const completion = await completionPromise;

    if (completion.topic === CortexTopics.executeFailed) {
      const payload = completion.payload as ExecuteFailedPayload;
      return err(payload.error);
    }

    const payload = completion.payload as ExecuteCompletedPayload;
    return payload.result as Result<T>;
  };

  // ─── previewContext — stays direct (no bus) ─────────────

  const previewContext = async (
    agentId: string,
    input: unknown,
    options: ExecuteOptions = {},
  ): Promise<ResolvedContext> => {
    const agent = registry.requireAgent(agentId);
    const workflowId = options.workflowId ?? newWorkflowId();

    const budget: BudgetState = ledger.isOpen(workflowId)
      ? (() => {
          const snap = ledger.snapshot(workflowId);
          return {
            tokensUsed: snap.tokensUsed,
            tokensRemaining: snap.tokensRemaining,
            ticksUsed: snap.ticksUsed,
            ticksRemaining: snap.ticksRemaining,
            toolCallsUsed: snap.toolCallsUsed,
          };
        })()
      : {
          tokensUsed: 0,
          tokensRemaining: DEFAULT_BUDGET.maxTokens,
          ticksUsed: 0,
          ticksRemaining: DEFAULT_BUDGET.maxTicks,
          toolCallsUsed: 0,
        };

    const stateSnapshot = await stateStore.snapshot(workflowId);

    const spec =
      agent.config.context ??
      config.defaultContextSpec ??
      defaultContextSpecFor(agent.config.outputMode, agent.config.instructions, agent.config.tools);

    const extraProducers = registry.producersFor(agentId);
    const allProducers = [...spec.producers, ...extraProducers];

    return runPipeline(
      allProducers,
      {
        agentId,
        workflowId,
        tick: 0,
        input,
        observations: [],
        registry: registry.asReadonly(),
        state: stateSnapshot,
        budget,
      },
      {
        budgetTokens: spec.budgetTokens ?? packBudget,
        countTokens: counterFor(tokenMode),
      },
    );
  };

  // ─── lifecycle ──────────────────────────────────────────

  const start = async (): Promise<void> => {
    if (started) return;
    started = true;
  };

  const stop = async (): Promise<void> => {
    if (!started) return;
    teeUnsub();
    started = false;
  };

  const drain = async (): Promise<void> => {
    if (draining) return;
    draining = true;
    while (inFlight > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
    await stop();
  };

  // Register the rule-inject producer.
  registry.addProducer(ruleInjectProducer);

  // ─── Rule evaluation ────────────────────────────────────
  //
  // Evaluate rules after each observation. Deferred to a microtask
  // so accumulators have processed the event first.
  //
  // The trigger event's workflowId scopes all effects to the
  // correct workflow — no global arrays, no iterating all controllers.
  bus.on(CortexTopics.observationRecorded, (triggerEvent) => {
    const triggerWorkflowId = triggerEvent.meta.workflowId;
    void Promise.resolve().then(() => {
      const snapshot = rulesEngine.snapshot();
      const result = rulesEngine.evaluate();

      bus.emit({
        topic: CortexTopics.ruleEvaluated,
        payload: { result, accumulators: snapshot },
        meta: { timestamp: Date.now(), correlationId: triggerWorkflowId ?? 'rule', workflowId: triggerWorkflowId },
      });

      if (!result.matched) return;
      const effect = result.effect;

      bus.emit({
        topic: CortexTopics.ruleFired,
        payload: { ruleId: result.ruleId, effect, accumulators: snapshot },
        meta: { timestamp: Date.now(), correlationId: triggerWorkflowId ?? 'rule', workflowId: triggerWorkflowId },
      });

      // Resolve the workflow this effect applies to.
      const wf = triggerWorkflowId ? workflows.get(triggerWorkflowId) : undefined;

      if (isInjectEffect(effect)) {
        if (wf) wf.addInjection(effect.inject);
      }
      if (isAbortEffect(effect)) {
        if (wf) wf.abort.abort(effect.abort);
      }
      if (isDenyEffect(effect)) {
        if (wf) {
          wf.updatePolicy((p) => ({
            ...p,
            tools: {
              ...p.tools,
              deny: [...(p.tools?.deny ?? []), '*'],
            },
          }));
        }
      }
    });
  });

  // Soft warning for exact token mode.
  if (config.tokenEstimation === 'exact') {
    bus.emit({
      topic: CortexTopics.warning,
      payload: { message: 'tokenEstimation: "exact" not yet implemented. Falling back to fuzzy.' },
      meta: { timestamp: Date.now(), correlationId: 'init' },
    });
  }

  return {
    registerAgent: (agent) => registry.registerAgent(agent),
    registerTool: (tool) => registry.registerTool(tool),
    addProducer: (producer, scope) => registry.addProducer(producer, scope),
    registerRule: (rule) => rulesEngine.register(rule),
    registerEffect: (name, handler) => effectRegistry.register(name, handler),
    bus,
    getState: (workflowId, key) => stateStore.get(workflowId, key),
    setState: (workflowId, key, value) => stateStore.set(workflowId, key, value),
    execute,
    previewContext,
    start,
    stop,
    drain,
    _internal: { registry, ledger, stateStore, eventLog, config, rulesEngine, effectRegistry, workflows },
  };
};

export const _runtimeThrow = throwCortex;
