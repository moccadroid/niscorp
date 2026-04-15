// ═══════════════════════════════════════════════════════════
// runAgentStandalone — one-shot agent execution via micro-manifold
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §4.3 / §7. Builds a degenerate manifold (no bus
// subscribers, no persistence beyond the run, in-memory ledger),
// registers the agent and any tools the caller provides, and runs
// it through the same execute path as a full manifold.
//
// There is exactly one execution path. Standalone is just a
// degenerate manifold.

import type { AgentDefinition } from './define-agent';
import type { ToolDefinition } from '../tool/define-tool';
import type { Bus, Result, Unsubscribe } from '../types';
import type { SignalClient } from '../llm/signal-client';
import type { Observation } from '../schemas';
import type { RegisteredRule } from '../rules/engine';
import type { EffectHandler } from '../rules/effects';
import { createManifold } from '../manifold/manifold';
import type { Manifold, ManifoldConfig } from '../manifold/types';
import { CortexTopics, type AgentRetryPayload } from '../topics';
import { newWorkflowId } from '../utils/id';

// Re-export under the established name so existing consumers don't break.
export type RetryEventPayload = AgentRetryPayload;

export type StandaloneOptions = {
  llm: SignalClient;
  tools?: ReadonlyArray<ToolDefinition>;
  /**
   * Other agents to register on the same manifold so the primary
   * agent can delegate to them via `ask_agent` in plan mode. Order
   * doesn't matter; ids must be unique. The primary agent is
   * registered automatically.
   */
  specialists?: ReadonlyArray<AgentDefinition<unknown>>;
  workflowId?: string;
  manifold?: Partial<ManifoldConfig>;
  /**
   * Called when the agent's structured output fails validation and
   * Cortex re-prompts the model with the failure fed back. The
   * showroom uses this to render a retries panel; production code
   * usually does not need it (the auto-retry just works).
   */
  onRetry?: (event: RetryEventPayload) => void;
  /**
   * Called every time the runtime records an observation — a tool
   * call's result, an ask_agent result, a wait completion, etc.
   * Used by demo UIs to render a live timeline as the agent works.
   */
  onObservation?: (observation: Observation) => void;
  /**
   * Declarative rules (Phase C). Registered on the manifold before
   * the run starts. Rules watch bus events via accumulators and fire
   * effects (inject context, abort, deny) when conditions are met.
   */
  rules?: ReadonlyArray<RegisteredRule>;
  /**
   * Named effect handlers for the `call` rule effect. Registered on
   * the manifold's effect registry before the run starts.
   */
  effects?: ReadonlyArray<{ name: string; handler: EffectHandler }>;
  /**
   * Escape hatch: subscribe arbitrary bus handlers before the run
   * starts. Return value is ignored — the manifold's lifecycle
   * cleans up subscriptions on stop. Use this for custom telemetry,
   * inspector tabs, etc.
   */
  onBus?: (bus: Bus) => void;
};

export const runAgentStandalone = async <T>(
  agent: AgentDefinition<T>,
  input: unknown,
  options: StandaloneOptions,
): Promise<Result<T>> => {
  const manifold: Manifold = createManifold({
    ...(options.manifold ?? {}),
    llm: options.llm,
  });
  manifold.registerAgent(agent);
  for (const specialist of options.specialists ?? []) manifold.registerAgent(specialist);
  for (const tool of options.tools ?? []) manifold.registerTool(tool);
  for (const rule of options.rules ?? []) manifold.registerRule(rule);
  for (const eff of options.effects ?? []) manifold.registerEffect(eff.name, eff.handler);

  const subscriptions: Unsubscribe[] = [];
  if (options.onRetry) {
    subscriptions.push(
      manifold.bus.on(CortexTopics.agentRetry, (event) => {
        options.onRetry?.(event.payload);
      }),
    );
  }
  if (options.onObservation) {
    subscriptions.push(
      manifold.bus.on(CortexTopics.observationRecorded, (event) => {
        options.onObservation?.(event.payload);
      }),
    );
  }
  if (options.onBus) {
    options.onBus(manifold.bus);
  }

  await manifold.start();
  const workflowId = options.workflowId ?? newWorkflowId();
  try {
    return await manifold.execute<T>(agent.agentId, input, { workflowId });
  } finally {
    for (const unsub of subscriptions) unsub();
    await manifold.stop();
  }
};
