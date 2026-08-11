import type { TickReport } from '../types';
import type { EngineDeps } from './runtime';
import { materializeClocks, pollSources } from './materialize';
import { matchFacts } from './match';
import { fanOut } from './fanout';
import { executeTasks, settleFirings } from './execute';

// ═══════════════════════════════════════════════════════════════
// The tick — the one heartbeat
//
// Everything happens inside it; nothing happens outside it. Tide's
// only notion of time is the `now` it is handed, which is what lets
// a headless check advance the clock and assert on rows with no
// sleeping, and what lets the same engine run under a Cloud
// Scheduler ping, a setInterval, or a dev script.
//
// Two instances ticking concurrently are safe by construction:
// materialization is idempotent on the occurrence key, window
// closes and task claims are exactly-once through the store, and
// a non-monotonic `now` (clock skew between hosts) merely delays
// work — it cannot duplicate it.
// ═══════════════════════════════════════════════════════════════

export type TickOptions = { now: number; limit?: number };

const DEFAULT_LIMIT = 100;

export const runTick = async (deps: EngineDeps, options: TickOptions): Promise<TickReport> => {
  const { now } = options;
  const limit = options.limit ?? DEFAULT_LIMIT;

  const clocks = await materializeClocks(deps, now);
  const polled = await pollSources(deps, now);
  const matched = await matchFacts(deps, now, limit);
  const tasksCreated = await fanOut(deps, now, limit);
  const executed = await executeTasks(deps, now, limit);
  // Settling AFTER execution in the same tick means a chain advances one
  // hop per tick — the nudge gives latency, the tick gives the guarantee.
  const firingsSettled = await settleFirings(deps, now);

  return {
    now,
    materialized: clocks.materialized,
    skippedOccurrences: clocks.skippedOccurrences,
    polled,
    factsMatched: matched.factsMatched,
    firingsCreated: clocks.firingsCreated + matched.firingsCreated,
    tasksCreated,
    executed: executed.executed,
    succeeded: executed.succeeded,
    failed: executed.failed,
    retrying: executed.retrying,
    firingsSettled,
    parked: matched.parked,
  };
};
