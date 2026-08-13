import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import { createTide } from '@niscorp/tide';
import type { EffectRegistry, ReflexInput, Row, Tide, TideConfig, TideEvent } from '@niscorp/tide';
import { createTideStore } from '../src/tide';

// THE ENGINE, ON A REAL DATABASE.
//
// `tide-store.test.ts` holds the store to its six-method contract. That is
// necessary and it is not sufficient: every defect that reached the built
// engine was a defect in how the ENGINE composes those methods — a claim that
// could not see a rewound run, a lease nobody took back, a transient throw
// that consumed an occurrence. Those were caught in memory, where the store is
// a Map and a transaction is a snapshot.
//
// So the same scenarios run here against Postgres: real constraints, real
// transactions, real NULLs, real bigints coming back as strings. A store that
// passes the unit contract and fails this one is exactly the store the last
// version of this package shipped.

const vienna = 'Europe/Vienna';
const T0 = Date.UTC(2026, 2, 1, 0, 0, 0);

// The five-op stand-in for the `transform` seam — tide does not know Prism, so
// neither does this.
const transform = (config: unknown, source: Row): unknown => {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;
    const record = { ...(node as Record<string, unknown>) };
    if ('$ref' in record && typeof record.$ref === 'string') {
      const path = record.$ref.replace(/^\$\.?/, '');
      if (path === '') return source;
      return path.split('.').reduce<unknown>((value, key) => (value === null || typeof value !== 'object' ? undefined : (value as Record<string, unknown>)[key]), source);
    }
    return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, walk(value)]));
  };
  return walk(config);
};

type Harness = { tide: Tide; calls: unknown[]; events: TideEvent[]; pool: ReturnType<typeof createPglitePool> };

const harness = async (reflexes: readonly ReflexInput[], effects: EffectRegistry, extra?: Partial<TideConfig>): Promise<Harness> => {
  const pool = createPglitePool(new PGlite());
  const store = createTideStore(pool);
  await store.ready;

  const calls: unknown[] = [];
  const events: TideEvent[] = [];
  const traced: EffectRegistry = Object.fromEntries(
    Object.entries(effects).map(([name, handler]) => [
      name,
      { ...handler, run: (input: unknown, ctx: Parameters<typeof handler.run>[1]) => (calls.push(input), handler.run(input, ctx)) },
    ]),
  );

  const tide = createTide({ store, transform, effects: traced, onEvent: (event) => events.push(event), ...extra });
  await tide.load(reflexes, { at: T0 });
  return { tide, calls, events, pool };
};

const noop = { run: () => ({ ok: true }) };

// ═══════════════════════════════════════════════════════════════

describe('the engine on postgres', () => {
  const daily: ReflexInput = {
    id: 'sweep.daily',
    intent: 'Run every night at 03:00 Vienna.',
    on: { clock: { every: 'day', at: '03:00', tz: vienna } },
    effect: { name: 'work' },
  };

  it('materializes an occurrence, fans out, executes and settles', async () => {
    const { tide, calls } = await harness([daily], { work: noop });
    const report = await tide.advance({ now: Date.UTC(2026, 2, 1, 5, 0, 0) });

    expect(report.materialized).toBe(1);
    expect(report.tasksCreated).toBe(1);
    expect(report.succeeded).toBe(1);
    expect(calls).toHaveLength(1);

    const [run] = await tide.ledger.runs();
    expect(run?.occurrence).toBe('2026-03-01');
    expect(run?.state).toBe('settled');
    // The counters are columns, and they are what an operator's screen reads.
    expect(run?.done).toBe(1);
    expect(run?.total).toBe(1);
  });

  it('is idempotent — a second tick over the same occurrence does nothing', async () => {
    const { tide, calls } = await harness([daily], { work: noop });
    await tide.advance({ now: Date.UTC(2026, 2, 1, 5, 0, 0) });
    await tide.advance({ now: Date.UTC(2026, 2, 1, 6, 0, 0) });
    // UNIQUE(reflex_id, cause) refuses the second open. The idempotency is a
    // database constraint here, not a branch.
    expect(calls).toHaveLength(1);
    expect(await tide.ledger.runs()).toHaveLength(1);
  });

  it('records the identity the run ran under — the column a host scopes on', async () => {
    const { tide } = await harness([{ ...daily, as: 'automation@studio_42' }], { work: noop });
    await tide.advance({ now: Date.UTC(2026, 2, 1, 5, 0, 0) });
    const [run] = await tide.ledger.runs();
    expect(run?.as).toBe('automation@studio_42');
  });
});

