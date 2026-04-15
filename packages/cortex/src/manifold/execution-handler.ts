// ═══════════════════════════════════════════════════════════
// Execution handler — the bus subscription that runs agents
// ═══════════════════════════════════════════════════════════
//
// The ONLY place where executeAgent is called. manifold.execute()
// is just dispatch + waitFor. This handler picks up the request,
// creates a WorkflowContext, runs the agent, and emits completed
// or failed on the same correlationId.

import type { AgentDefinition } from '../agent/define-agent';
import type { Bus } from '../types';
import type { ContextProducer } from '../context/types';
import type { CortexError } from '../errors/cortex.errors';
import type { SignalClient } from '../llm/signal-client';
import type { StateStore } from '../store/types';
import type { Registry } from './registry';
import type { Ledger } from './ledger';
import type { WorkflowContext } from './workflow-context';
import type { ManifoldConfig, ManifoldHooks } from './types';
import type { TokenEstimationMode } from '../context/tokens';
import { executeAgent } from '../agent/execute';
import { createWorkflowContext, destroyWorkflowContext } from './workflow-context';
import { createProducerState } from '../context/producer-state';
import { makeError } from '../errors/cortex.errors';
import { CortexTopics } from '../topics';

export type ExecutionHandlerDeps = {
  registry: Registry;
  bus: Bus;
  ledger: Ledger;
  stateStore: StateStore;
  config: ManifoldConfig;
  hooks: ManifoldHooks;
  tokenMode: TokenEstimationMode;
  packBudget: number;
  workflows: Map<string, WorkflowContext>;
};

export type ExecutionHandlerState = {
  inFlight: number;
};

const attachStatefulProducers = (
  workflow: WorkflowContext,
  registry: Registry,
  bus: Bus,
  stateStore: StateStore,
): void => {
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

export const registerExecutionHandler = (
  deps: ExecutionHandlerDeps,
  handlerState: ExecutionHandlerState,
): void => {
  const { registry, bus, ledger, stateStore, config, hooks, tokenMode, packBudget, workflows } = deps;

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
    handlerState.inFlight += 1;

    const workflow = createWorkflowContext(
      workflowId,
      agent.config.policy ?? {},
      externalAbort,
    );
    workflows.set(workflowId, workflow);
    attachStatefulProducers(workflow, registry, bus, stateStore);

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
        { agent, input, workflow },
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
      handlerState.inFlight -= 1;
      if (ownLedger) ledger.close(workflowId);
    }
  });
};
