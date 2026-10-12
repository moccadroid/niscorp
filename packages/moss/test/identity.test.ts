import { describe, it, expect, vi, afterEach } from 'vitest';
import { createIdentityCache } from '../src/identity/cache';
import type { IdentityRecord } from '../src/identity';

// A clock the test advances by hand, so the revalidation window is not waited for. Tests set
// `idleMs: 0` so that no sweep timer starts, except the idle sweep's own.
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
    expect(second).toBe(first);
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

    const all = Promise.all(Array.from({ length: 6 }, () => cache.get('p_ava')));
    release?.();
    const records = await all;
    expect(calls).toBe(1);
    expect(new Set(records).size).toBe(1);
    cache.stop();
  });

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
    expect(cache.invalidate('p_ava')).toBe(false);
    const after = await cache.get('p_ava');

    expect(calls).toBe(2);
    expect(after).not.toBe(before);
    expect(after).toEqual(before);
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

  it('is bounded: the ceiling holds and eviction is least-recently-read', async () => {
    const cache = createIdentityCache({ resolve: async (p) => recordFor(p), max: 3, idleMs: 0 });

    await cache.get('a');
    await cache.get('b');
    await cache.get('c');
    expect(cache.meter().size).toBe(3);

    await cache.get('a');
    await cache.get('d');

    expect(cache.meter().size).toBe(3);
    expect(cache.meter().max).toBe(3);
    expect(cache.meter().evicted).toBe(1);
    expect(cache.list().map((r) => r.principal).sort()).toEqual(['a', 'c', 'd']);
    cache.stop();
  });

  it.each([0, -1])('refuses a ceiling of %s with a sentence, before anybody signs in', (max) => {
    expect(() => createIdentityCache({ resolve: async (p) => recordFor(p), max, idleMs: 0 })).toThrow(/identityMax.*at least one/);
  });

  it('a ceiling of one holds one', async () => {
    const cache = createIdentityCache({ resolve: async (p) => recordFor(p), max: 1, idleMs: 0 });
    await cache.get('a');
    await cache.get('b');
    expect(cache.list().map((r) => r.principal)).toEqual(['b']);
    expect(cache.meter().evicted).toBe(1);
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
    expect((await cache.get('p_tobias')).roles).toEqual(['member']);
    expect(calls).toBe(1);

    c.advance(2_000);
    expect((await cache.get('p_tobias')).roles).toEqual(['manager']);
    expect(calls).toBe(2);
    expect(cache.meter().expired).toBe(1);
    cache.stop();
  });

  it('a tag forgets one group and leaves the rest held', async () => {
    let calls = 0;
    const cache = createIdentityCache({
      resolve: async (p) => {
        calls += 1;
        return { roles: ['member'], scope: {}, tag: p.startsWith('a_') ? 'st_a' : 'st_b' };
      },
      idleMs: 0,
    });
    await cache.get('a_1');
    await cache.get('a_2');
    await cache.get('b_1');
    expect(cache.meter().size).toBe(3);

    expect(cache.invalidateTag('st_a')).toEqual(['a_1', 'a_2']);
    expect(cache.meter().size).toBe(1);
    expect(cache.list().map((r) => r.principal)).toEqual(['b_1']);

    const before = calls;
    await cache.get('b_1');
    expect(calls).toBe(before);

    expect(cache.invalidateTag('st_nobody')).toEqual([]);
    cache.stop();
  });

  it('the tag map cannot be read through — it only forgets', async () => {
    const cache = createIdentityCache({ resolve: async () => ({ roles: ['member'], scope: {}, tag: 'st_a' }), idleMs: 0 });
    await cache.get('a_1');
    const surface = Object.keys(cache).sort();
    expect(surface).toEqual(['get', 'invalidate', 'invalidateAll', 'invalidateTag', 'list', 'meter', 'stop']);
    expect(JSON.stringify(cache.list())).not.toContain('st_a');
    cache.stop();
  });

  it('forgetting a tagged record does not leave it in the tag map', async () => {
    const cache = createIdentityCache({ resolve: async () => ({ roles: ['member'], scope: {}, tag: 'st_a' }), idleMs: 0 });
    await cache.get('a_1');
    cache.invalidate('a_1');
    expect(cache.invalidateTag('st_a')).toEqual([]);
    cache.stop();
  });

  it('eviction under the ceiling prunes the tag map too', async () => {
    const cache = createIdentityCache({ resolve: async (p) => ({ roles: ['member'], scope: {}, tag: p }), max: 2, idleMs: 0 });
    await cache.get('a');
    await cache.get('b');
    await cache.get('c');
    expect(cache.meter().size).toBe(2);
    expect(cache.invalidateTag('a')).toEqual([]);
    expect(cache.invalidateTag('c')).toEqual(['c']);
    cache.stop();
  });

  it('the roster names principals and exposes no records', async () => {
    const cache = createIdentityCache({ resolve: async (p) => recordFor(p), idleMs: 0 });
    await cache.get('p_ava');

    const report = cache.list()[0];
    expect(report?.principal).toBe('p_ava');
    expect(Object.keys(report ?? {}).sort()).toEqual(['lastSeen', 'principal', 'since']);
    expect(JSON.stringify(cache.list())).not.toContain('studioId');
    expect(JSON.stringify(cache.list())).not.toContain('roles');
    cache.stop();
  });

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
    expect((await cache.get('p_ava')).roles).toEqual(['member']);
    cache.stop();
  });
});

