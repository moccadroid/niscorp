// ═══════════════════════════════════════════════════════════
// Raw invocation — one tool-loop run, no output parsing
// ═══════════════════════════════════════════════════════════
//
// Runs the tool loop and returns its result WITHOUT parsing
// the output. The caller (runWithRetries) supplies a parser
// that produces the typed Result<T>.

import type { AgentDefinition } from './define-agent';
import type { ContextProducer, ContextSpec } from '../context/types';
import type { ToolDefinition } from '../tool/define-tool';
import type { BudgetState } from '../types';
import type { Observation } from '../schemas';
import type { CortexError } from '../errors/cortex.errors';
import type { WorkflowContext } from '../manifold/workflow-context';
import type { ExecuteAgentDeps } from './execute';
import { runToolLoop, type ToolLoopResult } from '../tool-loop/loop';
import { defaultContextSpecFor } from '../context/defaults';
import { makeError } from '../errors/cortex.errors';

const DEFAULT_PACK_BUDGET_TOKENS = 32_000;
const DEFAULT_MAX_TOOL_ITERATIONS = 10;

export const resolveTools = (
  registry: ExecuteAgentDeps['registry'],
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

export const snapshotBudget = (ledger: ExecuteAgentDeps['ledger'], workflowId: string): BudgetState => {
  const s = ledger.snapshot(workflowId);
  return {
    tokensUsed: s.tokensUsed,
    tokensRemaining: s.tokensRemaining,
    ticksUsed: s.ticksUsed,
    ticksRemaining: s.ticksRemaining,
    toolCallsUsed: s.toolCallsUsed,
  };
};

export type RawRunResult =
  | { ok: true; loop: ToolLoopResult }
  | { ok: false; error: CortexError };

export const runRawInvocation = async (
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
