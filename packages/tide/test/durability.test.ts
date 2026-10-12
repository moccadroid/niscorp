import { describe, it, expect } from 'vitest';
import { createMemoryStore, createTide } from '../src/index';
import type { EffectRegistry, Fact, ReflexInput, Row, SelectFn, Tide, TideConfig, TideEvent } from '../src/index';
import { testTransform, utc } from './support';

const vienna = 'Europe/Vienna';
const T0 = utc('2026-03-01T00:00:00Z');
const DAY = 86_400_000;

type Harness = {
  tide: Tide;
  store: ReturnType<typeof createMemoryStore>;
  calls: unknown[];
  events: TideEvent[];
};

const harness = async (
  reflexes: readonly ReflexInput[],
  effects: EffectRegistry,
  extra?: Partial<TideConfig> & { armedAt?: number; load?: boolean },
): Promise<Harness> => {
  const store = createMemoryStore();
  const calls: unknown[] = [];
  const events: TideEvent[] = [];
  const traced: EffectRegistry = Object.fromEntries(
    Object.entries(effects).map(([name, handler]) => [
      name,
      { ...handler, run: (input: unknown, ctx: Parameters<typeof handler.run>[1]) => (calls.push(input), handler.run(input, ctx)) },
    ]),
  );
  const tide = createTide({
    store,
    transform: testTransform,
    effects: traced,
    onEvent: (event) => events.push(event),
    ...extra,
  });
  if (extra?.load !== false) await tide.load(reflexes, { at: extra?.armedAt ?? T0 });
  return { tide, store, calls, events };
};