describe('fan-out on postgres', () => {
  const reflex: ReflexInput = {
    id: 'nightly.bill',
    intent: 'Bill everyone due.',
    on: { clock: { every: 'day', at: '03:00', tz: vienna } },
    select: { query: {}, mode: 'each', unitKey: 'id' },
    effect: { name: 'bill', input: { who: { $ref: '$.row.id' } } },
  };

  it('mints one task per row, each with its own pinned env', async () => {
    const rows: Row[] = [{ id: 'm_1' }, { id: 'm_2' }, { id: 'm_3' }];
    const { tide, calls } = await harness([reflex], { bill: noop }, { select: () => rows });
    await tide.advance({ now: Date.UTC(2026, 2, 1, 5, 0, 0) });

    expect(calls).toEqual([{ who: 'm_1' }, { who: 'm_2' }, { who: 'm_3' }]);
    const [run] = await tide.ledger.runs();
    expect(run?.total).toBe(3);
    expect(run?.done).toBe(3);
  });

  it('survives partial failure — one unit fails, its neighbours do not', async () => {
    const rows: Row[] = [{ id: 'm_1' }, { id: 'bad' }, { id: 'm_3' }];
    const { tide } = await harness(
      [{ ...reflex, policy: { retry: { max: 0, backoff: 'fixed', baseMs: 1 } } }],
      { bill: { run: (input) => { if ((input as { who: string }).who === 'bad') throw new Error('declined'); return { ok: true }; } } },
      { select: () => rows },
    );
    await tide.advance({ now: Date.UTC(2026, 2, 1, 5, 0, 0) });

    const [run] = await tide.ledger.runs();
    expect(run?.done).toBe(2);
    expect(run?.failed).toBe(1);
    expect(run?.state).toBe('settled');
    expect((await tide.ledger.tasks({ state: 'failed' }))[0]?.error).toBe('declined');
  });

  it('defers a transient selection failure instead of consuming the occurrence', async () => {
    let attempts = 0;
    const { tide, calls, events } = await harness([reflex], { bill: noop }, {
      select: () => {
        attempts += 1;
        if (attempts === 1) throw new Error('connection terminated unexpectedly');
        return [{ id: 'm_1' }];
      },
    });

    await tide.advance({ now: Date.UTC(2026, 2, 1, 5, 0, 0) });
    expect(events.some((event) => event.type === 'run.deferred')).toBe(true);
    expect((await tide.ledger.runs())[0]?.state).toBe('pending');

    // Same occurrence, next tick. The night's work is not lost.
    await tide.advance({ now: Date.UTC(2026, 2, 1, 5, 1, 0) });
    expect(calls).toHaveLength(1);
    expect(await tide.ledger.runs()).toHaveLength(1);
  });

  it('refuses a malformed reflex loudly — and the run is settled, not hanging', async () => {
    const { tide } = await harness([reflex], { bill: noop }, { select: () => [{ id: 'same' }, { id: 'same' }] });
    await tide.advance({ now: Date.UTC(2026, 2, 1, 5, 0, 0) });
    const [run] = await tide.ledger.runs();
    expect(run?.state).toBe('skipped');
    expect(run?.note).toContain('duplicate unit key');
  });
});

