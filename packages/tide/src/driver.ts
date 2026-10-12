import type { Tide } from './tide';
import type { AdvanceReport, Fact, Retention } from './types';

export type TideDriver = {
  ingest: Tide['ingest'];
  fire: (reflexId: string, options: { now: number; input?: unknown; by?: string }) => Promise<Fact | undefined>;
  wake: () => Promise<void>;
  stop: () => Promise<void>;
};

export type TideDriverConfig = {
  tide: Tide;
  now?: () => number;
  janitorMs?: number;
  retention?: Retention;
};

const DEFAULT_JANITOR_MS = 300_000;
const MAX_STEPS_PER_DRAIN = 10_000;

// Node does not refuse a delay over 2^31 - 1 ms (24.8 days): it warns and waits 1 ms, which
// would turn a far-off wake into a loop. Waking early costs one advance that finds nothing.
const LONGEST_TIMER_MS = 2 ** 31 - 1;
const waitable = (ms: number): number => Math.min(ms, LONGEST_TIMER_MS);

// Asked of the value and not of its type, so this file needs no runtime's types: Node's timers
// have `unref`, and a timer anywhere else is a number that holds nothing open.
const letProcessEnd = (timer: unknown): void => {
  if (typeof timer !== 'object' || timer === null || !('unref' in timer)) return;
  const unref: unknown = timer.unref;
  if (typeof unref === 'function') Reflect.apply(unref, timer, []);
};

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
  const janitorMs = waitable(config.janitorMs ?? DEFAULT_JANITOR_MS);

  let running = false;
  let queued = false;
  let stopped = false;
  let cycle: Promise<void> | undefined;
  let scheduling: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const drain = async (): Promise<void> => {
    for (let steps = 0; steps < MAX_STEPS_PER_DRAIN; steps += 1) {
      const report = await tide.advance({ now: now() });
      if (progressOf(report) === 0) return;
    }
    console.error(`[tide:driver] a drain exceeded ${MAX_STEPS_PER_DRAIN} steps — stopping this pass; the janitor will resume it`);
  };

  // Never rejects: it runs detached, and an unhandled rejection would take the host's process down.
  const schedule = async (): Promise<void> => {
    if (stopped) return;
    let due: number | undefined;
    try {
      due = await tide.nextDue(now());
    } catch (err) {
      if (!stopped) console.error('[tide:driver] next due', err);
      return;
    }
    if (stopped) return;
    if (timer !== undefined) clearTimeout(timer);
    if (due === undefined) return;
    const delay = due - now();
    // Still due after a drain means advance cannot progress it (facts waiting for reflexes
    // to load, say): retry on the janitor's beat, not in a hot loop.
    timer = setTimeout(() => void wake(), delay > 0 ? waitable(delay) : janitorMs);
    letProcessEnd(timer);
  };

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
        console.error('[tide:driver]', err);
      } finally {
        running = false;
        cycle = undefined;
        scheduling = schedule();
      }
    })();
    return cycle;
  };

  const janitor = setInterval(() => {
    if (config.retention !== undefined) {
      void tide.sweep(now(), config.retention).catch((err) => console.error('[tide:driver] sweep', err));
    }
    void wake();
  }, janitorMs);
  letProcessEnd(janitor);

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
    stop: async () => {
      stopped = true;
      clearInterval(janitor);
      if (timer !== undefined) clearTimeout(timer);
      await cycle;
      await scheduling;
    },
  };
};
