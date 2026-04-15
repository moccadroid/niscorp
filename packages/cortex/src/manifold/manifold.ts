// ═══════════════════════════════════════════════════════════
// Manifold factory — thin wiring layer
// ═══════════════════════════════════════════════════════════
//
// Creates the subsystems, wires them together, returns the
// Manifold object. All substantial logic lives in focused modules:
//   - execution-handler.ts — the bus subscription that runs agents
//   - preview.ts           — previewContext (no LLM, direct pipeline)
//   - rule-handler.ts      — rule evaluation after observations
//   - types.ts             — public type definitions

import type { Result } from '../types';
import type { ContextProducer } from '../context/types';
import type { CortexError } from '../errors/cortex.errors';
import type { Manifold, ManifoldConfig, ExecuteOptions } from './types';
import type { ExecuteFailedPayload, ExecuteCompletedPayload } from '../topics';
import type { WorkflowContext } from './workflow-context';
import { createBus } from './bus';
import { createRegistry } from './registry';
import { createLedger, DEFAULT_BUDGET } from './ledger';
import { createMemoryStateStore } from '../store/memory-state.store';
import { createMemoryEventLog } from '../store/memory-event.log';
import { newWorkflowId, newCorrelationId } from '../utils/id';
import { throwCortex, err } from '../errors/cortex.errors';
import { createRulesEngine, createEffectRegistry } from '../rules';
import { CortexTopics } from '../topics';
import { registerExecutionHandler } from './execution-handler';
import { previewContext as previewContextImpl } from './preview';
import { registerRuleHandler } from './rule-handler';

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
  const tokenMode = config.tokenEstimation ?? 'fuzzy';
  const packBudget = config.defaultPackBudget ?? DEFAULT_PACK_BUDGET_TOKENS;
  const hooks = config.hooks ?? {};

  // ─── Rules engine ───────────────────────────────────────
  const effectRegistry = createEffectRegistry();
  const rulesEngine = createRulesEngine(bus, effectRegistry);

  // ─── Per-workflow runtime state ─────────────────────────
  const workflows = new Map<string, WorkflowContext>();

  // The inject producer reads injections from the active workflow.
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
  registry.addProducer(ruleInjectProducer);

  // ─── Tee bus → event log ──────────────────────────────
  const teeUnsub = bus.on('#', async (event) => {
    try { await eventLog.append(event); } catch (e) { hooks.onError?.(e, {}); }
  });

  // ─── Execution + rule handlers ────────────────────────
  let started = false;
  let draining = false;
  const handlerState = { inFlight: 0 };

  registerExecutionHandler(
    { registry, bus, ledger, stateStore, config, hooks, tokenMode, packBudget, workflows },
    handlerState,
  );
  registerRuleHandler(bus, rulesEngine, workflows);

  // ─── execute: dispatch + waitFor ──────────────────────

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

  // ─── Lifecycle ────────────────────────────────────────

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
    while (handlerState.inFlight > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
    await stop();
  };

  // Soft warning for exact token mode.
  if (config.tokenEstimation === 'exact') {
    bus.emit({
      topic: CortexTopics.warning,
      payload: { message: 'tokenEstimation: "exact" not yet implemented. Falling back to fuzzy.' },
      meta: { timestamp: Date.now(), correlationId: 'init' },
    });
  }

  const previewDeps = { registry, ledger, stateStore, config, tokenMode, packBudget };

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
    previewContext: (agentId, input, options) => previewContextImpl(previewDeps, agentId, input, options),
    start,
    stop,
    drain,
    _internal: { registry, ledger, stateStore, eventLog, config, rulesEngine, effectRegistry, workflows },
  };
};

export const _runtimeThrow = throwCortex;
