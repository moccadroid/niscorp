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
// previewContext is the only read-only path that stays direct
// (no bus round-trip, no lifecycle events, no LLM call).
//
// External systems can trigger agent execution by emitting
// CortexTopics.executeRequested on the bus. Interceptors (Phase C)
// subscribe at higher priority and can modify/abort before the
// handler runs.

import type { AgentDefinition } from '../agent/define-agent';
import type { ToolDefinition } from '../tool/define-tool';
import type { Bus, BudgetState, Result, Unsubscribe } from '../types';
import type { ContextProducer, ContextSpec, ResolvedContext } from '../context/types';
import type { SignalClient } from '../llm/signal-client';
import type { CortexError } from '../errors/cortex.errors';
import { runPipeline } from '../context/pipeline';
import { counterFor, type TokenEstimationMode } from '../context/tokens';
import { executeAgent } from '../agent/execute';
import { systemProducer } from '../context/producers/system.producer';
import { inputProducer } from '../context/producers/input.producer';
import { toolsProducer } from '../context/producers/tools.producer';
import { historyProducer } from '../context/producers/history.producer';
import { budgetProducer } from '../context/producers/budget.producer';
import { createBus, type CreateBusOptions } from './bus';
import { createRegistry, type Registry } from './registry';
import { createLedger, DEFAULT_BUDGET, type Ledger, type LedgerBudget } from './ledger';
import type { StateStore, EventLog } from '../store/types';
import { createMemoryStateStore } from '../store/memory-state.store';
import { createMemoryEventLog } from '../store/memory-event.log';
import { newWorkflowId, newCorrelationId } from '../utils/id';
import { makeError, throwCortex, ok, err } from '../errors/cortex.errors';
import { CortexTopics } from '../topics';

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
  };
};

// ───────────────────────────────────────────────────────────
// Default context spec
// ───────────────────────────────────────────────────────────

const defaultContextSpecFor = (mode: 'text' | 'structured' | 'plan', instructions: string): ContextSpec => {
  const base: ContextProducer[] = [
    systemProducer(instructions),
    toolsProducer(),
    historyProducer(),
    inputProducer(),
  ];
  if (mode === 'plan') {
    base.splice(2, 0, budgetProducer());
  }
  return { producers: base };
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

  // Tee bus → event log so the log captures everything.
  const teeUnsub = bus.on('#', async (event) => {
    try { await eventLog.append(event); } catch (e) { hooks.onError?.(e, {}); }
  });

  let started = false;
  let draining = false;
  let inFlight = 0;

  // ─── Execution handler ───────────────────────────────────
  //
  // The bus-driven execution substrate. This handler is the ONLY
  // place where executeAgent is called. manifold.execute() is just
  // dispatch + waitFor. External systems can also emit
  // executeRequested directly to trigger agent runs.
  //
  // The handler is registered eagerly (not in start()) so the
  // manifold works immediately after creation. start/stop are
  // lifecycle hooks for draining and cleanup, not for enabling.

  bus.on(CortexTopics.executeRequested, async (event) => {
    const { agentId, input, workflowId, abort } = event.payload as {
      agentId: string;
      input: unknown;
      workflowId: string;
      abort?: AbortSignal;
    };
    const correlationId = event.meta.correlationId;

    // Validate preconditions.
    let agent: AgentDefinition<unknown>;
    try {
      agent = registry.requireAgent(agentId);
    } catch (e) {
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

    // Lifecycle: open ledger, track in-flight, emit workflow.started.
    const ownLedger = !ledger.isOpen(workflowId);
    if (ownLedger) ledger.open(workflowId);
    inFlight += 1;

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
          workflowId,
          ...(abort && { abort }),
        },
      );

      bus.emit({
        topic: CortexTopics.workflowEnded,
        payload: { workflowId, result: result.ok ? result.data : undefined, error: result.ok ? undefined : result.error },
        meta: { timestamp: Date.now(), correlationId, workflowId },
      });
      hooks.onWorkflowEnd?.(workflowId, result.ok ? result.data : undefined);

      // Emit completion. The caller's waitFor resolves on this.
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

      bus.emit({
        topic: CortexTopics.workflowEnded,
        payload: { workflowId, error },
        meta: { timestamp: Date.now(), correlationId, workflowId },
      });

      // Emit failure. The caller's waitFor resolves on this.
      bus.emit({
        topic: CortexTopics.executeFailed,
        payload: { error, workflowId },
        meta: { timestamp: Date.now(), correlationId, workflowId },
      });
    } finally {
      inFlight -= 1;
      if (ownLedger) ledger.close(workflowId);
    }
  });

  // ─── execute: dispatch + waitFor ─────────────────────────
  //
  // Three lines. The bus is the substrate. Everything else is
  // handled by the subscription above.

  const execute = async <T>(
    agentId: string,
    input: unknown,
    options: ExecuteOptions = {},
  ): Promise<Result<T>> => {
    const correlationId = newCorrelationId();
    const workflowId = options.workflowId ?? newWorkflowId();

    // IMPORTANT: subscribe BEFORE dispatching. The handler may emit
    // the completion event synchronously during dispatch (e.g. when
    // validation fails immediately). If we dispatched first and then
    // subscribed, the completion event would fire before anyone is
    // listening and waitFor would time out.
    // Subscribe BEFORE dispatching. Filter on correlationId AND on
    // the topic being a completion or failure — NOT the request
    // event we're about to dispatch (which has the same correlationId).
    const isCompletionOrFailure = (e: { topic: string; meta: { correlationId: string } }): boolean =>
      e.meta.correlationId === correlationId &&
      (e.topic === CortexTopics.executeCompleted || e.topic === CortexTopics.executeFailed);

    const completionPromise = bus.waitFor('cortex.execute.*', {
      filter: isCompletionOrFailure,
      timeoutMs: DEFAULT_BUDGET.maxDurationMs,
      ...(options.signal && { signal: options.signal }),
    });

    // Dispatch the request. The handler above picks it up.
    bus.dispatch(
      CortexTopics.executeRequested,
      { agentId, input, workflowId, ...(options.signal && { abort: options.signal }) },
      { correlationId, workflowId },
    );

    // Await the completion (already subscribed above).
    const completion = await completionPromise;

    if (completion.topic === CortexTopics.executeFailed) {
      const payload = completion.payload as { error: CortexError };
      return err(payload.error);
    }

    const payload = completion.payload as { result: Result<T> };
    return payload.result;
  };

  // ─── previewContext — stays direct (no bus) ───────────────

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
      defaultContextSpecFor(agent.config.outputMode, agent.config.instructions);

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

  // ─── lifecycle ───────────────────────────────────────────

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

  // Soft warning for exact token mode (not yet implemented).
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
    bus,
    getState: (workflowId, key) => stateStore.get(workflowId, key),
    setState: (workflowId, key, value) => stateStore.set(workflowId, key, value),
    execute,
    previewContext,
    start,
    stop,
    drain,
    _internal: { registry, ledger, stateStore, eventLog, config },
  };
};

export const _runtimeThrow = throwCortex;
