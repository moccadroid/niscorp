import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGeneration } from '../src/manifest/generation';
import type { Pointer } from '../src/manifest/generation';

// The row, as this module is handed it: where the counter is, and one step on
// from where it was read. So the pointer is tested without a database.
const fakePool = (start = 0): Pointer & { poke: () => number; value: () => number } => {
  let n = start;
  return {
    read: async () => n,
    move: async (from) => {
      if (n !== from) return false;
      n += 1;
      return true;
    },
    // what another process did
    poke: () => (n += 1),
    value: () => n,
  };
};

// THE CLOCK IS THE TEST'S. The pointer is looked at once when it is made and
// then once every `everyMs`, on a timer. These tests waited on the real one:
// a poll every millisecond, and 20 to 80 ms of sleep in the hope that enough
// looks had happened, or `waitFor` until three more had. Here a look happens
// when the test says: the poll is a second, and `looks(n)` moves the clock on
// by n of them, each with everything it started run to its end. So "after one
// look" is one look, and "a quiet interval" is as many as the test names.
const EVERY_MS = 1_000;
const looks = (count: number): Promise<unknown> => vi.advanceTimersByTimeAsync(count * EVERY_MS);
// The look a pointer takes when it is made, and whatever else is already due.
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

    pool.poke(); // somebody else called refresh()
    await looks(1);
    expect(moves).toBe(1);

    // ...and a quiet interval is not a move. This is the assertion that keeps
    // the poll from becoming a periodic cache flush.
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
    // The write happened...
    expect(pool.value()).toBe(1);
    // ...and this process adopted it directly instead of discovering it later.
    // Without that, every refresh would cost the refreshing process a second,
    // pointless drop of every derivation it just rebuilt.
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
    // The whole point of choosing a counter over LISTEN/NOTIFY was that its
    // failure mode is visible. A silent one would reproduce the bug inside its
    // own fix.
    expect(errors.some((e) => String(e).includes('may be serving stale resolutions'))).toBe(true);
    gen.stop();
  });

  // A MOVE THIS PROCESS COULD NOT FOLLOW. The pointer was read, it had moved,
  // and reading the rows again threw (a database that blinked). The move was
  // counted as seen before the reload was tried, so the next look found
  // nothing new and never tried again: this process went on serving what it
  // had, until some other move. And the log said the pointer could not be
  // READ, which it had been.
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
      // The look that finds the move and cannot follow it...
      await looks(1);
      expect([tries, followed, gen.current()]).toEqual([1, 0, 0]);
      // ...and the next one, which can. After that there is nothing to try.
      await looks(1);
      expect([tries, followed, gen.current()]).toEqual([2, 1, 1]);
      await looks(5);
      expect(tries).toBe(2);
    } finally {
      gen.stop();
      console.error = original;
      console.log = originalLog;
    }

    // The pointer was read each time. What failed was following it.
    expect(errors.filter((line) => line.includes('could not follow'))).toHaveLength(1);
    expect(errors.filter((line) => line.includes('could not read'))).toEqual([]);
    // And that it was followed after all is said, once.
    expect(told).toEqual(['[moss:generation] followed the generation pointer to 1, after 1 look that failed — this process serves what the rows say again']);
  });

  // A MOVE THAT CANNOT BE FOLLOWED, FOR A LONG TIME. It is tried again at every
  // look, which is right, and every try said so in the log, which was a line
  // each poll for as long as a set this process refuses sat in the rows.
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
      // tried at every look, and said once
      expect(tries).toBe(3);
      expect(notFollowed()).toHaveLength(1);
      expect(notFollowed()[0]).toContain('a set this process refuses');
      expect(gen.current()).toBe(0);

      // it fails another way: that is news
      why = 'the database is out of reach';
      await looks(3);
      expect(tries).toBe(6);
      expect(notFollowed()).toHaveLength(2);
      expect(notFollowed()[1]).toContain('the database is out of reach');

      // another process moves the pointer again: what could not be followed is another move
      pool.poke();
      await looks(3);
      expect(tries).toBe(9);
      expect(notFollowed()).toHaveLength(3);
      expect(notFollowed()[2]).toContain('0 → 2');
      expect(recovered()).toEqual([]);

      // and then it can be followed: said once, and nothing is left to try
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

  // SOMEBODY ELSE'S MOVE, PASSED OVER BY ITS OWN. Another process moved the
  // pointer since this one last looked, and then this one moves it too. It
  // counted the number its own move landed on as seen, and that number is past
  // the other process's move: what that one changed was never read here.
  it('its own bump does not pass over a move another process made first', async () => {
    const pool = fakePool();
    let moves = 0;
    const gen = createGeneration(pool, { onMoved: () => void (moves += 1), everyMs: EVERY_MS });
    await settled();

    pool.poke(); // another process moved it, and no look has happened since
    gen.bump();
    await settled();
    // Its own move landed, on top of the other's...
    expect(pool.value()).toBe(2);
    // ...and neither is counted as seen, because the first has not been followed.
    expect(gen.current()).toBe(0);
    expect(moves).toBe(0);

    // The next look follows it, once.
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