describe('the recovery verb', () => {
  const reflex: ReflexInput = {
    id: 'billing.charge',
    intent: 'Charge, and fail terminally on the first attempt.',
    on: { manual: {} },
    effect: { name: 'charge' },
    policy: { retry: { max: 0, backoff: 'fixed', baseMs: 1 }, overlap: 'allow' },
  };

  const flakyOnce = () => {
    let seen = 0;
    return {
      charge: {
        run: () => {
          seen += 1;
          if (seen === 1) throw new Error('gateway 500');
          return { charged: true };
        },
      },
    };
  };

  it('reopens a failed task AND rewinds its firing, so the next tick claims it', async () => {
    const { tide, calls } = await harness([reflex], flakyOnce());
    await tide.fire('billing.charge', { now: T0 });
    await tide.advance({ now: T0 });

    const [failed] = await tide.ledger.tasks({ state: 'failed' });
    expect(failed?.error).toBe('gateway 500');
    expect((await tide.ledger.run(failed?.runId ?? ''))?.state).toBe('settled');

    expect(await tide.retry(failed?.id ?? '', T0 + 10)).toBe(true);
    expect((await tide.ledger.run(failed?.runId ?? ''))?.state).toBe('fanned');

    await tide.advance({ now: T0 + 10 });
    expect(calls).toHaveLength(2);
    expect((await tide.ledger.task(failed?.id ?? ''))?.state).toBe('done');
  });

  it('re-settling a reopened firing does not announce it twice', async () => {
    const { tide } = await harness([reflex], flakyOnce());
    await tide.fire('billing.charge', { now: T0 });
    await tide.advance({ now: T0 });
    await tide.retry((await tide.ledger.tasks({ state: 'failed' }))[0]?.id ?? '', T0 + 10);
    await tide.advance({ now: T0 + 10 });

    const settlements = (await tide.ledger.facts()).filter((fact) => fact.kind === 'run');
    expect(settlements).toHaveLength(1);
  });

  const texts = (policy: ReflexInput['policy']): ReflexInput => ({
    id: 'reminders.send',
    intent: 'Text each member, and fail terminally on the first attempt.',
    on: { manual: {} },
    select: { query: { table: 'members' }, mode: 'each', unitKey: 'id' },
    effect: { name: 'text' },
    policy,
  });
  const members: SelectFn = () => ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id }));
  const gateway = (down: readonly string[]) => {
    const out = new Set(down);
    const effects: EffectRegistry = {
      text: {
        run: (_input, ctx) => {
          // the unit is the last part of the task key
          if (out.has(ctx.taskKey.split(':').at(-1) ?? '')) throw new Error('the gateway timed out');
          return { sent: true };
        },
      },
    };
    return { out, effects };
  };
  const countsOf = async (tide: Tide): Promise<{ state?: string; done?: number; failed?: number }> => {
    const [run] = await tide.ledger.runs({ reflexId: 'reminders.send' });
    return { state: run?.state, done: run?.done, failed: run?.failed };
  };

  it('two failed tasks retried before either runs again both come off the count', async () => {
    const { out, effects } = gateway(['b', 'e']);
    const { tide } = await harness([texts({ retry: { max: 0, backoff: 'fixed', baseMs: 1 }, overlap: 'allow' })], effects, { select: members });
    await tide.fire('reminders.send', { now: T0 });
    await tide.advance({ now: T0 });
    expect(await countsOf(tide)).toEqual({ state: 'settled', done: 4, failed: 2 });

    out.clear();
    for (const failed of await tide.ledger.tasks({ state: 'failed' })) expect(await tide.retry(failed.id, T0 + 10)).toBe(true);
    expect(await countsOf(tide)).toEqual({ state: 'fanned', done: 4, failed: 0 });

    await tide.advance({ now: T0 + 10 });
    expect(await countsOf(tide)).toEqual({ state: 'settled', done: 6, failed: 0 });
  });

  it('...and one of them failing again is counted once', async () => {
    const { out, effects } = gateway(['b', 'e']);
    const { tide } = await harness([texts({ retry: { max: 0, backoff: 'fixed', baseMs: 1 }, overlap: 'allow' })], effects, { select: members });
    await tide.fire('reminders.send', { now: T0 });
    await tide.advance({ now: T0 });

    out.delete('b');
    for (const failed of await tide.ledger.tasks({ state: 'failed' })) await tide.retry(failed.id, T0 + 10);
    await tide.advance({ now: T0 + 10 });
    expect(await countsOf(tide)).toEqual({ state: 'settled', done: 5, failed: 1 });
  });

  it('a task retried while its run is still going does not settle the run a task early', async () => {
    // `order: 'serial'` lands one task per tick, so the run is unsettled when the first failure is retried.
    const { out, effects } = gateway(['a']);
    const { tide } = await harness([texts({ retry: { max: 0, backoff: 'fixed', baseMs: 1 }, overlap: 'allow', order: 'serial' })], effects, { select: members });
    await tide.fire('reminders.send', { now: T0 });
    await tide.advance({ now: T0 });
    expect(await countsOf(tide)).toEqual({ state: 'fanned', done: 0, failed: 1 });

    out.clear();
    const [failed] = await tide.ledger.tasks({ state: 'failed' });
    expect(await tide.retry(failed?.id ?? '', T0 + 10)).toBe(true);
    expect(await countsOf(tide)).toEqual({ state: 'fanned', done: 0, failed: 0 });

    for (let n = 0; n < 5; n += 1) await tide.advance({ now: T0 + 10 });
    expect(await countsOf(tide)).toEqual({ state: 'fanned', done: 5, failed: 0 });
    expect((await tide.ledger.facts()).filter((fact) => fact.kind === 'run')).toHaveLength(0);

    await tide.advance({ now: T0 + 10 });
    const settlements = (await tide.ledger.facts()).flatMap((fact) => (fact.kind === 'run' ? [fact.stats] : []));
    expect(settlements).toEqual([{ total: 6, done: 6, failed: 0 }]);
  });

  it('releasing a parked fact actually releases it', async () => {
    const emitter: ReflexInput = {
      id: 'echo',
      intent: 'Emit a fact that wakes this same reflex.',
      on: { fact: { signal: 'ping' } },
      effect: { name: 'again' },
    };
    const { tide } = await harness([emitter], {
      again: { run: (_input, ctx) => ctx.emit({ kind: 'signal', name: 'ping', at: ctx.now }) },
    }, { maxChainDepth: 1 });

    await tide.ingest({ kind: 'signal', name: 'ping', at: T0 });
    for (let n = 0; n < 6; n += 1) await tide.advance({ now: T0 + n });

    const parked = (await tide.ledger.facts()).filter((fact) => fact.parked !== undefined);
    expect(parked.length).toBeGreaterThan(0);

    const target = parked[0] as Fact;
    expect(await tide.ledger.releaseParked(target.id)).toBe(true);
    await tide.advance({ now: T0 + 10 });

    expect((await tide.ledger.fact(target.id))?.parked).toBeUndefined();
  });
});

