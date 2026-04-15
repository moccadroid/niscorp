// ═══════════════════════════════════════════════════════════
// previewContext — read-only context preview (no bus, no LLM)
// ═══════════════════════════════════════════════════════════

import type { BudgetState } from '../types';
import type { ResolvedContext, ContextSpec } from '../context/types';
import type { StateStore } from '../store/types';
import type { Registry } from './registry';
import type { Ledger } from './ledger';
import type { ManifoldConfig, ExecuteOptions } from './types';
import type { TokenEstimationMode } from '../context/tokens';
import { runPipeline } from '../context/pipeline';
import { counterFor } from '../context/tokens';
import { defaultContextSpecFor } from '../context/defaults';
import { DEFAULT_BUDGET } from './ledger';
import { newWorkflowId } from '../utils/id';

export type PreviewDeps = {
  registry: Registry;
  ledger: Ledger;
  stateStore: StateStore;
  config: ManifoldConfig;
  tokenMode: TokenEstimationMode;
  packBudget: number;
};

export const previewContext = async (
  deps: PreviewDeps,
  agentId: string,
  input: unknown,
  options: ExecuteOptions = {},
): Promise<ResolvedContext> => {
  const { registry, ledger, stateStore, config, tokenMode, packBudget } = deps;
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