describe('identity cache — an invalidation while a resolve is out', () => {
  const seam = () => {
    const out: Array<(record: IdentityRecord) => void> = [];
    return {
      resolve: (_principal: string): Promise<IdentityRecord> => new Promise<IdentityRecord>((land) => out.push(land)),
      land: (call: number, record: IdentityRecord): void => out[call]?.(record),
      calls: (): number => out.length,
    };
  };
  const member: IdentityRecord = { roles: ['member'], scope: {} };
  const manager: IdentityRecord = { roles: ['manager'], scope: {} };

  it('is not undone when that resolve lands', async () => {
    const app = seam();
    const cache = createIdentityCache({ resolve: app.resolve, idleMs: 0 });

    const asked = cache.get('p_tobias');
    expect(cache.invalidate('p_tobias')).toBe(false);
    app.land(0, member);

    expect((await asked).roles).toEqual(['member']);
    expect(cache.meter().size).toBe(0);
    const again = cache.get('p_tobias');
    expect(app.calls()).toBe(2);
    app.land(1, manager);
    expect((await again).roles).toEqual(['manager']);
    expect(cache.meter().size).toBe(1);
    cache.stop();
  });

  it('the answer read before does not replace the one read after', async () => {
    const app = seam();
    const cache = createIdentityCache({ resolve: app.resolve, idleMs: 0 });

    const before = cache.get('p_tobias');
    cache.invalidate('p_tobias');
    const after = cache.get('p_tobias');
    app.land(1, manager);
    await after;
    app.land(0, member);
    await before;

    expect((await cache.get('p_tobias')).roles).toEqual(['manager']);
    expect(app.calls()).toBe(2);
    cache.stop();
  });

  it('the resolve started after it is still the one a burst shares', async () => {
    const app = seam();
    const cache = createIdentityCache({ resolve: app.resolve, idleMs: 0 });

    const before = cache.get('p_tobias');
    cache.invalidate('p_tobias');
    const after = cache.get('p_tobias');
    app.land(0, member);
    await before;

    const third = cache.get('p_tobias');
    expect(app.calls()).toBe(2);
    app.land(1, manager);
    expect((await after).roles).toEqual(['manager']);
    expect((await third).roles).toEqual(['manager']);
    cache.stop();
  });

  it('holds for a record being revalidated: the re-read that was out is not kept', async () => {
    let t = 1_000;
    const app = seam();
    const cache = createIdentityCache({ resolve: app.resolve, idleMs: 0, revalidateMs: 60_000, now: () => t });
    const first = cache.get('p_tobias');
    app.land(0, member);
    await first;

    t += 61_000;
    const reread = cache.get('p_tobias');
    expect(cache.invalidate('p_tobias')).toBe(true);
    app.land(1, member);
    await reread;
    expect(cache.meter().size).toBe(0);
    cache.stop();
  });

  it('holds for everybody at once', async () => {
    const app = seam();
    const cache = createIdentityCache({ resolve: app.resolve, idleMs: 0 });
    const ava = cache.get('p_ava');
    const omar = cache.get('p_omar');
    cache.invalidateAll();
    app.land(0, member);
    app.land(1, member);
    await Promise.all([ava, omar]);
    expect(cache.meter().size).toBe(0);
    cache.stop();
  });

  it('holds for a tag: somebody resolved for the first time who turns out to wear it is not kept', async () => {
    const app = seam();
    const cache = createIdentityCache({ resolve: app.resolve, idleMs: 0 });
    const asked = cache.get('a_1');
    expect(cache.invalidateTag('st_a')).toEqual([]);
    app.land(0, { roles: ['member'], scope: {}, tag: 'st_a' });
    await asked;
    expect(cache.meter().size).toBe(0);

    const again = cache.get('a_1');
    app.land(1, { roles: ['member'], scope: {}, tag: 'st_a' });
    await again;
    expect(cache.meter().size).toBe(1);
    cache.stop();
  });

  it('…and somebody who turns out to wear another tag is kept: one tenant, not the deployment', async () => {
    const app = seam();
    const cache = createIdentityCache({ resolve: app.resolve, idleMs: 0 });
    const asked = cache.get('b_1');
    cache.invalidateTag('st_a');
    app.land(0, { roles: ['member'], scope: {}, tag: 'st_b' });
    await asked;
    expect(cache.meter().size).toBe(1);
    await cache.get('b_1');
    expect(app.calls()).toBe(1);
    cache.stop();
  });

  it('holds for somebody held under the tag whose re-read was out: it is not kept, whichever tag it comes back wearing', async () => {
    let t = 1_000;
    const app = seam();
    const cache = createIdentityCache({ resolve: app.resolve, idleMs: 0, revalidateMs: 60_000, now: () => t });
    const first = cache.get('a_1');
    app.land(0, { roles: ['member'], scope: {}, tag: 'st_a' });
    await first;

    t += 61_000;
    const reread = cache.get('a_1');
    expect(cache.invalidateTag('st_a')).toEqual(['a_1']);
    app.land(1, { roles: ['member'], scope: {}, tag: 'st_b' });
    await reread;

    expect(cache.meter().size).toBe(0);
    void cache.get('a_1');
    expect(app.calls()).toBe(3);
    cache.stop();
  });
});

describe('identity cache — the idle sweep', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a record nobody asked for within `idleMs` is forgotten, and one that was asked for is kept', async () => {
    vi.useFakeTimers();
    const resolved: string[] = [];
    const cache = createIdentityCache({ resolve: async (principal) => (resolved.push(principal), { roles: ['member'], scope: {} }), idleMs: 10_000 });
    try {
      await cache.get('p_idle');
      await cache.get('p_busy');
      await vi.advanceTimersByTimeAsync(8_000);
      await cache.get('p_busy');
      await vi.advanceTimersByTimeAsync(4_000);

      expect(cache.list().map((held) => held.principal)).toEqual(['p_busy']);
      expect(cache.meter()).toMatchObject({ size: 1, evicted: 1 });
      await cache.get('p_idle');
      expect(resolved).toEqual(['p_idle', 'p_busy', 'p_idle']);
    } finally {
      cache.stop();
    }
  });

  it('stopping the cache stops the sweep', async () => {
    vi.useFakeTimers();
    const cache = createIdentityCache({ resolve: async () => ({ roles: ['member'], scope: {} }), idleMs: 10_000 });
    await cache.get('p_idle');
    cache.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cache.list().map((held) => held.principal)).toEqual(['p_idle']);
  });
});
