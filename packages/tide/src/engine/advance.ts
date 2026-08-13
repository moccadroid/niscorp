import type { AdvanceReport } from '../types';
import type { EngineDeps } from './runtime';
import { materializeClocks } from './materialize';
import { matchFacts } from './match';
import { fanOut } from './fanout';
import { executeTasks, settleRuns } from './execute';

// ═══════════════════════════════════════════════════════════════
// Advance — one committed increment of the world
//
// Everything happens inside it; nothing happens outside it. Tide's
// only notion of time is the `now` it is handed, which is what lets
// a headless check time-travel and assert on rows with no sleeping,
// and what lets the same engine run under any driver.
//
// This is the DRIVER'S verb, not a pacing model. Tide never decides
// when to advance: a host's driver calls it on ingest (to
// quiescence — a chain advances one hop per call, so the driver
// loops until nothing moves), and `nextDue` tells that driver when
// the next instant worth waking for is. The old world advanced one
// hop per interval beat, which made every chain crawl at the
// metronome's speed and made the beat a throughput ceiling.
//
// Two instances advancing concurrently are safe by construction:
// materialization is idempotent on the occurrence key, window
// closes and task claims are exactly-once through the store, and
// a non-monotonic `now` (clock skew between hosts) merely delays
// work — it cannot duplicate it.
// ═══════════════════════════════════════════════════════════════

export type AdvanceOptions = { now: number; limit?: number };

const DEFAULT_LIMIT = 100;

export const runAdvance = async (deps: EngineDeps, options: AdvanceOptions): Promise<AdvanceReport> => {
  const { now } = options;
  const limit = options.limit ?? DEFAULT_LIMIT;

  const clocks = await materializeClocks(deps, now);
  const matched = await matchFacts(deps, now, limit);
  const tasksCreated = await fanOut(deps, now, limit);
  const executed = await executeTasks(deps, now, limit);
  // Settling AFTER execution in the same step means a chain advances one
  // hop per call — which is why the driver drains to quiescence.
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