describe('recovery on postgres', () => {
  const reflex: ReflexInput = {
    id: 'billing.charge',
    intent: 'Charge, failing the first time.',
    on: { manual: {} },
    effect: { name: 'charge' },
    policy: { retry: { max: 0, backoff: 'fixed', baseMs: 1 }, overlap: 'allow' },
  };

  const flakyOnce = () => {
    let seen = 0;
    return { charge: { run: () => { seen += 1; if (seen === 1) throw new Error('gateway 500'); return { charged: true }; } } };
  };

  it('retry() rewinds the run so the next tick actually claims the task', async () => {
    const { tide, calls } = await harness([reflex], flakyOnce());
    await tide.fire('billing.charge', { now: T0 });
    await tide.advance({ now: T0 });

    const [failed] = await tide.ledger.tasks({ state: 'failed' });
    expect((await tide.ledger.run(failed?.runId ?? ''))?.state).toBe('settled');

    expect(await tide.retry(failed?.id ?? '', T0 + 10)).toBe(true);
    const rewound = await tide.ledger.run(failed?.runId ?? '');
    expect(rewound?.state).toBe('fanned');
    // Decremented inside the same transaction as the reopen.
    expect(rewound?.failed).toBe(0);

    await tide.advance({ now: T0 + 10 });
    expect(calls).toHaveLength(2);
    expect((await tide.ledger.task(failed?.id ?? ''))?.state).toBe('done');
  });

  it('...and re-settling does not announce the run twice', async () => {
    const { tide } = await harness([reflex], flakyOnce());
    await tide.fire('billing.charge', { now: T0 });
    await tide.advance({ now: T0 });
    await tide.retry((await tide.ledger.tasks({ state: 'failed' }))[0]?.id ?? '', T0 + 10);
    await tide.advance({ now: T0 + 10 });

    expect((await tide.ledger.facts()).filter((fact) => fact.kind === 'run')).toHaveLength(1);
  });

  it('takes back a lease a dead process was holding', async () => {
    const { tide, calls, pool } = await harness(
      [{ ...reflex, policy: { retry: { max: 3, backoff: 'fixed', baseMs: 1 }, overlap: 'allow' } }],
      { charge: noop },
      { leaseMs: 60_000 },
    );
    await tide.fire('billing.charge', { now: T0 });
    await tide.advance({ now: T0 });
    expect(calls).toHaveLength(1);

    // THE STATE A CRASH LEAVES, written directly because no verb produces it on
    // purpose: the row says claimed, a token is held, the lease is running, and
    // the process that owned it is gone. Before the lease existed this task sat
    // here forever — its run never settled, never drained, and an
    // `overlap: 'skip'` reflex behind it was blocked for good.
    const [task] = await tide.ledger.tasks();
    await pool.query(
      `UPDATE tide_work SET state = 'claimed', token = 'ghost', claimed_until = $1, settled_at = NULL WHERE id = $2`,
      [T0 + 60_000, task?.id ?? ''],
    );
    await pool.query(`UPDATE tide_run SET state = 'fanned', done = 0, settled_at = NULL WHERE id = $1`, [task?.runId ?? '']);

    // Inside the lease it is nobody else's work.
    await tide.advance({ now: T0 + 30_000 });
    expect(calls).toHaveLength(1);

    // Past it the work comes back — no reaper, no heartbeat, one comparison.
    await tide.advance({ now: T0 + 90_000 });
    expect(calls).toHaveLength(2);
    expect((await tide.ledger.task(task?.id ?? ''))?.state).toBe('done');
  });

  it('a zombie attempt cannot overwrite the claim that superseded it', async () => {
    const { tide, pool } = await harness([reflex], { charge: noop }, { leaseMs: 60_000 });
    await tide.fire('billing.charge', { now: T0 });
    await tide.advance({ now: T0 });

    const [task] = await tide.ledger.tasks();
    // The live claim moved on; the ghost still holds the old token.
    await pool.query(`UPDATE tide_work SET state = 'claimed', token = 'fresh', claimed_until = $1 WHERE id = $2`, [T0 + 60_000, task?.id ?? '']);
    const stale = await pool.query(`UPDATE tide_work SET state = 'done' WHERE id = $1 AND token = $2 RETURNING id`, [task?.id ?? '', 'ghost']);

    expect(stale.rows).toHaveLength(0);
    expect((await tide.ledger.task(task?.id ?? ''))?.token).toBe('fresh');
  });
});

