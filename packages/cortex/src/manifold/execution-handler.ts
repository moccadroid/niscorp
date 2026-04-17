// ═══════════════════════════════════════════════════════════
// Execution handler — the bus subscription that runs agents
// ═══════════════════════════════════════════════════════════
//
// The ONLY place where executeAgent is called. manifold.execute()
// is just emit + waitFor. This handler picks up the request,
// creates a WorkflowContext, runs the agent, and emits completed
// or failed on the same correlationId so the caller's waitFor
// can match.

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
import type { TypedTopic } from '../utils/typed-topic';
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
    const { agentId, input, workflowId, abort: externalAbort, stream } = event.payload;
    const correlationId = event.meta.correlationId;

    // Lifecycle bracket emits use the caller's correlationId (not the
    // workflow's) so manifold.execute()'s waitFor can match them. They
    // are NOT in-workflow events and therefore can't use workflow.emit
    // — its meta would carry workflowId as correlationId instead.
    const emitToCaller = <P>(topic: TypedTopic<P>, payload: P): void => {
      bus.emit(topic, payload, { correlationId, workflowId });
    };

    let agent: AgentDefinition<unknown>;
    try {
      agent = registry.requireAgent(agentId);
    } catch {
      emitToCaller(CortexTopics.executeFailed, {
        error: makeError('agent_not_registered', `No agent: ${agentId}`, { agentId }),
        workflowId,
      });
      return;
    }

    if (!config.llm) {
      emitToCaller(CortexTopics.executeFailed, {
        error: makeError('model_call_failed', 'Manifold requires an `llm` SignalClient.', { agentId }),
        workflowId,
      });
      return;
    }

    // Lifecycle: open ledger, create WorkflowContext, attach
    // stateful producers, emit workflow.started.
    const ownLedger = !ledger.isOpen(workflowId);
    if (ownLedger) ledger.open(workflowId);
    handlerState.inFlight += 1;

    const workflow = createWorkflowContext({
      workflowId,
      bus,
      policy: agent.config.policy ?? {},
      ...(externalAbort && { externalAbort }),
      ...(stream !== undefined && { stream }),
    });
    workflows.set(workflowId, workflow);
    attachStatefulProducers(workflow, registry, bus, stateStore);

    emitToCaller(CortexTopics.workflowStarted, { workflowId, agentId, input });
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

      emitToCaller(CortexTopics.workflowEnded, {
        workflowId,
        result: result.ok ? result.data : undefined,
        error: result.ok ? undefined : result.error,
        ...(finalLedger && { ledger: finalLedger }),
      });
      hooks.onWorkflowEnd?.(workflowId, result.ok ? result.data : undefined);

      emitToCaller(CortexTopics.executeCompleted, { result, workflowId });
    } catch (e) {
      const error: CortexError = makeError(
        'unknown',
        e instanceof Error ? e.message : String(e),
        { agentId, workflowId, cause: e },
      );
      hooks.onError?.(e, { workflowId, agentId });

      const finalLedger = ledger.isOpen(workflowId) ? ledger.snapshot(workflowId) : undefined;
      emitToCaller(CortexTopics.workflowEnded, {
        workflowId,
        error,
        ...(finalLedger && { ledger: finalLedger }),
      });

      emitToCaller(CortexTopics.executeFailed, { error, workflowId });
    } finally {
      destroyWorkflowContext(workflow);
      workflows.delete(workflowId);
      handlerState.inFlight -= 1;
      if (ownLedger) ledger.close(workflowId);
    }
  });
};
