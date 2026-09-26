import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLiveRows } from '../../src/engine/live.js';
import type { LiveRowsEvent, RowsSource } from '../../src/engine/live.js';
import type { Row } from '../../src/adapters/adapter.types.js';

// The rows behind `refresh: 'reactive'`: shared by key, invalidated by table
// version, refetched once per burst, bounded by age and size.

const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

// A source whose answer the test controls, counting how often it is asked.
const sourceOf = (tables: string[], answer: () => Row[]): RowsSource & { calls: () => number } => {
  let calls = 0;
  return {
    tables,
    fetch: async () => {
      calls += 1;
      return answer();
    },
    calls: () => calls,
  };
};

const flush = async (ms = 20): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

afterEach(() => {
  vi.useRealTimers();
});

describe('live rows — reading', () => {
  it('answers a repeat from the cache, and a new version from the database', async () => {
    const live = createLiveRows();
    let rows: Row[] = [{ id: 1 }];
    const source = sourceOf(['members'], () => rows);
    expect(await live.read('k', source)).toEqual([{ id: 1 }]);
    expect(await live.read('k', source)).toEqual([{ id: 1 }]);
    expect(source.calls()).toBe(1);

    rows = [{ id: 2 }];
    live.invalidate(['members']);
    expect(await live.read('k', source)).toEqual([{ id: 2 }]);
    expect(source.calls()).toBe(2);
    expect(live.stats()).toMatchObject({ hits: 1, misses: 2, entries: 1 });
  });

  it('a write to a table the query does not read leaves it cached', async () => {
    const live = createLiveRows();
    const source = sourceOf(['members'], () => [{ id: 1 }]);
    await live.read('k', source);
    live.invalidate(['houses']);
    await live.read('k', source);
    expect(source.calls()).toBe(1);
  });

  it('simultaneous reads of one key share one fetch', async () => {
    const live = createLiveRows();
    const gate = deferred<Row[]>();
    let calls = 0;
    const source: RowsSource = { tables: ['t'], fetch: () => { calls += 1; return gate.promise; } };
    const both = Promise.all([live.read('k', source), live.read('k', source)]);
    gate.resolve([{ id: 1 }]);
    expect(await both).toEqual([[{ id: 1 }], [{ id: 1 }]]);
    expect(calls).toBe(1);
  });

  it('rows read before a write and landing after it are never served as current', async () => {
    const live = createLiveRows();
    const before = deferred<Row[]>();
    let calls = 0;
    const source: RowsSource = {
      tables: ['t'],
      fetch: () => {
        calls += 1;
        return calls === 1 ? before.promise : Promise.resolve([{ v: 'after' }]);
      },
    };
    const first = live.read('k', source);
    live.invalidate(['t']); // the write commits while the first read is out
    // A read now must not join the fetch that started before the write…
    const second = live.read('k', source);
    before.resolve([{ v: 'before' }]);
    expect(await first).toEqual([{ v: 'before' }]);
    expect(await second).toEqual([{ v: 'after' }]);
    // …and whatever landed last, the cache holds what is current.
    expect(await live.read('k', source)).toEqual([{ v: 'after' }]);
  });

  it('expires stored rows after the TTL', async () => {
    let clock = 0;
    const live = createLiveRows({ ttlMs: 1_000 }, () => {}, () => clock);
    const source = sourceOf(['t'], () => [{ id: 1 }]);
    await live.read('k', source);
    clock = 999;
    await live.read('k', source);
    expect(source.calls()).toBe(1);
    clock = 1_000;
    await live.read('k', source);
    expect(source.calls()).toBe(2);
  });
});

describe('live rows — bounds', () => {
  it('evicts the least recently used when full, and says so', async () => {
    const events: LiveRowsEvent[] = [];
    const live = createLiveRows({ maxEntries: 2 }, (event) => events.push(event));
    const a = sourceOf(['t'], () => [{ id: 'a' }]);
    const b = sourceOf(['t'], () => [{ id: 'b' }]);
    const c = sourceOf(['t'], () => [{ id: 'c' }]);
    await live.read('a', a);
    await live.read('b', b);
    await live.read('a', a); // a is now the most recent
    await live.read('c', c); // b goes
    expect(live.stats()).toMatchObject({ entries: 2, evictions: 1 });
    expect(events).toEqual([expect.objectContaining({ type: 'rows.evict', reason: 'capacity' })]);
    await live.read('a', a);
    expect(a.calls()).toBe(1);
    await live.read('b', b);
    expect(b.calls()).toBe(2);
  });

  it('bounds stored text, and never stores a result bigger than one entry may be', async () => {
    const live = createLiveRows({ maxBytes: 200, maxEntryBytes: 60 });
    const big = sourceOf(['t'], () => [{ text: 'x'.repeat(100) }]);
    await live.read('big', big);
    await live.read('big', big);
    expect(big.calls()).toBe(2);
    expect(live.stats()).toMatchObject({ entries: 0, bytes: 0, oversized: 2 });

    for (const key of ['a', 'b', 'c', 'd', 'e']) await live.read(key, sourceOf(['t'], () => [{ key, pad: 'p'.repeat(20) }]));
    expect(live.stats().bytes).toBeLessThanOrEqual(200);
  });
});

