import { afterEach, describe, it, expect } from 'vitest';
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
});

describe('stopping the tide driver', () => {
  it('stop resolves only once the drain in flight has finished', async () => {
    const engine = heldEngine();
    const driver = createTideDriver({ tide: engine.tide });
    void driver.wake();
    let stopped = false;
    const stopping = driver.stop().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
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
    await new Promise((resolve) => setTimeout(resolve, 20));
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

const countedEngine = (nextDue: Tide['nextDue']): { tide: Tide; advances: () => number } => {
  const real = createTide({ store: createMemoryStore(), transform: testTransform });
  let advances = 0;
  const tide: Tide = {
    ...real,
    advance: async (options) => {
      advances += 1;
      return real.advance(options);
    },
    nextDue,
  };
  return { tide, advances: () => advances };
};

describe('a delay longer than a timer can hold', () => {
  it('a next due instant a month off is waited for, not woken for every millisecond', async () => {
    const engine = countedEngine(async (now) => now + TOO_LONG_FOR_A_TIMER);
    const driver = createTideDriver({ tide: engine.tide });
    await driver.wake();
    expect(engine.advances()).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 60));
    await driver.stop();
    expect(engine.advances()).toBe(1);
  });

  it('a janitor beat that long does not beat every millisecond', async () => {
    const engine = countedEngine(async () => undefined);
    const driver = createTideDriver({ tide: engine.tide, janitorMs: TOO_LONG_FOR_A_TIMER });
    await new Promise((resolve) => setTimeout(resolve, 60));
    await driver.stop();
    expect(engine.advances()).toBe(0);
  });
});