describe('two things happening at once', () => {
  const receipt: ReflexInput = {
    id: 'receipt.send',
    intent: 'Send a receipt when a payment lands.',
    on: { fact: { entity: 'payments', op: 'insert' } },
    effect: { name: 'mail', input: { invoice: { $ref: '$.fact.row.invoice_id' } } },
  };

  it('two payments in one tick produce two receipts', async () => {
    const { tide, calls } = await harness([receipt], { mail: { run: () => ({ sent: true }) } });
    await tide.ingest({ kind: 'write', entity: 'payments', op: 'insert', row: { invoice_id: 'a' }, at: T0 });
    await tide.ingest({ kind: 'write', entity: 'payments', op: 'insert', row: { invoice_id: 'b' }, at: T0 });
    await tide.advance({ now: T0 });

    expect(calls).toEqual([{ invoice: 'a' }, { invoice: 'b' }]);
    expect((await tide.ledger.runs()).filter((run) => run.state === 'skipped')).toHaveLength(0);
  });

  it('...and a signal is the same — it happened once and will not happen again', async () => {
    const onSignal: ReflexInput = { ...receipt, id: 'hook', on: { fact: { signal: 'stripe' } }, effect: { name: 'mail' } };
    const { tide, calls } = await harness([onSignal], { mail: { run: () => ({ sent: true }) } });
    await tide.ingest({ kind: 'signal', name: 'stripe', payload: { n: 1 }, at: T0 });
    await tide.ingest({ kind: 'signal', name: 'stripe', payload: { n: 2 }, at: T0 });
    await tide.advance({ now: T0 });
    expect(calls).toHaveLength(2);
  });

  it('but a human pressing the button twice still skips', async () => {
    const manual: ReflexInput = {
      id: 'long.run',
      intent: 'Slow.',
      on: { manual: {} },
      effect: { name: 'work' },
      policy: { overlap: 'skip', retry: { max: 9, backoff: 'fixed', baseMs: 60_000 } },
    };
    const { tide } = await harness([manual], { work: { run: () => { throw new Error('still going'); } } });
    await tide.fire('long.run', { now: T0 });
    await tide.advance({ now: T0 });
    await tide.fire('long.run', { now: T0 + 1_000 });
    await tide.advance({ now: T0 + 1_000 });

    const skipped = (await tide.ledger.runs()).filter((run) => run.state === 'skipped');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.note).toContain('overlap');
  });

  it('and a clock occurrence still skips while the last is unsettled', async () => {
    const nightly: ReflexInput = {
      id: 'nightly',
      intent: 'Every night.',
      on: { clock: { every: 'day', at: '03:00', tz: vienna } },
      effect: { name: 'work' },
      policy: { overlap: 'skip', retry: { max: 9, backoff: 'fixed', baseMs: 86_400_000 } },
    };
    const { tide } = await harness([nightly], { work: { run: () => { throw new Error('still going'); } } });
    await tide.advance({ now: utc('2026-03-01T05:00:00Z') });
    await tide.advance({ now: utc('2026-03-02T05:00:00Z') });

    const skipped = (await tide.ledger.runs()).filter((run) => run.state === 'skipped');
    expect(skipped).toHaveLength(1);
  });
});

describe('two tenants watching one table', () => {
  const watcher = (id: string, as: string, from: string): ReflexInput => ({
    id,
    intent: `Welcome somebody who joins, as ${from}.`,
    on: { fact: { entity: 'members', op: 'insert' } },
    as,
    effect: { name: 'mail', input: { who: { $ref: '$.row.id' }, from } },
  });

  it('two tenants running the SAME automation do not act on each other’s people', async () => {
    const { tide, calls } = await harness(
      [watcher('lumen:welcome', 'automation@lumen', 'lumen'), watcher('rock:welcome', 'automation@northrock', 'northrock')],
      { mail: { run: () => ({}) } },
    );

    await tide.ingest({ kind: 'write', entity: 'members', op: 'insert', row: { id: 'lumen_member' }, at: T0 }, { as: 'automation@lumen' });
    await tide.ingest({ kind: 'write', entity: 'members', op: 'insert', row: { id: 'rock_member' }, at: T0 }, { as: 'automation@northrock' });
    for (let n = 1; n <= 4; n += 1) await tide.advance({ now: T0 + n });

    expect(calls).toContainEqual({ who: 'lumen_member', from: 'lumen' });
    expect(calls).toContainEqual({ who: 'rock_member', from: 'northrock' });
    expect(calls).not.toContainEqual({ who: 'lumen_member', from: 'northrock' });
    expect(calls).not.toContainEqual({ who: 'rock_member', from: 'lumen' });
  });

  it('and within a tenant, one fact is a stream every watcher hears', async () => {
    const { tide, calls } = await harness(
      [watcher('lumen:welcome', 'automation@lumen', 'welcome'), watcher('lumen:notify', 'automation@lumen', 'notify')],
      { mail: { run: () => ({}) } },
    );
    await tide.ingest({ kind: 'write', entity: 'members', op: 'insert', row: { id: 'new_member' }, at: T0 }, { as: 'automation@lumen' });
    for (let n = 1; n <= 3; n += 1) await tide.advance({ now: T0 + n });

    expect(calls).toContainEqual({ who: 'new_member', from: 'welcome' });
    expect(calls).toContainEqual({ who: 'new_member', from: 'notify' });
  });
});

