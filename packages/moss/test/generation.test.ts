import { describe, it, expect } from 'vitest';
import { createGeneration } from '../src/generation';

// A pool of exactly the shape this module uses, so the pointer is tested
// without a database and without waiting on a real clock.
const fakePool = (start = 0) => {
  let n = start;
  const pool = {
    query: async (sql: string) => {
      if (sql.startsWith('UPDATE')) {
        n += 1;
        return { rows: [] };
      }
      return { rows: [{ n }] };
    },
    // what another process did
    poke: () => (n += 1),
    value: () => n,
  };
  return pool as unknown as Parameters<typeof createGeneration>[0] & { poke: () => number; value: () => number };
};

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

describe('generation pointer', () => {
  it('the first read establishes a baseline rather than reporting a move', async () => {
    let moves = 0;
    const gen = createGeneration(fakePool(7), { onMoved: () => void (moves += 1), everyMs: 0 });
    await settle();
    expect(moves).toBe(0);
    expect(gen.current()).toBe(7);
    gen.stop();
  });

  it('another process moving the pointer is observed exactly once per move', async () => {
    const pool = fakePool();
    let moves = 0;
    const gen = createGeneration(pool, { onMoved: () => void (moves += 1), everyMs: 1 });
    await settle();
    expect(moves).toBe(0);

    pool.poke(); // somebody else called refresh()
    await new Promise((r) => setTimeout(r, 20));
    expect(moves).toBe(1);

    // ...and a quiet interval is not a move. This is the assertion that keeps
    // the poll from becoming a periodic cache flush.
    await new Promise((r) => setTimeout(r, 20));
    expect(moves).toBe(1);
    gen.stop();
  });

  it('a process does not react to its own bump', async () => {
    const pool = fakePool();
    let moves = 0;
    const gen = createGeneration(pool, { onMoved: () => void (moves += 1), everyMs: 1 });
    await settle();

    gen.bump();
    await new Promise((r) => setTimeout(r, 25));
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
    const broken = { query: async () => { throw new Error('relation "moss_generation" does not exist'); } } as unknown as Parameters<typeof createGeneration>[0];
    const gen = createGeneration(broken, { onMoved: () => undefined, everyMs: 0 });
    await settle();
    console.error = original;
    // The whole point of choosing a counter over LISTEN/NOTIFY was that its
    // failure mode is visible. A silent one would reproduce the bug inside its
    // own fix.
    expect(errors.some((e) => String(e).includes('may be serving stale resolutions'))).toBe(true);
    gen.stop();
  });

  it('stopping ends the polling', async () => {
    const pool = fakePool();
    let moves = 0;
    const gen = createGeneration(pool, { onMoved: () => void (moves += 1), everyMs: 1 });
    await settle();
    gen.stop();
    pool.poke();
    await new Promise((r) => setTimeout(r, 20));
    expect(moves).toBe(0);
  });
});
