import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGeneration } from '../src/manifest/generation';
import type { Pointer } from '../src/manifest/generation';

const fakePool = (start = 0): Pointer & { poke: () => number; value: () => number } => {
  let n = start;
  return {
    read: async () => n,
    move: async (from) => {
      if (n !== from) return false;
      n += 1;
      return true;
    },
    poke: () => (n += 1),
    value: () => n,
  };
};

// The pointer is looked at on a timer, and the clock is the test's: `looks(n)` moves it on by
// n poll intervals, each run to its end.
const EVERY_MS = 1_000;
const looks = (count: number): Promise<unknown> => vi.advanceTimersByTimeAsync(count * EVERY_MS);
const settled = (): Promise<unknown> => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('generation pointer', () => {
  it('the first read establishes a baseline rather than reporting a move', async () => {
    let moves = 0;
    const gen = createGeneration(fakePool(7), { onMoved: () => void (moves += 1), everyMs: 0 });
    await settled();
    expect(moves).toBe(0);
    expect(gen.current()).toBe(7);
    gen.stop();
  });

  it('another process moving the pointer is observed exactly once per move', async () => {
    const pool = fakePool();
    let moves = 0;
    const gen = createGeneration(pool, { onMoved: () => void (moves += 1), everyMs: EVERY_MS });
    await settled();
    expect(moves).toBe(0);

    pool.poke();
    await looks(1);
    expect(moves).toBe(1);

    await looks(10);
    expect(moves).toBe(1);
    gen.stop();
  });

  it('a process does not react to its own bump', async () => {
    const pool = fakePool();
    let moves = 0;
    const gen = createGeneration(pool, { onMoved: () => void (moves += 1), everyMs: EVERY_MS });
    await settled();

    gen.bump();
    await looks(3);
    expect(pool.value()).toBe(1);
    expect(moves).toBe(0);
    expect(gen.current()).toBe(1);
    gen.stop();
  });

  it('a pointer it cannot read is loud, not silent', async () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args[0]);
    const broken: Pointer = {
      read: async () => {
        throw new Error('relation "moss_generation" does not exist');
      },
      move: async () => false,
    };
    const gen = createGeneration(broken, { onMoved: () => undefined, everyMs: 0 });
    await settled();
    console.error = original;
    expect(errors.some((e) => String(e).includes('may be serving stale resolutions'))).toBe(true);
    gen.stop();
  });

  it('a move it could not follow is said to be that, and is followed at the next look', async () => {
    const pool = fakePool();
    const errors: string[] = [];
    const told: string[] = [];
    const original = console.error;
    const originalLog = console.log;
    console.error = (...args: unknown[]) => errors.push(String(args[0]));
    console.log = (...args: unknown[]) => told.push(String(args[0]));
    let tries = 0;
    let followed = 0;
    const gen = createGeneration(pool, {
      onMoved: () => {
        tries += 1;
        if (tries === 1) throw new Error('the database blinked');
        followed += 1;
      },
      everyMs: EVERY_MS,
    });
    try {
      await settled();
      pool.poke();
      await looks(1);
      expect([tries, followed, gen.current()]).toEqual([1, 0, 0]);
      await looks(1);
      expect([tries, followed, gen.current()]).toEqual([2, 1, 1]);
      await looks(5);
      expect(tries).toBe(2);
    } finally {
      gen.stop();
      console.error = original;
      console.log = originalLog;
    }

    expect(errors.filter((line) => line.includes('could not follow'))).toHaveLength(1);
    expect(errors.filter((line) => line.includes('could not read'))).toEqual([]);
    expect(told).toEqual(['[moss:generation] followed the generation pointer to 1, after 1 look that failed — this process serves what the rows say again']);
  });

  it('a move that cannot be followed is said when it first fails, again when what it says changes, and once when it is followed', async () => {
    const pool = fakePool();
    const said: string[] = [];
    const originals = { error: console.error, log: console.log };
    console.error = (...args: unknown[]) => void said.push(String(args[0]));
    console.log = (...args: unknown[]) => void said.push(String(args[0]));
    const notFollowed = (): string[] => said.filter((line) => line.includes('could not follow'));
    const recovered = (): string[] => said.filter((line) => line.includes('[moss:generation]') && line.includes('followed') && !line.includes('could not'));
    let why: string | undefined = 'a set this process refuses';
    let tries = 0;
    const gen = createGeneration(pool, {
      onMoved: () => {
        tries += 1;
        if (why !== undefined) throw new Error(why);
      },
      everyMs: EVERY_MS,
    });
    try {
      await settled();
      pool.poke();
      await looks(3);
      expect(tries).toBe(3);
      expect(notFollowed()).toHaveLength(1);
      expect(notFollowed()[0]).toContain('a set this process refuses');
      expect(gen.current()).toBe(0);

      why = 'the database is out of reach';
      await looks(3);
      expect(tries).toBe(6);
      expect(notFollowed()).toHaveLength(2);
      expect(notFollowed()[1]).toContain('the database is out of reach');

      pool.poke();
      await looks(3);
      expect(tries).toBe(9);
      expect(notFollowed()).toHaveLength(3);
      expect(notFollowed()[2]).toContain('0 → 2');
      expect(recovered()).toEqual([]);

      why = undefined;
      await looks(1);
      expect(gen.current()).toBe(2);
      expect(recovered()).toHaveLength(1);
      expect(tries).toBe(10);
      await looks(20);
      expect(tries).toBe(10);
      expect(notFollowed()).toHaveLength(3);
      expect(recovered()).toHaveLength(1);
    } finally {
      gen.stop();
      console.error = originals.error;
      console.log = originals.log;
    }
  });

  it('a move that is followed at once says nothing', async () => {
    const pool = fakePool();
    const said: string[] = [];
    const originals = { error: console.error, log: console.log };
    console.error = (...args: unknown[]) => void said.push(String(args[0]));
    console.log = (...args: unknown[]) => void said.push(String(args[0]));
    const gen = createGeneration(pool, { onMoved: () => undefined, everyMs: EVERY_MS });
    try {
      await settled();
      pool.poke();
      await looks(1);
      expect(gen.current()).toBe(1);
      expect(said).toEqual([]);
    } finally {
      gen.stop();
      console.error = originals.error;
      console.log = originals.log;
    }
  });

  it('its own bump does not pass over a move another process made first', async () => {
    const pool = fakePool();
    let moves = 0;
    const gen = createGeneration(pool, { onMoved: () => void (moves += 1), everyMs: EVERY_MS });
    await settled();

    pool.poke();
    gen.bump();
    await settled();
    expect(pool.value()).toBe(2);
    expect(gen.current()).toBe(0);
    expect(moves).toBe(0);

    await looks(1);
    expect(moves).toBe(1);
    expect(gen.current()).toBe(2);
    await looks(5);
    expect(moves).toBe(1);
    gen.stop();
  });

  it('stopping ends the polling', async () => {
    const pool = fakePool();
    let moves = 0;
    const gen = createGeneration(pool, { onMoved: () => void (moves += 1), everyMs: EVERY_MS });
    await settled();
    gen.stop();
    pool.poke();
    await looks(20);
    expect(moves).toBe(0);
  });
});