describe('facts minted by a reflex', () => {
  const chain = (tenant: string): ReflexInput[] => [
    {
      id: `${tenant}:writer`,
      intent: 'Write a note, and say so.',
      on: { manual: {} },
      as: `automation@${tenant}`,
      effect: { name: 'write' },
    },
    {
      id: `${tenant}:reader`,
      intent: 'React to a note.',
      on: { fact: { entity: 'notes', op: 'insert' } },
      as: `automation@${tenant}`,
      effect: { name: 'react', input: { note: { $ref: '$.fact.row.secret' }, by: tenant } },
    },
  ];

  it('do not wake another tenant’s reflex', async () => {
    const { tide, calls } = await harness([...chain('lumen'), ...chain('northrock')], {
      write: { run: (_input, ctx) => ctx.emit({ kind: 'write', entity: 'notes', op: 'insert', row: { secret: 'lumen-only' }, at: ctx.now }) },
      react: { run: () => ({ ok: true }) },
    });

    await tide.fire('lumen:writer', { now: T0 });
    for (let n = 0; n < 4; n += 1) await tide.advance({ now: T0 + n });

    expect(calls).toContainEqual({ note: 'lumen-only', by: 'lumen' });
    expect(calls).not.toContainEqual({ note: 'lumen-only', by: 'northrock' });
  });

  it('and a settled run announces itself only to its own tenant', async () => {
    const watcher = (tenant: string): ReflexInput => ({
      id: `${tenant}:digest`,
      intent: 'Summarise the writer’s run.',
      on: { fact: { run: 'lumen:writer' } },
      as: `automation@${tenant}`,
      effect: { name: 'react', input: { by: tenant, kind: 'digest' } },
    });
    const { tide, calls } = await harness([...chain('lumen'), watcher('lumen'), watcher('northrock')], {
      write: { run: () => ({ ok: true }) },
      react: { run: () => ({ ok: true }) },
    });

    await tide.fire('lumen:writer', { now: T0 });
    for (let n = 0; n < 4; n += 1) await tide.advance({ now: T0 + n });

    expect(calls).toContainEqual({ by: 'lumen', kind: 'digest' });
    expect(calls).not.toContainEqual({ by: 'northrock', kind: 'digest' });
  });
});

