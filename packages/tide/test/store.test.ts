import { describe, it } from 'vitest';
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