describe('live rows — following', () => {
  it('refetches once per burst of writes and tells followers only when the rows changed', async () => {
    vi.useFakeTimers();
    const live = createLiveRows({ debounceMs: 10 });
    let rows: Row[] = [{ id: 1 }];
    const source = sourceOf(['members'], () => rows);
    const first = await live.read('k', source);
    const delivered: Row[][] = [];
    const controller = new AbortController();
    live.follow('k', source, first, { deliver: (next) => delivered.push(next) }, controller.signal);

    rows = [{ id: 1 }, { id: 2 }];
    for (let i = 0; i < 30; i += 1) live.invalidate(['members']);
    await flush();
    expect(source.calls()).toBe(2);
    expect(delivered).toEqual([[{ id: 1 }, { id: 2 }]]);

    // A write that did not change these rows: refetched, nobody told.
    live.invalidate(['members']);
    await flush();
    expect(source.calls()).toBe(3);
    expect(delivered).toHaveLength(1);
    live.stop();
  });

  it('shares one refetch between every follower of a key', async () => {
    vi.useFakeTimers();
    const live = createLiveRows();
    let rows: Row[] = [{ n: 1 }];
    const source = sourceOf(['t'], () => rows);
    const first = await live.read('k', source);
    const seen: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      live.follow('k', source, first, { deliver: () => seen.push(i) }, new AbortController().signal);
    }
    rows = [{ n: 2 }];
    live.invalidate(['t']);
    await flush();
    expect(source.calls()).toBe(2);
    expect(seen).toHaveLength(20);
    expect(live.stats()).toMatchObject({ follows: 1, followers: 20 });
    live.stop();
  });

  it('a follow ends when its last follower aborts', async () => {
    vi.useFakeTimers();
    const live = createLiveRows();
    const source = sourceOf(['t'], () => [{ n: 1 }]);
    const first = await live.read('k', source);
    const one = new AbortController();
    const two = new AbortController();
    live.follow('k', source, first, { deliver: () => {} }, one.signal);
    live.follow('k', source, first, { deliver: () => {} }, two.signal);
    one.abort();
    expect(live.stats()).toMatchObject({ follows: 1, followers: 1 });
    two.abort();
    expect(live.stats()).toMatchObject({ follows: 0, followers: 0 });
    live.invalidate(['t']);
    await flush();
    expect(source.calls()).toBe(1);
  });

  it('re-checks a followed read once per TTL when nothing wrote — a lost invalidation heals', async () => {
    vi.useFakeTimers();
    const live = createLiveRows({ ttlMs: 1_000 }, () => {}, () => Date.now());
    let rows: Row[] = [{ n: 1 }];
    const source = sourceOf(['t'], () => rows);
    const first = await live.read('k', source);
    const delivered: Row[][] = [];
    live.follow('k', source, first, { deliver: (next) => delivered.push(next) }, new AbortController().signal);
    rows = [{ n: 2 }]; // written behind vex's back
    await vi.advanceTimersByTimeAsync(1_001);
    expect(delivered).toEqual([[{ n: 2 }]]);
    live.stop();
  });

  it('a refetch that fails keeps the last answer', async () => {
    vi.useFakeTimers();
    const events: LiveRowsEvent[] = [];
    const live = createLiveRows({}, (event) => events.push(event));
    let fail = false;
    const source: RowsSource = {
      tables: ['t'],
      fetch: async () => {
        if (fail) throw new Error('database gone');
        return [{ n: 1 }];
      },
    };
    const first = await live.read('k', source);
    const delivered: Row[][] = [];
    live.follow('k', source, first, { deliver: (next) => delivered.push(next) }, new AbortController().signal);
    fail = true;
    live.invalidate(['t']);
    await flush();
    expect(delivered).toEqual([]);
    expect(events).toContainEqual({ type: 'rows.error', message: 'database gone' });
    live.stop();
  });
});