describe('the tenant boundary, door by door', () => {
  const OTHER = 'automation@northrock';
  const MINE = 'automation@lumen';

  const watchers = (as: string, tenant: string): ReflexInput[] => [
    { id: `${tenant}:on-write`, intent: 'x', on: { fact: { entity: 'notes', op: 'insert' } }, as, effect: { name: 'seen', input: { by: tenant, door: 'write' } } },
    { id: `${tenant}:on-signal`, intent: 'x', on: { fact: { signal: 'stripe' } }, as, effect: { name: 'seen', input: { by: tenant, door: 'signal' } } },
    { id: `${tenant}:on-run`, intent: 'x', on: { fact: { run: 'lumen:source' } }, as, effect: { name: 'seen', input: { by: tenant, door: 'run' } } },
  ];

  const source: ReflexInput = {
    id: 'lumen:source',
    intent: 'The thing that mints.',
    on: { manual: {} },
    as: MINE,
    effect: { name: 'mint' },
  };

  const both = [source, ...watchers(MINE, 'lumen'), ...watchers(OTHER, 'northrock')];
  const effects = (mint: EffectRegistry['x']) => ({ mint, seen: { run: () => ({}) } });

  const reached = (calls: readonly unknown[], door: string): string[] =>
    calls.filter((c): c is { by: string; door: string } => typeof c === 'object' && c !== null && (c as { door?: string }).door === door).map((c) => c.by);

  it('door 1 — a fact the HOST ingests reaches only the identity it was ingested for', async () => {
    const { tide, calls } = await harness(both, effects({ run: () => ({}) }));
    await tide.ingest({ kind: 'signal', name: 'stripe', payload: { evt: 'lumen' }, at: T0 }, { as: MINE });
    await tide.advance({ now: T0 });
    expect(reached(calls, 'signal')).toEqual(['lumen']);
  });

  it('...and an ingest with NO identity reaches nobody who has one', async () => {
    const { tide, calls } = await harness(both, effects({ run: () => ({}) }));
    await tide.ingest({ kind: 'signal', name: 'stripe', payload: { evt: 'anon' }, at: T0 });
    await tide.advance({ now: T0 });
    expect(reached(calls, 'signal')).toEqual([]);
  });

  it('door 2 — `fire` reaches exactly the reflex it names', async () => {
    const { tide, calls } = await harness(both, effects({ run: () => ({}) }));
    await tide.fire('lumen:source', { now: T0 });
    for (let n = 0; n < 3; n += 1) await tide.advance({ now: T0 + n });
    expect(reached(calls, 'write')).toEqual([]);
    expect(reached(calls, 'signal')).toEqual([]);
  });

  it('door 3 — a handler’s `emit` reaches only its own tenant', async () => {
    const { tide, calls } = await harness(
      both,
      effects({ run: (_i, ctx) => ctx.emit({ kind: 'write', entity: 'notes', op: 'insert', row: { secret: 'lumen' }, at: ctx.now }) }),
    );
    await tide.fire('lumen:source', { now: T0 });
    for (let n = 0; n < 4; n += 1) await tide.advance({ now: T0 + n });
    expect(reached(calls, 'write')).toEqual(['lumen']);
  });

  it('door 4 — a bridge-minted write fact reaches only the identity it was minted for', async () => {
    const { tide, calls } = await harness(both, effects({ run: () => ({}) }));
    await tide.ingest({ kind: 'write', entity: 'notes', op: 'insert', row: { secret: 'lumen' }, at: T0 }, { as: MINE });
    for (let n = 0; n < 3; n += 1) await tide.advance({ now: T0 + n });
    expect(reached(calls, 'write')).toEqual(['lumen']);
  });

  it('door 5 — a settled run announces itself only to its own tenant', async () => {
    const { tide, calls } = await harness(both, effects({ run: () => ({}) }));
    await tide.fire('lumen:source', { now: T0 });
    for (let n = 0; n < 4; n += 1) await tide.advance({ now: T0 + n });
    expect(reached(calls, 'run')).toEqual(['lumen']);
  });
});

describe('fan-out failure', () => {
  const reflex: ReflexInput = {
    id: 'nightly.bill',
    intent: 'Bill everyone due, nightly.',
    on: { clock: { every: 'day', at: '03:00', tz: vienna } },
    select: { query: { table: 'due' }, mode: 'each', unitKey: 'id' },
    effect: { name: 'bill' },
  };

  it('defers a transient selection failure instead of consuming the occurrence', async () => {
    let attempts = 0;
    const select: SelectFn = () => {
      attempts += 1;
      if (attempts === 1) throw new Error('connection terminated unexpectedly');
      return [{ id: 'm_1' }, { id: 'm_2' }];
    };
    const { tide, calls, events } = await harness([reflex], { bill: { run: () => ({ ok: true }) } }, { select });

    const first = await tide.advance({ now: utc('2026-03-01T05:00:00Z') });
    expect(first.tasksCreated).toBe(0);
    expect(events.some((event) => event.type === 'run.deferred')).toBe(true);

    const [deferred] = await tide.ledger.runs();
    expect(deferred?.state).toBe('pending');
    expect(deferred?.note).toContain('deferred');

    const second = await tide.advance({ now: utc('2026-03-01T05:01:00Z') });
    expect(second.tasksCreated).toBe(2);
    expect(calls).toHaveLength(2);
    expect((await tide.ledger.runs())).toHaveLength(1);
  });

  it('still refuses a malformed reflex loudly', async () => {
    const select: SelectFn = () => [{ id: 'same' }, { id: 'same' }];
    const { tide } = await harness([reflex], { bill: { run: () => ({ ok: true }) } }, { select });
    await tide.advance({ now: utc('2026-03-01T05:00:00Z') });

    const [firing] = await tide.ledger.runs();
    expect(firing?.state).toBe('skipped');
    expect(firing?.note).toContain('refused');
  });
});

