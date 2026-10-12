import type { AdvanceReport } from '../types';
import type { EngineDeps } from './runtime';
import { materializeClocks } from './materialize';
import { matchFacts } from './match';
import { fanOut } from './fanout';
import { executeTasks, settleRuns } from './execute';

export type AdvanceOptions = { now: number; limit?: number };

const DEFAULT_LIMIT = 100;

export const runAdvance = async (deps: EngineDeps, options: AdvanceOptions): Promise<AdvanceReport> => {
  const { now } = options;
  const limit = options.limit ?? DEFAULT_LIMIT;

  const clocks = await materializeClocks(deps, now);
  const matched = await matchFacts(deps, now, limit);
  const tasksCreated = await fanOut(deps, now, limit);
  const executed = await executeTasks(deps, now, limit);
  const runsSettled = await settleRuns(deps, now);

  return {
    now,
    materialized: clocks.materialized,
    skippedOccurrences: clocks.skippedOccurrences,
    factsMatched: matched.factsMatched,
    runsCreated: clocks.runsCreated + matched.runsCreated,
    tasksCreated,
    executed: executed.executed,
    succeeded: executed.succeeded,
    failed: executed.failed,
    retrying: executed.retrying,
    reclaimed: executed.reclaimed,
    runsSettled,
    parked: matched.parked,
  };
};
