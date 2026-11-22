import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../src/index';
import { STORE_CONTRACT } from '../src/testing';
import type { TideStore } from '../src/index';

const STORES: readonly { name: string; make: () => TideStore }[] = [{ name: 'memory', make: createMemoryStore }];

for (const store of STORES)
  describe(`the store contract — ${store.name}`, () => {
    for (const check of STORE_CONTRACT) it(check.name, async () => check.run(store.make()));
  });

// Not a check in STORE_CONTRACT: one there would hold every host's own store to it.
describe('the memory store', () => {
  it('a value that was never given is not a key on the row', async () => {
    const store = createMemoryStore();
    const stored = await store.appendIfAbsent('fact', { kind: 'signal', name: 'ping', at: 1, depth: 0, cause: undefined, as: undefined });
    expect(Object.keys(stored ?? {}).sort()).toEqual(['at', 'depth', 'id', 'kind', 'name']);
    const [read] = await store.query({ table: 'fact' });
    expect(Object.keys(read ?? {}).sort()).toEqual(['at', 'depth', 'id', 'kind', 'name']);
  });

  it('claims the serial groups first, one row each, as the Postgres store does', async () => {
    const store = createMemoryStore();
    for (const id of ['a', 'b'])
      await store.appendIfAbsent('run', { id, reflexId: id, version: 'v', cause: `c:${id}`, state: 'fanned', depth: 0, total: 1, done: 0, failed: 0, dueAt: 0, createdAt: 0 });
    const task = (runId: string, unit: string, reflexId: string) =>
      ({ runId, reflexId, unit, cause: 'c', env: {}, depth: 0, state: 'pending', attempt: 0, claimedUntil: 0, notBefore: 0, createdAt: 0 }) as const;
    await store.appendIfAbsent('task', task('a', 'a1', 'parallel'));
    await store.appendIfAbsent('task', task('a', 'a2', 'parallel'));
    await store.appendIfAbsent('task', task('b', 'b1', 'serial'));
    await store.appendIfAbsent('task', task('b', 'b2', 'serial'));
    const claim = (limit: number) =>
      store.claim({
        table: 'task',
        where: { state: 'pending' },
        order: [{ by: 'unit' }],
        limit,
        set: { state: 'claimed', claimedUntil: 900 },
        onePer: { column: 'reflexId', held: { state: 'claimed', claimedUntil: { gt: 100 } }, only: ['serial'] },
      });
    expect((await claim(1)).map((row) => row.unit)).toEqual(['b1']);
    expect((await claim(3)).map((row) => row.unit)).toEqual(['a1', 'a2']);
  });
});
