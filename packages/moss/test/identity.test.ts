import { describe, it, expect } from 'vitest';
import { createIdentityCache } from '../src/identity/cache';
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
  // The criterion the plan had written off as unachievable: a tenant-local
  // write must invalidate that tenant, not the deployment. It needs the app to
  // have said which records go together, because naming them any other way
  // means enumerating the population.
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

    // The untouched tenant is genuinely untouched — no re-resolution.
    const before = calls;
    await cache.get('b_1');
    expect(calls).toBe(before);

    // An unknown tag is an answer, not an error.
    expect(cache.invalidateTag('st_nobody')).toEqual([]);
    cache.stop();
  });

  it('the tag map cannot be read through — it only forgets', async () => {
    const cache = createIdentityCache({ resolve: async () => ({ roles: ['member'], scope: {}, tag: 'st_a' }), idleMs: 0 });
    await cache.get('a_1');
    // Falsifiable: if a `byTag`/`ofTag`/`find` ever appears, this fails and the
    // exception invariant 2 was granted stops being an exception.
    const surface = Object.keys(cache).sort();
    expect(surface).toEqual(['get', 'invalidate', 'invalidateAll', 'invalidateTag', 'list', 'meter', 'stop']);
    expect(JSON.stringify(cache.list())).not.toContain('st_a');
    cache.stop();
  });

  it('forgetting a tagged record does not leave it in the tag map', async () => {
    const cache = createIdentityCache({ resolve: async () => ({ roles: ['member'], scope: {}, tag: 'st_a' }), idleMs: 0 });
    await cache.get('a_1');
    cache.invalidate('a_1');
    // If the index leaked, this would still report one.
    expect(cache.invalidateTag('st_a')).toEqual([]);
    cache.stop();
  });

  it('eviction under the ceiling prunes the tag map too', async () => {
    const cache = createIdentityCache({ resolve: async (p) => ({ roles: ['member'], scope: {}, tag: p }), max: 2, idleMs: 0 });
    await cache.get('a');
    await cache.get('b');
    await cache.get('c'); // evicts 'a'
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

// AN INVALIDATION SAYS: whatever you know of this principal is stale. A resolve
// that was already out when it was said read its rows BEFORE — a role changed,
// an integration installed — so what it lands with is the stale answer, and
// holding it undoes the invalidation for as long as the record lives.
describe('identity cache — an invalidation while a resolve is out', () => {
  // A seam whose answers the test lands when it chooses, in the order it chooses.
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
    expect(cache.invalidate('p_tobias')).toBe(false); // nothing held yet: an answer
    app.land(0, member);

    // whoever was waiting is answered — they asked before it was said
    expect((await asked).roles).toEqual(['member']);
    // …and nothing is held, so the next ask goes back to the app
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
    app.land(0, member); // the older read lands last
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

    // the older one landing must not take the newer one out of flight
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

  // Which tag somebody wears is not known until their record lands, so a tag
  // forgotten while they were being resolved has to be remembered until then.
  it('holds for a tag: somebody resolved for the first time who turns out to wear it is not kept', async () => {
    const app = seam();
    const cache = createIdentityCache({ resolve: app.resolve, idleMs: 0 });
    const asked = cache.get('a_1');
    expect(cache.invalidateTag('st_a')).toEqual([]); // nobody held wears it yet
    app.land(0, { roles: ['member'], scope: {}, tag: 'st_a' });
    await asked;
    expect(cache.meter().size).toBe(0);

    // …and once that resolve has landed, the tag is no longer held against anybody
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
});