describe('preview truthiness', () => {
  const reflex: ReflexInput = {
    id: 'digest.send',
    intent: 'Send a digest when there is something in it.',
    on: { fact: { signal: 'day.closed' } },
    when: { $length: { $ref: '$.fact.payload.items' } },
    effect: { name: 'mail' },
  };

  it('an empty list is falsy in BOTH, so preview does not promise a firing', async () => {
    const { tide, calls } = await harness([reflex], { mail: { run: () => ({ sent: true }) } });
    const fact = { kind: 'signal', name: 'day.closed', payload: { items: [] }, at: T0 } as const;

    const report = await tide.preview('digest.send', { now: T0, fact });
    expect(report.fired).toBe(false);

    await tide.ingest(fact);
    await tide.advance({ now: T0 });
    expect(calls).toHaveLength(0);
  });

  it('and a non-empty list fires in both', async () => {
    const { tide, calls } = await harness([reflex], { mail: { run: () => ({ sent: true }) } });
    const fact = { kind: 'signal', name: 'day.closed', payload: { items: ['a'] }, at: T0 } as const;

    expect((await tide.preview('digest.send', { now: T0, fact })).fired).toBe(true);
    await tide.ingest(fact);
    await tide.advance({ now: T0 });
    expect(calls).toHaveLength(1);
  });
});

describe('the fact union', () => {
  const reflex: ReflexInput = {
    id: 'watcher',
    intent: 'Watch payments.',
    on: { fact: { entity: 'payments' } },
    effect: { name: 'work' },
  };

  it('refuses a write fact with no entity rather than swallowing it', async () => {
    const { tide } = await harness([reflex], { work: { run: () => ({}) } });
    await expect(tide.ingest({ kind: 'write', at: T0 })).rejects.toThrow(/entity/);
  });

  it('refuses a signal fact with no name', async () => {
    const { tide } = await harness([reflex], { work: { run: () => ({}) } });
    await expect(tide.ingest({ kind: 'signal', at: T0 })).rejects.toThrow(/name/);
  });

  it('refuses fields belonging to another kind', async () => {
    const { tide } = await harness([reflex], { work: { run: () => ({}) } });
    await expect(tide.ingest({ kind: 'write', entity: 'payments', target: 'watcher', at: T0 })).rejects.toThrow(/target/);
  });

  it('an effect cannot emit a manual fact and fire a disarmed reflex', async () => {
    const disarmed: ReflexInput = {
      id: 'dangerous',
      intent: 'Should not run while disarmed.',
      on: { manual: {} },
      effect: { name: 'danger' },
      enabled: false,
    };
    const trigger: ReflexInput = {
      id: 'trigger',
      intent: 'Try to reach past the switch.',
      on: { fact: { signal: 'go' } },
      effect: { name: 'sneak' },
    };
    const { tide, calls } = await harness([disarmed, trigger], {
      danger: { run: () => ({ fired: true }) },
      sneak: { run: (_input, ctx) => ctx.emit({ kind: 'manual', target: 'dangerous', at: ctx.now } as never) },
    });

    await tide.ingest({ kind: 'signal', name: 'go', at: T0 });
    await tide.advance({ now: T0 });
    await tide.advance({ now: T0 + 1 });

    expect(calls.filter((input) => input !== undefined)).toHaveLength(0);
    const [task] = await tide.ledger.tasks({ reflexId: 'trigger' });
    expect(task?.error).toContain('may emit');
  });
});

describe('the load race', () => {
  it('a fact due before load() completes is still delivered afterwards', async () => {
    const reflex: ReflexInput = {
      id: 'late.listener',
      intent: 'Listen for a signal that arrived before boot finished.',
      on: { fact: { signal: 'stripe.paid' } },
      effect: { name: 'work' },
    };
    const { tide, calls } = await harness([reflex], { work: { run: () => ({ ok: true }) } }, { load: false });

    await tide.ingest({ kind: 'signal', name: 'stripe.paid', at: T0 });
    const raced = await tide.advance({ now: T0 });
    expect(raced.factsMatched).toBe(0);

    await tide.load([reflex], { at: T0 });
    await tide.advance({ now: T0 + 1 });
    expect(calls).toHaveLength(1);
  });
});

describe('the chain ceiling under retention', () => {
  it('holds when the firing has been swept out from under the chain', async () => {
    const reflex: ReflexInput = {
      id: 'loop',
      intent: 'A guarded loop that keeps emitting.',
      on: { fact: { signal: 'tick' } },
      effect: { name: 'again' },
    };
    const { tide } = await harness([reflex], {
      again: { run: (_input, ctx) => ctx.emit({ kind: 'signal', name: 'tick', at: ctx.now }) },
    }, { maxChainDepth: 3 });

    await tide.ingest({ kind: 'signal', name: 'tick', at: T0 });
    for (let n = 0; n < 12; n += 1) {
      await tide.advance({ now: T0 + n });
      await tide.sweep(T0 + n, { runs: 0 });
    }

    const facts = await tide.ledger.facts();
    expect(facts.some((fact) => fact.parked !== undefined)).toBe(true);
    expect(Math.max(...facts.map((fact) => fact.depth))).toBeLessThanOrEqual(5);
  });
});

