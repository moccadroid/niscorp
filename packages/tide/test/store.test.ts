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
});
