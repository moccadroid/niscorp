import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../src/index';
import { STORE_CONTRACT } from '../src/testing';
import type { TideStore } from '../src/index';

// EVERY STORE RUNS EVERY CHECK.
//
// The list is a list so that adding one is a line rather than a project —
// which is the whole point. The last Postgres store said in its own header
// that it was "held to the same tests" and had none; it diverged in eleven
// ways, and every one of them was invisible to CI.
//
// Moss's vex-backed store imports the same `STORE_CONTRACT` from
// `@niscorp/tide/testing` and runs it against a real PGlite database, so the
// two implementations are held to one definition rather than to two readings
// of a comment.

const STORES: readonly { name: string; make: () => TideStore }[] = [{ name: 'memory', make: createMemoryStore }];

for (const store of STORES)
  describe(`the store contract — ${store.name}`, () => {
    for (const check of STORE_CONTRACT) it(check.name, async () => check.run(store.make()));
  });

// What the memory store holds itself to beside the contract: a row it hands
// back has no key for a value that was never given. That is what a row read
// back from a database is (moss's store), and what `undefined` already means
// in a `cas`. It is not a check in STORE_CONTRACT, because one there would
// hold every host's own store to it.
describe('the memory store', () => {
  it('a value that was never given is not a key on the row', async () => {
    const store = createMemoryStore();
    const stored = await store.appendIfAbsent('fact', { kind: 'signal', name: 'ping', at: 1, depth: 0, cause: undefined, as: undefined });
    expect(Object.keys(stored ?? {}).sort()).toEqual(['at', 'depth', 'id', 'kind', 'name']);
    const [read] = await store.query({ table: 'fact' });
    expect(Object.keys(read ?? {}).sort()).toEqual(['at', 'depth', 'id', 'kind', 'name']);
  });
});
