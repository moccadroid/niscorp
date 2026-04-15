// parallel node handler

import type { ActionPlan, ParallelNode } from '../../schemas';
import type { PlanExecutorDeps, PlanExecutorInput, PlanExecutorResult, NodeHandlerResult, RunPlanInner } from './types';
import type { Observation } from '../../schemas';

export const executeParallel = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  node: ParallelNode,
  runInner: RunPlanInner,
  idempotencyCache: Map<string, Observation>,
): Promise<NodeHandlerResult> => {
  const branches = node.branches;
  const maxConcurrency = node.maxConcurrency;
  const childInput = (branchPlan: ActionPlan): PlanExecutorInput => ({
    ...input,
    plan: branchPlan,
    depth: input.depth + 1,
  });
  const tasks = branches.map((branch) => async () => runInner(deps, childInput([branch]), idempotencyCache));
  const results: PlanExecutorResult[] = [];
  if (maxConcurrency && maxConcurrency > 0) {
    for (let i = 0; i < tasks.length; i += maxConcurrency) {
      const chunk = tasks.slice(i, i + maxConcurrency).map((t) => t());
      results.push(...(await Promise.all(chunk)));
    }
  } else {
    results.push(...(await Promise.all(tasks.map((t) => t()))));
  }
  const observations = results.flatMap((r) => r.observations);
  const finalBranch = results.find((r) => r.finalized);
  return {
    childObservations: observations,
    finalized: !!finalBranch,
    ...(finalBranch && { finalResult: finalBranch.finalResult }),
  };
};
