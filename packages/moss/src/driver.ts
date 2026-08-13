import type { AdvanceReport, Fact, Retention, Tide } from '@niscorp/tide';

// ═══════════════════════════════════════════════════════════════
// The tide driver — wake on ingest, sleep until the next due
// instant, and a janitor for what fell behind the couch.
//
// Tide reads no clocks and paces nothing; this is the thing that
// does. Three duties:
//
//   WAKE — every ingest (a write fact off the vex bridge, a signal,
//   a manual fire) advances the engine immediately, to quiescence:
//   a chain advances one hop per committed step, so the driver
//   loops until a step reports nothing moved. Chains stop crawling
//   at a metronome's speed and run at the store's.
//
//   SLEEP — after quiescence, `nextDue` names the next instant
//   worth waking for (a clock occurrence, a retry backoff, a lease
//   lapse, a delayed fact) and one timer sleeps until exactly then.
//   A new ingest preempts it. No beat, no polling for work.
//
//   JANITOR — a slow fallback wake plus retention sweep. It finds
//   nothing when nothing is broken; it exists because any durable
//   multi-worker design needs the scan that notices work committed
//   by a process that died before its own wake ran. It is how work
//   is RECOVERED, never how it moves.
//
// Concurrency: one drain at a time. A wake during a drain queues
// exactly one more pass (facts landed mid-drain are caught by it);
// the mutex is a flag pair, not a lock, because everything here is
// one event loop.
// ═══════════════════════════════════════════════════════════════

export type TideDriver = {
  // Delegates to tide, then wakes — the ingest edge a host should hand out
  // (the vex bridge mints through this) so a fact never waits for a beat.
  ingest: Tide['ingest'];
  fire: (reflexId: string, options: { now: number; input?: unknown; by?: string }) => Promise<Fact | undefined>;
  // Advance-to-quiescence now (idempotent, coalescing). Call after anything
  // that changes what tide would do — a reflex reload, an arm flip. The
  // promise resolves when the drain it triggered (or joined) reaches
  // quiescence, so a caller that must see the settled world — a "run now"
  // button whose screen re-reads — can await it; everyone else ignores it.
  wake: () => Promise<void>;
  stop: () => void;
};

export type TideDriverConfig = {
  tide: Tide;
  now?: () => number;
  // The janitor's beat. Frequent enough that a lapsed lease is not lapsed
  // for long; rare enough to be a recovery scan rather than a heartbeat.
  janitorMs?: number;
  // Ledger retention, swept on the janitor's beat. Absent = never swept —
  // an honest default; how long history matters is the host's call.
  retention?: Retention;
};

const DEFAULT_JANITOR_MS = 300_000;
// A backstop against a step that always reports progress (which would be a
// bug, not a workload) — generous enough that no real chain hits it.
const MAX_STEPS_PER_DRAIN = 10_000;

const progressOf = (report: AdvanceReport): number =>
  report.materialized +
  report.skippedOccurrences +
  report.factsMatched +
  report.runsCreated +
  report.tasksCreated +
  report.executed +
  report.reclaimed +
  report.runsSettled +
  report.parked;

export const createTideDriver = (config: TideDriverConfig): TideDriver => {
  const { tide } = config;
  const now = config.now ?? (() => Date.now());
  const janitorMs = config.janitorMs ?? DEFAULT_JANITOR_MS;

  let running = false;
  let queued = false;
  let stopped = false;
  let cycle: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const drain = async (): Promise<void> => {
    for (let steps = 0; steps < MAX_STEPS_PER_DRAIN; steps += 1) {
      const report = await tide.advance({ now: now() });
      if (progressOf(report) === 0) return;
    }
    console.error(`[moss:tide-driver] a drain exceeded ${MAX_STEPS_PER_DRAIN} steps — stopping this pass; the janitor will resume it`);
  };

  const schedule = async (): Promise<void> => {
    if (stopped) return;
    const due = await tide.nextDue(now());
    if (timer !== undefined) clearTimeout(timer);
    if (due === undefined) return; // nothing scheduled — the next ingest wakes us
    const delay = due - now();
    // Quiescent yet still "due now" means advance cannot progress it (facts
    // waiting for reflexes to load, say). Retry on the janitor's beat, not
    // in a hot loop.
    timer = setTimeout(() => void wake(), delay > 0 ? delay : janitorMs);
    timer.unref?.();
  };

  // A wake during a drain queues one more pass INSIDE the same cycle, and
  // every waker gets the same cycle promise — so awaiting it always means
  // "quiescence including whatever landed while we drained".
  const wake = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    queued = true;
    if (running) return cycle ?? Promise.resolve();
    running = true;
    cycle = (async () => {
      try {
        while (queued) {
          queued = false;
          await drain();
        }
      } catch (err) {
        console.error('[moss:tide-driver]', err);
      } finally {
        running = false;
        cycle = undefined;
        void schedule();
      }
    })();
    return cycle;
  };

  const janitor = setInterval(() => {
    if (config.retention !== undefined) {
      void tide.sweep(now(), config.retention).catch((err) => console.error('[moss:tide-driver] sweep', err));
    }
    void wake();
  }, janitorMs);
  janitor.unref?.();

  return {
    ingest: async (fact, options) => {
      const stored = await tide.ingest(fact, options);
      if (stored !== undefined) void wake();
      return stored;
    },
    fire: async (reflexId, options) => {
      const fact = await tide.fire(reflexId, options);
      void wake();
      return fact;
    },
    wake,
    stop: () => {
      stopped = true;
      clearInterval(janitor);
      if (timer !== undefined) clearTimeout(timer);
    },
  };
};