describe('chains and fan-in on postgres', () => {
  it('an emitted fact continues the chain, and the cause survives the round trip', async () => {
    const first: ReflexInput = {
      id: 'charge.run',
      intent: 'Charge, and emit the outcome.',
      on: { manual: {} },
      effect: { name: 'charge' },
    };
    const second: ReflexInput = {
      id: 'receipt.send',
      intent: 'Receipt on a successful charge.',
      on: { fact: { entity: 'charge_attempts', op: 'insert' } },
      effect: { name: 'mail', input: { status: { $ref: '$.fact.row.status' } } },
    };
    const { tide, calls } = await harness([first, second], {
      charge: { run: (_input, ctx) => ctx.emit({ kind: 'write', entity: 'charge_attempts', op: 'insert', row: { status: 'succeeded' }, at: ctx.now }) },
      mail: noop,
    });

    await tide.fire('charge.run', { now: T0 });
    await tide.advance({ now: T0 });
    await tide.advance({ now: T0 + 1 });

    expect(calls).toContainEqual({ status: 'succeeded' });
    // The jsonb round trip is the part that only a real database tests.
    const emitted = (await tide.ledger.facts()).find((fact) => fact.entity === 'charge_attempts');
    expect(emitted?.row).toEqual({ status: 'succeeded' });
    expect(emitted?.cause).toMatch(/^task:/);
    expect(emitted?.depth).toBe(1);
  });

  it('a settled run mints a fact carrying its stats, and a digest fires on it', async () => {
    const batch: ReflexInput = {
      id: 'billing.run',
      intent: 'Charge five.',
      on: { manual: {} },
      select: { query: {}, mode: 'each', unitKey: 'id' },
      effect: { name: 'charge' },
    };
    const digest: ReflexInput = {
      id: 'billing.digest',
      intent: 'One summary when the run settles.',
      on: { fact: { run: 'billing.run' } },
      effect: { name: 'mail', input: { done: { $ref: '$.fact.stats.done' }, total: { $ref: '$.fact.stats.total' } } },
    };
    const { tide, calls } = await harness([batch, digest], { charge: noop, mail: noop }, {
      select: () => [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }],
    });

    await tide.fire('billing.run', { now: T0 });
    for (let n = 0; n < 4; n += 1) await tide.advance({ now: T0 + n });

    expect(calls).toContainEqual({ done: 5, total: 5 });
    // Exactly one digest, however many ticks pass — `drained` is a column.
    await tide.advance({ now: T0 + 10 });
    expect(calls.filter((input) => typeof input === 'object' && input !== null && 'total' in input)).toHaveLength(1);
  });
});

