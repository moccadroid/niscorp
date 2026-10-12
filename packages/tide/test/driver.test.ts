import { afterEach, describe, it, expect, vi } from 'vitest';
import { createMemoryStore, createTide, createTideDriver } from '../src/index';
import type { AdvanceReport, Tide } from '../src/index';
import { testTransform } from './support';

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

// Node reports a rejection nobody handled once the turn it happened in is over, so one turn
// later it has been reported or it never will be.
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

const TOO_LONG_FOR_A_TIMER = 2 ** 31 + 60_000;

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

// The janitor's beat is set as long as the delay in both: by default it wakes the driver every
// five minutes whatever is due, and these are about one timer at a time.
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
    await vi.advanceTimersByTimeAsync(2 ** 31);
    expect(engine.advancedAt()).toEqual([started + 2 ** 31 - 1]);
    await driver.stop();
  });
});