describe('a long outage', () => {
  it('does not drop the occurrences past the per-tick cap', async () => {
    const reflex: ReflexInput = {
      id: 'daily.report',
      intent: 'Every day at 03:00.',
      on: { clock: { every: 'day', at: '03:00', tz: vienna } },
      effect: { name: 'work' },
      policy: { catchUp: 'skip', lateMs: 3_600_000 },
    };
    const { tide } = await harness([reflex], { work: { run: () => ({}) } });

    const back = T0 + 600 * DAY;
    await tide.advance({ now: back });
    const afterFirst = await tide.ledger.runs({ limit: 5_000 });
    expect(afterFirst).toHaveLength(500);

    await tide.advance({ now: back + 60_000 });
    const afterSecond = await tide.ledger.runs({ limit: 5_000 });
    expect(afterSecond.length).toBeGreaterThan(595);

    const keys = new Set(afterSecond.map((firing) => firing.occurrence));
    expect(keys.has('2026-03-02')).toBe(true);
    expect(keys.has('2027-08-01')).toBe(true);
    expect(keys.size).toBe(afterSecond.length);
  });
});

describe('the fact door', () => {
  const relay: ReflexInput[] = [
    { id: 'start', intent: 'Pass the baton on.', on: { manual: {} }, effect: { name: 'pass' } },
    { id: 'finish', intent: 'Catch the baton.', on: { fact: { signal: 'baton' } }, effect: { name: 'catch' } },
  ];

  const drain = async (tide: Tide): Promise<void> => {
    for (let n = 1; n <= 5; n += 1) await tide.advance({ now: T0 + n });
  };

  const ingestedIds = (events: readonly TideEvent[]): string[] =>
    events.flatMap((event) => (event.type === 'fact.ingested' ? [event.fact.id] : []));

  it('announces a fact a handler emits — every row in the ledger has its event', async () => {
    const { tide, events, calls } = await harness(relay, {
      pass: { run: (_input, ctx) => ctx.emit({ kind: 'signal', name: 'baton', at: ctx.now }) },
      catch: { run: () => 'caught' },
    });
    await tide.fire('start', { now: T0 });
    await drain(tide);

    expect(calls).toHaveLength(2);
    const ledger = (await tide.ledger.facts()).map((fact) => fact.id).sort();
    expect(ingestedIds(events).sort()).toEqual(ledger);
    expect((await tide.ledger.facts()).some((fact) => fact.name === 'baton')).toBe(true);
  });

  it('announces an emit refused by its dedupeKey, and writes no row for it', async () => {
    const { tide, events, calls } = await harness(relay, {
      pass: { run: (_input, ctx) => ctx.emit({ kind: 'signal', name: 'baton', at: ctx.now, dedupeKey: 'lap-1' }) },
      catch: { run: () => 'caught' },
    });
    await tide.fire('start', { now: T0 });
    await drain(tide);
    await tide.fire('start', { now: T0 + 10 });
    for (let n = 11; n <= 15; n += 1) await tide.advance({ now: T0 + n });

    expect(calls).toHaveLength(3);
    const deduped = events.flatMap((event) => (event.type === 'fact.deduped' ? [event.fact] : []));
    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toMatchObject({ kind: 'signal', name: 'baton', dedupeKey: 'lap-1', cause: expect.stringMatching(/^task:/) });
    expect((await tide.ledger.facts()).filter((fact) => fact.name === 'baton')).toHaveLength(1);
  });

  it('announces a repeated host ingest as deduped, and still answers undefined', async () => {
    const { tide, events } = await harness([], {});
    const paid = { kind: 'signal' as const, name: 'paid', at: T0, dedupeKey: 'evt_1' };
    expect(await tide.ingest(paid, { as: 'studio' })).toBeDefined();
    expect(await tide.ingest(paid, { as: 'studio' })).toBeUndefined();

    expect(events.map((event) => event.type)).toEqual(['fact.ingested', 'fact.deduped']);
    expect(events[1]).toMatchObject({ type: 'fact.deduped', fact: { name: 'paid', as: 'studio', depth: 0 } });
  });

  it('announces nothing for a failed attempt — its buffer was discarded, not refused', async () => {
    const { tide, events } = await harness(relay, {
      pass: {
        run: (_input, ctx) => {
          ctx.emit({ kind: 'signal', name: 'baton', at: ctx.now });
          throw new Error('dropped it');
        },
      },
      catch: { run: () => 'caught' },
    });
    await tide.fire('start', { now: T0 });
    await drain(tide);

    expect(events.some((event) => event.type === 'fact.deduped')).toBe(false);
    expect(events.some((event) => event.type === 'fact.ingested' && event.fact.name === 'baton')).toBe(false);
  });
});