describe('the tenant boundary inside the engine, on postgres', () => {
  // Tide is the one place a row travels WITHOUT being read — carried as a
  // payload in a minted fact — so no scope policy is consulted on the way.
  // The identity that minted it rides along, and the matcher enforces it.
  // This is the same rule the memory store proves, held to a real column:
  // a `text` that has to survive the round trip, or the boundary is gone.
  const pair = (tenant: string): ReflexInput[] => [
    { id: `${tenant}:writer`, intent: 'Write.', on: { manual: {} }, as: `automation@${tenant}`, effect: { name: 'write' } },
    {
      id: `${tenant}:reader`,
      intent: 'React.',
      on: { fact: { entity: 'notes', op: 'insert' } },
      as: `automation@${tenant}`,
      effect: { name: 'react', input: { note: { $ref: '$.fact.row.secret' }, by: tenant } },
    },
  ];

  it('an emitted fact reaches its own tenant and no other', async () => {
    const { tide, calls } = await harness([...pair('lumen'), ...pair('northrock')], {
      write: { run: (_input, ctx) => ctx.emit({ kind: 'write', entity: 'notes', op: 'insert', row: { secret: 'lumen-only' }, at: ctx.now }) },
      react: noop,
    });

    await tide.fire('lumen:writer', { now: T0 });
    for (let n = 0; n < 4; n += 1) await tide.advance({ now: T0 + n });

    expect(calls).toContainEqual({ note: 'lumen-only', by: 'lumen' });
    expect(calls).not.toContainEqual({ note: 'lumen-only', by: 'northrock' });

    // The column, not just the behaviour: a store that dropped it would pass
    // the assertions above by matching everything against `undefined`.
    const emitted = (await tide.ledger.facts()).find((fact) => fact.entity === 'notes');
    expect(emitted?.as).toBe('automation@lumen');
  });
});

describe('facts on postgres', () => {
  const watcher: ReflexInput = {
    id: 'receipt.send',
    intent: 'Send a receipt when a payment lands.',
    on: { fact: { entity: 'payments', op: 'insert' } },
    effect: { name: 'mail', input: { invoice: { $ref: '$.fact.row.invoice_id' } } },
  };

  it('drops a replayed provider event silently — the partial unique index', async () => {
    const { tide, calls } = await harness([watcher], { mail: noop });
    const event = { kind: 'write', entity: 'payments', op: 'insert', row: { invoice_id: 'inv_1' }, at: T0, dedupeKey: 'evt_9' } as const;

    expect(await tide.ingest(event)).toBeDefined();
    expect(await tide.ingest(event)).toBeUndefined();
    await tide.advance({ now: T0 });
    expect(calls).toHaveLength(1);
  });

  it('a fact with no dedupeKey is never a duplicate', async () => {
    const { tide, calls } = await harness([watcher], { mail: noop });
    const event = { kind: 'write', entity: 'payments', op: 'insert', row: { invoice_id: 'inv_1' }, at: T0 } as const;
    await tide.ingest(event);
    await tide.ingest(event);
    await tide.advance({ now: T0 });
    expect(calls).toHaveLength(2);
  });

  it('a delayed fact waits for its notBefore, as a visible row', async () => {
    const { tide, calls } = await harness([watcher], { mail: noop });
    await tide.ingest({ kind: 'write', entity: 'payments', op: 'insert', row: { invoice_id: 'inv_1' }, at: T0, notBefore: T0 + 60_000 });

    await tide.advance({ now: T0 });
    expect(calls).toHaveLength(0);
    expect((await tide.ledger.facts())[0]?.deliveredAt).toBeUndefined();

    await tide.advance({ now: T0 + 60_000 });
    expect(calls).toHaveLength(1);
  });

  it('one fact wakes every reflex watching it', async () => {
    const second: ReflexInput = { ...watcher, id: 'ledger.post', effect: { name: 'post' } };
    const { tide, calls } = await harness([watcher, second], { mail: noop, post: noop });
    await tide.ingest({ kind: 'write', entity: 'payments', op: 'insert', row: { invoice_id: 'inv_1' }, at: T0 });
    await tide.advance({ now: T0 });
    expect(calls).toHaveLength(2);
    expect(await tide.ledger.runs()).toHaveLength(2);
  });
});

