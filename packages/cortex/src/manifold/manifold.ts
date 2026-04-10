// ═══════════════════════════════════════════════════════════
// Manifold — central coordinator
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §10. This is the Phase A skeleton:
//   - registry, bus, ledger, state store, event log all wired
//   - lifecycle (start/stop/drain)
//   - previewContext fully implemented (the killer debugging API)
//   - addProducer registration
//   - execute() throws 'unknown' for now — next session lands the
//     tool loop and agent execution path
//
// Plan executor, interceptors, ask_agent sync sugar all land in
// later sessions per the phased build plan.

import type { AgentDefinition } from '../agent/define-agent';
import type { ToolDefinition } from '../tool/define-tool';
import type { Bus, BudgetState, Result, Unsubscribe } from '../types';
import type { ContextProducer, ContextSpec, ResolvedContext } from '../context/types';
import type { SignalClient } from '../llm/signal-client';
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
import { newWorkflowId } from '../utils/id';
import { makeError, throwCortex, err } from '../errors/cortex.errors';

// ───────────────────────────────────────────────────────────
// Public surface
// ───────────────────────────────────────────────────────────

export type ManifoldHooks = {
  onWorkflowStart?: (workflowId: string) => void;
  onWorkflowEnd?: (workflowId: string, result: unknown) => void;
  onError?: (error: unknown, context: { workflowId?: string; agentId?: string }) => void;
};

export type ManifoldConfig = {
  // The Signal client. Optional only because previewContext does not
  // need it. execute() requires it; calling execute without an llm
  // returns a structured error.
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
  // Registration
  registerAgent: (agent: AgentDefinition) => Unsubscribe;
  registerTool: (tool: ToolDefinition) => Unsubscribe;
  addProducer: (producer: ContextProducer, scope?: { agentId?: string }) => Unsubscribe;

  // Bus (the substrate)
  bus: Bus;

  // State
  getState: (workflowId: string, key: string) => Promise<unknown>;
  setState: (workflowId: string, key: string, value: unknown) => Promise<void>;

  // Execution
  execute: <T>(agentId: string, input: unknown, options?: ExecuteOptions) => Promise<Result<T>>;
  previewContext: (agentId: string, input: unknown, options?: ExecuteOptions) => Promise<ResolvedContext>;

  // Lifecycle
  start: () => Promise<void>;
  stop: () => Promise<void>;
  drain: () => Promise<void>;

  // Internal — exposed for testing and for runAgentStandalone
  readonly _internal: {
    registry: Registry;
    ledger: Ledger;
    stateStore: StateStore;
    eventLog: EventLog;
    config: ManifoldConfig;
  };
};

// ───────────────────────────────────────────────────────────
// Default context spec — used when an agent does not bring its own
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

  // Tee bus → event log so the log captures everything that happens.
  const teeUnsub = bus.on('#', async (event) => {
    try {
      await eventLog.append(event);
    } catch (e) {
      hooks.onError?.(e, {});
    }
  });

  let started = false;
  let draining = false;
  // In-flight workflow count (for drain). Phase A: previewContext does
  // not register a workflow, so this only goes up when execute() lands.
  let inFlight = 0;

  // ─── helpers ─────────────────────────────────────────────

  const computeBudgetState = (workflowId: string): BudgetState => {
    const snap = ledger.snapshot(workflowId);
    return {
      tokensUsed: snap.tokensUsed,
      tokensRemaining: snap.tokensRemaining,
      ticksUsed: snap.ticksUsed,
      ticksRemaining: snap.ticksRemaining,
      toolCallsUsed: snap.toolCallsUsed,
    };
  };

  // ─── execute ─────────────────────────────────────────────

  const execute = async <T>(
    agentId: string,
    input: unknown,
    options: ExecuteOptions = {},
  ): Promise<Result<T>> => {
    const agent = registry.requireAgent(agentId) as AgentDefinition<T>;
    if (!config.llm) {
      return err<T>(
        makeError(
          'model_call_failed',
          'Manifold.execute() requires an `llm` SignalClient in ManifoldConfig.',
          { agentId },
        ),
      );
    }

    const workflowId = options.workflowId ?? newWorkflowId();
    const ownLedger = !ledger.isOpen(workflowId);
    if (ownLedger) ledger.open(workflowId);

    inFlight += 1;
    bus.emit({
      topic: 'cortex.workflow.started',
      payload: { workflowId, agentId, input },
      meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
    });

    try {
      const stateSnapshot = await stateStore.snapshot(workflowId);
      const result = await executeAgent<T>(
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
          ...(options.signal && { abort: options.signal }),
        },
      );

      bus.emit({
        topic: 'cortex.workflow.ended',
        payload: { workflowId, result: result.ok ? result.data : undefined, error: result.ok ? undefined : result.error },
        meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
      });
      hooks.onWorkflowEnd?.(workflowId, result.ok ? result.data : undefined);
      // executeAgent now returns Result<T> directly — the parser
      // dispatch in execute.ts handles per-mode narrowing, so no
      // cast is needed at this boundary.
      return result;
    } finally {
      inFlight -= 1;
      if (ownLedger) ledger.close(workflowId);
    }
  };

  // ─── previewContext — fully wired ─────────────────────────

  const previewContext = async (
    agentId: string,
    input: unknown,
    options: ExecuteOptions = {},
  ): Promise<ResolvedContext> => {
    const agent = registry.requireAgent(agentId);
    const workflowId = options.workflowId ?? newWorkflowId();

    // We don't open a real ledger entry for preview — it's read-only.
    // Use a temporary budget snapshot so producers see something sensible.
    const budget: BudgetState = ledger.isOpen(workflowId)
      ? computeBudgetState(workflowId)
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

    // Combine the agent's spec producers with any global / scoped producers.
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

  void hooks.onWorkflowStart;
  void hooks.onWorkflowEnd;

  // ─── instance ────────────────────────────────────────────

  const manifold: Manifold = {
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
    _internal: {
      registry,
      ledger,
      stateStore,
      eventLog,
      config,
    },
  };

  // Phase A: throw on direct misuse to keep the public surface honest.
  if (config.tokenEstimation === 'exact') {
    // Don't crash here — we still allow the mode and fall back to fuzzy
    // (per src/context/tokens.ts). Just emit a soft warning event.
    bus.emit({
      topic: 'cortex.warning',
      payload: {
        message: 'tokenEstimation: "exact" requested but signal.count() is not yet wired upstream. Falling back to fuzzy.',
      },
      meta: { timestamp: Date.now(), correlationId: 'init' },
    });
  }

  return manifold;
};

// Helper for tests / standalone — re-throws programmer errors as
// CortexError-tagged Errors.
export const _runtimeThrow = throwCortex;