describe('the fence holds across engines', () => {
  it('a late attempt from an engine whose lease lapsed does not overwrite a reclaim still in flight', async () => {
    const store = createMemoryStore();
    const reflex: ReflexInput = { id: 'slow', intent: 'Do slow work.', on: { manual: {} }, effect: { name: 'work' } };
    const gate = () => {
      let open: () => void = () => undefined;
      let reach: () => void = () => undefined;
      const shut = new Promise<void>((resolve) => {
        open = resolve;
      });
      const reached = new Promise<void>((resolve) => {
        reach = resolve;
      });
      return { shut, reached, reach: () => reach(), open: () => open() };
    };
    const aGate = gate();
    const bGate = gate();
    const engine = (run: () => Promise<unknown>) =>
      createTide({ store, transform: testTransform, leaseMs: 1_000, effects: { work: { run } } });
    const a = engine(async () => {
      aGate.reach();
      await aGate.shut;
      return 'from a';
    });
    const b = engine(async () => {
      bGate.reach();
      await bGate.shut;
      return 'from b';
    });
    await a.load([reflex], { at: T0 });
    await b.load([reflex], { at: T0 });
    await a.fire('slow', { now: T0 });

    const drain = async (tide: Tide, now: number): Promise<void> => {
      for (let i = 0; i < 10; i += 1) await tide.advance({ now });
    };
    const aRun = drain(a, T0);
    await aGate.reached;
    const bRun = drain(b, T0 + 5_000);
    await bGate.reached;

    aGate.open();
    await aRun;
    const [afterA] = await store.query({ table: 'task', where: {}, limit: 10 });
    expect(afterA?.state).toBe('claimed');
    expect(afterA?.output).toBeUndefined();

    bGate.open();
    await bRun;
    const [afterB] = await store.query({ table: 'task', where: {}, limit: 10 });
    expect(afterB?.state).toBe('done');
    expect(afterB?.output).toBe('from b');
  });
});

describe('the last tasks of a run landing at once', () => {
  const reflexOf = (overlap: 'allow' | 'skip'): ReflexInput => ({
    id: 'reminders.send',
    intent: 'Text each member.',
    on: { manual: {} },
    select: { query: { table: 'members' }, mode: 'each', unitKey: 'id' },
    effect: { name: 'text' },
    policy: { overlap },
  });
  const pair = async (overlap: 'allow' | 'skip'): Promise<{ a: Tide; b: Tide }> => {
    const store = createMemoryStore();
    const engine = async (): Promise<Tide> => {
      const tide = createTide({
        store,
        transform: testTransform,
        select: () => ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id })),
        effects: { text: { run: () => ({ sent: true }) } },
      });
      await tide.load([reflexOf(overlap)], { at: T0 });
      return tide;
    };
    return { a: await engine(), b: await engine() };
  };
  const landTheLastTwoAtOnce = async ({ a, b }: { a: Tide; b: Tide }): Promise<void> => {
    await a.fire('reminders.send', { now: T0 });
    await a.advance({ now: T0, limit: 4 });
    await Promise.all([a.advance({ now: T0, limit: 1 }), b.advance({ now: T0, limit: 1 })]);
    await a.advance({ now: T0 });
  };

  it('settles the run, and announces it once', async () => {
    const engines = await pair('allow');
    await landTheLastTwoAtOnce(engines);

    const [run] = await engines.a.ledger.runs({ reflexId: 'reminders.send' });
    expect({ state: run?.state, done: run?.done, failed: run?.failed }).toEqual({ state: 'settled', done: 6, failed: 0 });
    const settlements = (await engines.a.ledger.facts()).flatMap((fact) => (fact.kind === 'run' ? [fact.stats] : []));
    expect(settlements).toEqual([{ total: 6, done: 6, failed: 0 }]);
  });

  it('so a reflex that skips while its last run is unsettled starts again', async () => {
    const engines = await pair('skip');
    await landTheLastTwoAtOnce(engines);

    await engines.a.fire('reminders.send', { now: T0 + DAY });
    await engines.a.advance({ now: T0 + DAY });
    const runs = await engines.a.ledger.runs({ reflexId: 'reminders.send' });
    expect(runs.map((run) => run.state)).toEqual(['settled', 'settled']);
    expect(runs.map((run) => run.done)).toEqual([6, 6]);
  });
});