describe('overlap, order and retention on postgres', () => {
  it('`skip` refuses to start while the previous run is unsettled', async () => {
    const reflex: ReflexInput = {
      id: 'long.run',
      intent: 'Slow.',
      on: { manual: {} },
      effect: { name: 'work' },
      policy: { overlap: 'skip', retry: { max: 9, backoff: 'fixed', baseMs: 60_000 } },
    };
    const { tide } = await harness([reflex], { work: { run: () => { throw new Error('still going'); } } });
    await tide.fire('long.run', { now: T0 });
    await tide.advance({ now: T0 });
    await tide.fire('long.run', { now: T0 + 1_000 });
    await tide.advance({ now: T0 + 1_000 });

    const skipped = (await tide.ledger.runs()).filter((run) => run.state === 'skipped');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.note).toContain('overlap');
  });

  it('`serial` keeps one task of a reflex in flight at a time', async () => {
    let inFlight = 0;
    let peak = 0;
    const reflex: ReflexInput = {
      id: 'ordered',
      intent: 'One at a time.',
      on: { manual: {} },
      select: { query: {}, mode: 'each', unitKey: 'id' },
      effect: { name: 'work' },
      policy: { order: 'serial', overlap: 'allow' },
    };
    const { tide } = await harness([reflex], {
      work: { run: async () => { inFlight += 1; peak = Math.max(peak, inFlight); await Promise.resolve(); inFlight -= 1; return {}; } },
    }, { select: () => [{ id: '1' }, { id: '2' }, { id: '3' }] });

    await tide.fire('ordered', { now: T0 });
    for (let n = 0; n < 5; n += 1) await tide.advance({ now: T0 + n });
    expect(peak).toBe(1);
    expect((await tide.ledger.tasks({ state: 'done' })).length).toBe(3);
  });

  it('sweeping a run takes its tasks with it', async () => {
    const reflex: ReflexInput = { id: 'once', intent: 'Once.', on: { manual: {} }, effect: { name: 'work' } };
    const { tide } = await harness([reflex], { work: noop });
    await tide.fire('once', { now: T0 });
    await tide.advance({ now: T0 });
    expect(await tide.ledger.tasks()).toHaveLength(1);

    await tide.sweep(T0 + 1_000, { runs: 0 });
    // The foreign key does this, not a second statement somebody can forget.
    expect(await tide.ledger.runs()).toHaveLength(0);
    expect(await tide.ledger.tasks()).toHaveLength(0);
  });
});

describe('write facts on postgres', () => {
  // The bridge lane, through the durable store: a write fact's row rides
  // the jsonb column, its identity rides `as_who`, and the fence between
  // them and another tenant's reflex survives the round-trip to disk.
  const watcher = (id: string, as: string | undefined, from: string): ReflexInput => ({
    id,
    intent: 'Notice new members.',
    on: { fact: { entity: 'members', op: 'insert' } },
    ...(as === undefined ? {} : { as }),
    effect: { name: 'greet', input: { who: { $ref: '$.row.id' }, from } },
  });

  it('fans out over the carried row after the round-trip to disk', async () => {
    const { tide, calls } = await harness([watcher('signups.watch', undefined, 'here')], { greet: noop });
    await tide.ingest({ kind: 'write', entity: 'members', op: 'insert', row: { id: 'm_3' }, at: T0 + 1 });
    for (let n = 2; n <= 4; n += 1) await tide.advance({ now: T0 + n });
    expect(calls).toEqual([{ who: 'm_3', from: 'here' }]);
  });

  it('keeps the identity fence through the as_who column', async () => {
    const { tide, calls } = await harness(
      [watcher('lumen:watch', 'automation@lumen', 'lumen'), watcher('rock:watch', 'automation@rock', 'rock')],
      { greet: noop },
    );
    await tide.ingest({ kind: 'write', entity: 'members', op: 'insert', row: { id: 'm_9' }, at: T0 + 1 }, { as: 'automation@lumen' });
    for (let n = 2; n <= 4; n += 1) await tide.advance({ now: T0 + n });
    expect(calls).toEqual([{ who: 'm_9', from: 'lumen' }]);
  });
});
