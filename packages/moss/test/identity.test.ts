import { describe, it, expect } from 'vitest';
import { createIdentityCache } from '../src/identity';
import type { IdentityRecord } from '../src/identity';

// A controllable clock, so the sweep and the revalidation window are tested
// rather than waited for. `setInterval` is never reached: every test drives
// eviction through the paths a request takes.
const clock = () => {
  let t = 1_000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};

const recordFor = (principal: string): IdentityRecord => ({
  roles: ['member'],
  scope: { studioId: `st_${principal}` },
});

describe('identity cache', () => {
  it('resolves once per principal and serves the held record after that', async () => {
    let calls = 0;
    const cache = createIdentityCache({
      resolve: async (p) => {
        calls += 1;
        return recordFor(p);
      },
      idleMs: 0,
    });

    const first = await cache.get('p_ava');
    const second = await cache.get('p_ava');
    expect(calls).toBe(1);
    expect(second).toBe(first); // the same object, not an equal one
    expect(cache.meter().resolved).toBe(1);
    cache.stop();
  });

  it('a burst at login resolves ONCE, not once per connection', async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => (release = r));
    const cache = createIdentityCache({
      resolve: async (p) => {
        calls += 1;
        await gate;
        return recordFor(p);
      },
      idleMs: 0,
    });

    // Six concurrent reads, which is what a browser opening a page does.
    const all = Promise.all(Array.from({ length: 6 }, () => cache.get('p_ava')));
    release?.();
    const records = await all;
    expect(calls).toBe(1);
    expect(new Set(records).size).toBe(1);
    cache.stop();
  });

  // INVARIANT 3 — losing the cache must lose no information. If dropping it
  // loses something, it was not a cache.
  it('dropping a record loses nothing: the next read re-resolves the same answer', async () => {
    let calls = 0;
    const cache = createIdentityCache({
      resolve: async (p) => {
        calls += 1;
        return recordFor(p);
      },
      idleMs: 0,
    });

    const before = await cache.get('p_ava');
    expect(cache.invalidate('p_ava')).toBe(true);
    expect(cache.invalidate('p_ava')).toBe(false); // not an error, an answer
    const after = await cache.get('p_ava');

    expect(calls).toBe(2);
    expect(after).not.toBe(before); // genuinely re-resolved
    expect(after).toEqual(before); // and the answer is identical
    cache.stop();
  });

  it('invalidateAll forgets everybody — the generation pointer moved', async () => {
    let calls = 0;
    const cache = createIdentityCache({ resolve: async (p) => (calls += 1, recordFor(p)), idleMs: 0 });
    await cache.get('p_ava');
    await cache.get('p_omar');
    expect(cache.meter().size).toBe(2);

    cache.invalidateAll();
    expect(cache.meter().size).toBe(0);
    await cache.get('p_ava');
    expect(calls).toBe(3);
    cache.stop();
  });

  // INVARIANT 5 / 6 — bounded, and the bound is enforced rather than hoped at.
  // The directory's worst property was that it worked beautifully at demo scale
  // and died at production scale with no signal in between.
  it('is bounded: the ceiling holds and eviction is least-recently-read', async () => {
    const cache = createIdentityCache({ resolve: async (p) => recordFor(p), max: 3, idleMs: 0 });

    await cache.get('a');
    await cache.get('b');
    await cache.get('c');
    expect(cache.meter().size).toBe(3);

    await cache.get('a'); // 'a' is now the most recently read; 'b' is the oldest
    await cache.get('d');

    expect(cache.meter().size).toBe(3);
    expect(cache.meter().max).toBe(3);
    expect(cache.meter().evicted).toBe(1);
    expect(cache.list().map((r) => r.principal).sort()).toEqual(['a', 'c', 'd']);
    cache.stop();
  });

  it('re-resolving somebody already held evicts nobody', async () => {
    const cache = createIdentityCache({ resolve: async (p) => recordFor(p), max: 2, idleMs: 0 });
    await cache.get('a');
    await cache.get('b');
    cache.invalidate('a');
    await cache.get('a');
    expect(cache.meter().evicted).toBe(0);
    expect(cache.meter().size).toBe(2);
    cache.stop();
  });

  // D1, mechanically: a stale principal's window is the revalidation clock, and
  // it is the same clock a live socket credential already runs on.
  it('revalidates on the clock: a record older than the window re-resolves', async () => {
    const c = clock();
    let role = 'member';
    let calls = 0;
    const cache = createIdentityCache({
      resolve: async (p) => (calls += 1, { roles: [role], scope: { p } }),
      revalidateMs: 60_000,
      idleMs: 0,
      now: c.now,
    });

    expect((await cache.get('p_tobias')).roles).toEqual(['member']);
    role = 'manager';

    c.advance(59_000);
    expect((await cache.get('p_tobias')).roles).toEqual(['member']); // inside the window
    expect(calls).toBe(1);

    c.advance(2_000);
    expect((await cache.get('p_tobias')).roles).toEqual(['manager']); // past it
    expect(calls).toBe(2);
    expect(cache.meter().expired).toBe(1);
    cache.stop();
  });

  // INVARIANT 1 — enumeration is an OPERATOR capability and returns structural
  // facts. The roster must not become a way to read everybody's record, which
  // is the exact door `everyone()` opened in the directory this replaces.
  it('the roster names principals and exposes no records', async () => {
    const cache = createIdentityCache({ resolve: async (p) => recordFor(p), idleMs: 0 });
    await cache.get('p_ava');

    const report = cache.list()[0];
    expect(report?.principal).toBe('p_ava');
    expect(Object.keys(report ?? {}).sort()).toEqual(['lastSeen', 'principal', 'since']);
    // Falsifiable: if a record ever leaks onto the roster, these fail.
    expect(JSON.stringify(cache.list())).not.toContain('studioId');
    expect(JSON.stringify(cache.list())).not.toContain('roles');
    cache.stop();
  });

  // INVARIANT 4 — opaque contents. Moss must not read a field off an
  // app-supplied record, so a record whose every property throws on access must
  // still round-trip intact.
  it('never inspects what it holds', async () => {
    const booby = {
      roles: ['member'],
      get scope(): Record<string, unknown> {
        throw new Error('moss read a field off an application record');
      },
    } as unknown as IdentityRecord;

    const cache = createIdentityCache({ resolve: async () => booby, idleMs: 0 });
    const out = await cache.get('p_ava');
    expect(out).toBe(booby);
    expect(cache.list().length).toBe(1);
    expect(cache.meter().size).toBe(1);
    cache.stop();
  });

  it('a failed resolution is not cached, and does not wedge the principal', async () => {
    let attempt = 0;
    const cache = createIdentityCache({
      resolve: async (p) => {
        attempt += 1;
        if (attempt === 1) throw new Error('database is down');
        return recordFor(p);
      },
      idleMs: 0,
    });

    await expect(cache.get('p_ava')).rejects.toThrow('database is down');
    expect(cache.meter().size).toBe(0);
    // The next request must be able to succeed — a transient failure that
    // poisons a principal until restart is worse than the failure.
    expect((await cache.get('p_ava')).roles).toEqual(['member']);
    cache.stop();
  });
});
