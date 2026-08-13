import type { Run, Task, TideStore } from './types';

// ═══════════════════════════════════════════════════════════════
// THE STORE CONTRACT, AS EXECUTABLE CHECKS
//
// Shipped from the package rather than left in `test/`, because the
// contract is not tide's private business: anyone implementing a
// store — moss over vex, a host over its own pool — has to be able
// to run the same checks tide holds its own reference store to.
//
// This exists because the last Postgres store claimed in its header
// to be "held to the same tests" and had none. It diverged from the
// memory store in eleven ways: LIMIT applied before the serial
// filter, `listFacts` answering the opposite end of the list, a
// dedupe index that outlived its rows, `total` counted from the
// input array rather than the rows written. Every one of those was
// invisible because there was nothing to run.
//
// No test framework. Each check is a function that throws, so any
// runner can drive it:
//
//   for (const check of STORE_CONTRACT)
//     it(check.name, () => check.run(makeStore()));
// ═══════════════════════════════════════════════════════════════

export type StoreCheck = { name: string; run: (store: TideStore) => Promise<void> };

class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractError';
  }
}

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new ContractError(message);
};

const equal = (actual: unknown, expected: unknown, what: string): void =>
  assert(actual === expected, `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

// A minimal task, so a check reads as the thing it is checking rather than as
// a wall of required fields.
const task = (over: Partial<Task> = {}): Omit<Task, 'id'> & { id?: string } => ({
  runId: 'run_1',
  reflexId: 'r',
  unit: 'u1',
  cause: 'manual:test',
  env: {},
  depth: 0,
  state: 'pending' as const,
  attempt: 0,
  claimedUntil: 0,
  notBefore: 0,
  createdAt: 0,
  ...over,
});

const run = (over: Partial<Run> = {}): Omit<Run, 'id'> & { id?: string } => ({
  reflexId: 'r',
  version: 'v_0',
  cause: 'occurrence:2026-03-01',
  state: 'pending' as const,
  depth: 0,
  total: 0,
  done: 0,
  failed: 0,
  dueAt: 0,
  createdAt: 0,
  ...over,
});

// A task belongs to a run, and a store is entitled to enforce that — the SQL
// one does, with a foreign key, which is what makes `remove` cascade. So
// every check that wants work opens the run that owns it first.
const withRuns = async (store: TideStore, ...ids: readonly string[]): Promise<void> => {
  for (const id of ids) await store.appendIfAbsent('run', run({ id, cause: `occurrence:${id}` }));
};

export const STORE_CONTRACT: readonly StoreCheck[] = [
  // ── appendIfAbsent ───────────────────────────────────────────

  {
    name: 'appendIfAbsent mints an id and returns the stored row',
    run: async (store) => {
      const stored = await store.appendIfAbsent('run', run());
      assert(stored !== undefined, 'the first append must succeed');
      assert(typeof stored?.id === 'string' && stored.id.length > 0, 'the store mints the id');
      equal((await store.query({ table: 'run' })).length, 1, 'rows after one append');
    },
  },
  {
    name: 'appendIfAbsent refuses a duplicate on the unique key — this IS the idempotency',
    run: async (store) => {
      await store.appendIfAbsent('run', run());
      const second = await store.appendIfAbsent('run', run({ note: 'a different note' }));
      equal(second, undefined, 'a colliding append is a refusal, not an error');
      equal((await store.query({ table: 'run' })).length, 1, 'rows after the collision');
    },
  },
  {
    name: 'a different cause on the same reflex is a different run',
    run: async (store) => {
      await store.appendIfAbsent('run', run());
      const second = await store.appendIfAbsent('run', run({ cause: 'occurrence:2026-03-02' }));
      assert(second !== undefined, 'a distinct occurrence must open');
    },
  },
  {
    name: 'UNIQUE(runId, unit) — the grain the effect is written behind',
    run: async (store) => {
      await withRuns(store, 'run_1', 'run_2');
      await store.appendIfAbsent('task', task());
      equal(await store.appendIfAbsent('task', task()), undefined, 'the same unit twice is refused');
      assert((await store.appendIfAbsent('task', task({ unit: 'u2' }))) !== undefined, 'a different unit is a different task');
      assert((await store.appendIfAbsent('task', task({ runId: 'run_2' }))) !== undefined, 'the same unit in another run is another task');
    },
  },
  {
    name: 'a fact with no dedupeKey is never a duplicate',
    run: async (store) => {
      const one = { kind: 'signal' as const, name: 'ping', at: 1, depth: 0 };
      assert((await store.appendIfAbsent('fact', one)) !== undefined, 'first');
      assert((await store.appendIfAbsent('fact', one)) !== undefined, 'a fact claiming no identity is a distinct occurrence');
      equal((await store.query({ table: 'fact' })).length, 2, 'both are kept');
    },
  },
  {
    name: 'a fact WITH a dedupeKey is deduped, and entity is part of the key',
    run: async (store) => {
      const paid = { kind: 'write' as const, entity: 'payments', at: 1, depth: 0, dedupeKey: 'evt_1' };
      assert((await store.appendIfAbsent('fact', paid)) !== undefined, 'first');
      equal(await store.appendIfAbsent('fact', paid), undefined, 'a replayed provider event drops silently');
      // The old index was (kind, name, dedupe_key) and ignored `entity`, so
      // two producers over different tables that agreed on a key value ate
      // each other's rows.
      assert((await store.appendIfAbsent('fact', { ...paid, entity: 'refunds' })) !== undefined, 'another entity is another fact');
    },
  },

  // ── claim ────────────────────────────────────────────────────

  {
    name: 'claim takes a row exactly once',
    run: async (store) => {
      await withRuns(store, 'run_1');
      await store.appendIfAbsent('task', task());
      const first = await store.claim({ table: 'task', where: { state: 'pending' }, limit: 10, set: { state: 'claimed', token: 't1' } });
      const second = await store.claim({ table: 'task', where: { state: 'pending' }, limit: 10, set: { state: 'claimed', token: 't2' } });
      equal(first.length, 1, 'the first claim takes it');
      equal(second.length, 0, 'the second finds nothing — this is the whole promise');
      equal(first[0]?.token, 't1', 'the claim returns the row as written');
    },
  },
  {
    name: 'claim increments in one step, so a poison pill cannot retry forever',
    run: async (store) => {
      await withRuns(store, 'run_1');
      await store.appendIfAbsent('task', task({ attempt: 2 }));
      const [claimed] = await store.claim({ table: 'task', where: { state: 'pending' }, limit: 1, set: { state: 'claimed', attempt: { inc: 1 } } });
      equal(claimed?.attempt, 3, 'attempt rises with the claim, not after the effect');
    },
  },
  {
    name: 'claim honours limit and order',
    run: async (store) => {
      await withRuns(store, 'run_1');
      await store.appendIfAbsent('task', task({ unit: 'late', notBefore: 100 }));
      await store.appendIfAbsent('task', task({ unit: 'early', notBefore: 1 }));
      const claimed = await store.claim({
        table: 'task',
        where: { state: 'pending' },
        order: [{ by: 'notBefore' }],
        limit: 1,
        set: { state: 'claimed' },
      });
      equal(claimed.length, 1, 'limit is respected');
      equal(claimed[0]?.unit, 'early', 'the oldest due work goes first');
    },
  },
  {
    name: 'a lapsed lease is claimable again — the only recovery a dead process needs',
    run: async (store) => {
      await withRuns(store, 'run_1');
      await store.appendIfAbsent('task', task({ state: 'claimed', token: 'gone', claimedUntil: 50 }));
      const alive = await store.claim({
        table: 'task',
        where: { state: { in: ['pending', 'retrying', 'claimed'] }, notBefore: { lte: 40 }, claimedUntil: { lte: 40 } },
        limit: 10,
        set: { state: 'claimed', token: 'fresh' },
      });
      equal(alive.length, 0, 'a live lease is not stealable');

      const lapsed = await store.claim({
        table: 'task',
        where: { state: { in: ['pending', 'retrying', 'claimed'] }, notBefore: { lte: 60 }, claimedUntil: { lte: 60 } },
        limit: 10,
        set: { state: 'claimed', token: 'fresh' },
      });
      equal(lapsed.length, 1, 'a lapsed lease is taken back');
      equal(lapsed[0]?.token, 'fresh', 'and fenced under a new token');
    },
  },
  {
    name: 'onePer holds one row per group, counting what is already held',
    run: async (store) => {
      // Two serial reflexes with two units each, and one of them already busy.
      await withRuns(store, 'a', 'b', 'c');
      await store.appendIfAbsent('task', task({ runId: 'a', unit: 'a1', reflexId: 'serial.a' }));
      await store.appendIfAbsent('task', task({ runId: 'a', unit: 'a2', reflexId: 'serial.a' }));
      await store.appendIfAbsent('task', task({ runId: 'b', unit: 'b1', reflexId: 'serial.b', state: 'claimed', claimedUntil: 900 }));
      await store.appendIfAbsent('task', task({ runId: 'b', unit: 'b2', reflexId: 'serial.b' }));
      await store.appendIfAbsent('task', task({ runId: 'c', unit: 'c1', reflexId: 'parallel' }));
      await store.appendIfAbsent('task', task({ runId: 'c', unit: 'c2', reflexId: 'parallel' }));

      const claimed = await store.claim({
        table: 'task',
        where: { state: { in: ['pending', 'retrying'] }, notBefore: { lte: 100 } },
        order: [{ by: 'unit' }],
        limit: 10,
        set: { state: 'claimed', claimedUntil: 900 },
        onePer: { column: 'reflexId', held: { state: 'claimed', claimedUntil: { gt: 100 } }, only: ['serial.a', 'serial.b'] },
      });

      const byReflex = (id: string) => claimed.filter((row) => row.reflexId === id).length;
      equal(byReflex('serial.a'), 1, 'one at a time, within the claim');
      equal(byReflex('serial.b'), 0, 'none — its slot is already held by an earlier claim');
      equal(byReflex('parallel'), 2, 'a reflex outside `only` claims freely');
    },
  },

  // ── cas ──────────────────────────────────────────────────────

  {
    name: 'cas moves a row only from the state it expected — this is the fence',
    run: async (store) => {
      await withRuns(store, 'run_1');
      const stored = await store.appendIfAbsent('task', task({ state: 'claimed', token: 'live' }));
      const id = stored?.id ?? '';
      equal(await store.cas('task', id, { token: 'stale' }, { state: 'done' }), false, 'a superseded attempt is refused');
      equal((await store.query({ table: 'task', where: { id } }))[0]?.state, 'claimed', 'and changed nothing');
      equal(await store.cas('task', id, { token: 'live' }, { state: 'done' }), true, 'the live attempt lands');
      equal((await store.query({ table: 'task', where: { id } }))[0]?.state, 'done', 'and is written');
    },
  },
  {
    name: 'cas on a row that is not there is false, not a throw',
    run: async (store) => {
      equal(await store.cas('task', 'nope', {}, { state: 'done' }), false, 'a missing row is a refusal');
    },
  },
  {
    name: 'setting undefined CLEARS a column',
    run: async (store) => {
      await withRuns(store, 'run_1');
      const stored = await store.appendIfAbsent('task', task({ state: 'claimed', token: 'live' }));
      await store.cas('task', stored?.id ?? '', {}, { token: undefined });
      const [after] = await store.query({ table: 'task', where: { id: stored?.id ?? '' } });
      equal(after?.token, undefined, 'a settled task holds no token');
    },
  },

  // ── query ────────────────────────────────────────────────────

  {
    name: 'query filters, compares, orders and limits',
    run: async (store) => {
      await store.appendIfAbsent('run', run({ cause: 'a', createdAt: 30, state: 'settled' }));
      await store.appendIfAbsent('run', run({ cause: 'b', createdAt: 10, state: 'settled' }));
      await store.appendIfAbsent('run', run({ cause: 'c', createdAt: 20, state: 'pending' }));

      const settled = await store.query({ table: 'run', where: { state: 'settled' } });
      equal(settled.length, 2, 'equality');

      const recent = await store.query({ table: 'run', where: { createdAt: { gte: 20 } } });
      equal(recent.length, 2, 'comparison');

      const oneOf = await store.query({ table: 'run', where: { state: { in: ['pending'] } } });
      equal(oneOf.length, 1, 'in');

      const newest = await store.query({ table: 'run', order: [{ by: 'createdAt', dir: 'desc' }], limit: 1 });
      equal(newest[0]?.cause, 'a', 'a limit means the most recent N, in every store');
    },
  },
  {
    name: 'isNull distinguishes absent from present',
    run: async (store) => {
      await store.appendIfAbsent('fact', { kind: 'signal', name: 'one', at: 1, depth: 0 });
      await store.appendIfAbsent('fact', { kind: 'signal', name: 'two', at: 2, depth: 0, deliveredAt: 5 });
      equal((await store.query({ table: 'fact', where: { deliveredAt: { isNull: true } } })).length, 1, 'undelivered');
      equal((await store.query({ table: 'fact', where: { deliveredAt: { isNull: false } } })).length, 1, 'delivered');
    },
  },
  {
    name: 'ne treats an absent column as not-equal',
    run: async (store) => {
      await store.appendIfAbsent('run', run({ cause: 'fresh', state: 'settled' }));
      await store.appendIfAbsent('run', run({ cause: 'announced', state: 'settled', drained: true }));
      const undrained = await store.query({ table: 'run', where: { state: 'settled', drained: { ne: true } } });
      equal(undrained.length, 1, 'a run that has never been drained is not drained');
      equal(undrained[0]?.cause, 'fresh', 'and it is the right one');
    },
  },

  // ── remove ───────────────────────────────────────────────────

  {
    name: 'remove deletes what matches and counts it',
    run: async (store) => {
      await store.appendIfAbsent('fact', { kind: 'signal', name: 'old', at: 1, depth: 0, deliveredAt: 1 });
      await store.appendIfAbsent('fact', { kind: 'signal', name: 'new', at: 90, depth: 0, deliveredAt: 90 });
      equal(await store.remove({ table: 'fact', where: { deliveredAt: { lt: 50 } } }), 1, 'removed');
      equal((await store.query({ table: 'fact' })).length, 1, 'kept');
    },
  },
  {
    name: 'removing a run takes its tasks with it',
    run: async (store) => {
      const stored = await store.appendIfAbsent('run', run({ state: 'settled', settledAt: 1 }));
      await store.appendIfAbsent('task', task({ runId: stored?.id ?? '' }));
      await store.remove({ table: 'run', where: { settledAt: { lt: 50 } } });
      // Keeping the tasks would destroy the UNIQUE(runId, unit) row that IS
      // the "this unit already ran" record — and a restore then re-charges
      // the invoice.
      equal((await store.query({ table: 'task' })).length, 0, 'orphans are not left behind');
    },
  },

  // ── transact ─────────────────────────────────────────────────

  {
    name: 'a throwing transaction leaves nothing behind',
    run: async (store) => {
      await withRuns(store, 'run_1');
      const before = (await store.query({ table: 'task' })).length;
      let raised: unknown;
      try {
        await store.transact(async (tx) => {
          await tx.appendIfAbsent('task', task({ unit: 'a' }));
          await tx.appendIfAbsent('task', task({ unit: 'b' }));
          throw new Error('the selection died half way through');
        });
      } catch (error) {
        raised = error;
      }
      // THE CALLER'S error, not merely SOME error. A store whose transaction
      // is broken outright also throws and also writes nothing, which is how
      // a check for "it threw" passes against an implementation that never
      // opened a transaction at all.
      equal((raised as Error | undefined)?.message, 'the selection died half way through', 'the caller’s error propagates unchanged');
      equal((await store.query({ table: 'task' })).length, before, 'and nothing was written — fan-out depends on this');
    },
  },
  {
    name: 'a transaction that returns commits everything in it',
    run: async (store) => {
      const stored = await store.appendIfAbsent('run', run());
      await store.transact(async (tx) => {
        await tx.appendIfAbsent('task', task({ runId: stored?.id ?? '', unit: 'a' }));
        await tx.cas('run', stored?.id ?? '', { state: 'pending' }, { state: 'fanned', total: 1 });
      });
      equal((await store.query({ table: 'task' })).length, 1, 'the task landed');
      equal((await store.query({ table: 'run' }))[0]?.state, 'fanned', 'with the run that owns it');
    },
  },
];
