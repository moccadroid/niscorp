import { afterEach, describe, it, expect, vi } from 'vitest';
import { createMemoryStore, createTide, createTideDriver } from '../src/index';
import type { AdvanceReport, Tide } from '../src/index';
import { testTransform } from './support';

// THE DRIVER'S EDGE WITH ITS HOST: stopping. A host stops the driver and then
// closes the database under the engine (a dev server re-booting, a test
// ending). Found in lyceum's dev server: the next-due read that runs after
// every drain was still in flight when the database closed, rejected
// unhandled, and took the whole process down.

const idle: AdvanceReport = {
  now: 0,
  succeeded: 0,
  failed: 0,
  retrying: 0,
  materialized: 0,
  skippedOccurrences: 0,
  factsMatched: 0,
  runsCreated: 0,
  tasksCreated: 0,
  executed: 0,
  reclaimed: 0,
  runsSettled: 0,
  parked: 0,
};

// Just the two methods the driver's wake path calls, each held until released.
const heldEngine = (): { tide: Tide; releaseAdvance: () => void; failNextDue: (error: Error) => void; nextDueAsked: Promise<void> } => {
  let releaseAdvance = (): void => {};
  let failNextDue = (_error: Error): void => {};
  let asked = (): void => {};
  const nextDueAsked = new Promise<void>((resolve) => {
    asked = resolve;
  });
  const engine = {
    advance: () =>
      new Promise<AdvanceReport>((resolve) => {
        releaseAdvance = () => resolve(idle);
      }),
    nextDue: () =>
      new Promise<number | undefined>((_resolve, reject) => {
        failNextDue = reject;
        asked();
      }),
  };
  return { tide: engine as unknown as Tide, releaseAdvance: () => releaseAdvance(), failNextDue: (error) => failNextDue(error), nextDueAsked };
};

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown): void => {
  unhandled.push(reason);
};
process.on('unhandledRejection', onUnhandled);
afterEach(() => {
  unhandled.length = 0;
  vi.useRealTimers();
});

// A turn of the event loop, on the real one. Not a wait on a clock: Node
// reports a rejection nobody handled once the turn it happened in is over,
// so one turn later it has been reported or it never will be.
const aTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('stopping the tide driver', () => {
  it('stop resolves only once the drain in flight has finished', async () => {
    const engine = heldEngine();
    const driver = createTideDriver({ tide: engine.tide });
    void driver.wake();
    let stopped = false;
    const stopping = driver.stop().then(() => {
      stopped = true;
    });
    // The drain is held by the test and by nothing else: a turn later `stop`
    // has had every chance to resolve early, and has not.
    await aTurn();
    expect(stopped).toBe(false);
    engine.releaseAdvance();
    await stopping;
    expect(stopped).toBe(true);
  });

  it('a next-due read failing because the store closed under it is swallowed — no unhandled rejection', async () => {
    const engine = heldEngine();
    const driver = createTideDriver({ tide: engine.tide });
    void driver.wake();
    engine.releaseAdvance();
    await engine.nextDueAsked;
    const stopping = driver.stop();
    engine.failNextDue(new Error('PGlite is closed'));
    await stopping;
    await aTurn();
    expect(unhandled).toEqual([]);
  });
});

// A DELAY A TIMER CANNOT HOLD. Node keeps a timer's delay in 32 bits: one over
// 2^31 − 1 ms (24.8 days) is not refused, it is set to 1 ms, with a warning.
// So a reflex whose next occurrence was a month off made the driver a loop:
// wake, find nothing to do, ask when, sleep "a month", wake a millisecond
// later. The same for a janitor's beat somebody set that long.
//
// A real engine over an empty store, with one answer replaced: nothing here is
// cast into being a tide.
const TOO_LONG_FOR_A_TIMER = 2 ** 31 + 60_000;

// A real engine that keeps the instant of each time it was advanced.
const countedEngine = (nextDue: Tide['nextDue']): { tide: Tide; advances: () => number; advancedAt: () => readonly number[] } => {
  const real = createTide({ store: createMemoryStore(), transform: testTransform });
  const at: number[] = [];
  const tide: Tide = {
    ...real,
    advance: async (options) => {
      at.push(options?.now ?? Date.now());
      return real.advance(options);
    },
    nextDue,
  };
  return { tide, advances: () => at.length, advancedAt: () => at };
};

// THE CLOCK IS THE TEST'S HERE. These two slept 60 ms on the real one and
// counted: a loop of a wake each millisecond showed as about sixty, and a
// machine that fitted fewer into the sleep showed fewer. On a clock the test
// moves, a minute passes with no wake where the loop made sixty thousand, and
// the wake that is due a month off happens at that instant.
//
// The janitor's beat is set as long as the delay in both: by default it wakes
// the driver every five minutes whatever is due, and these are about one
// timer at a time.
describe('a delay longer than a timer can hold', () => {
  const A_MINUTE = 60_000;

  it('a next due instant a month off is waited for, not woken for every millisecond', async () => {
    vi.useFakeTimers();
    const started = Date.now();
    const due = started + TOO_LONG_FOR_A_TIMER;
    const engine = countedEngine(async () => due);
    const driver = createTideDriver({ tide: engine.tide, janitorMs: TOO_LONG_FOR_A_TIMER });
    await driver.wake();
    expect(engine.advances()).toBe(1);
    await vi.advanceTimersByTimeAsync(A_MINUTE);
    expect(engine.advances()).toBe(1);
    // ...and it is not forgotten: a timer holds 24.8 days, so the driver wakes
    // then, finds the instant still ahead, and waits out the rest of it.
    await vi.advanceTimersByTimeAsync(TOO_LONG_FOR_A_TIMER);
    expect(engine.advancedAt()).toContain(started + 2 ** 31 - 1);
    expect(engine.advancedAt()).toContain(due);
    expect(engine.advances()).toBeLessThan(6);
    await driver.stop();
  });

  it('a janitor beat that long does not beat every millisecond', async () => {
    vi.useFakeTimers();
    const started = Date.now();
    const engine = countedEngine(async () => undefined);
    const driver = createTideDriver({ tide: engine.tide, janitorMs: TOO_LONG_FOR_A_TIMER });
    await vi.advanceTimersByTimeAsync(A_MINUTE);
    expect(engine.advances()).toBe(0);
    // It beats as far off as a timer can hold: 2^31 − 1 ms.
    await vi.advanceTimersByTimeAsync(2 ** 31);
    expect(engine.advancedAt()).toEqual([started + 2 ** 31 - 1]);
    await driver.stop();
  });
});
