import { describe, it, expect } from 'vitest';
import { createMemoryStore, createTide } from '../src/index';
import type { EffectRegistry, Fact, ReflexInput, Row, SelectFn, Tide, TideConfig, TideEvent } from '../src/index';
import { testTransform, utc } from './support';

// WORK THAT MUST NOT BE LOST.
//
// Every test here is a defect that reached the built engine: a retry verb
// that did nothing, a database hiccup that destroyed a billing run, a dry
// run that promised a firing the engine then refused. They are grouped by
// what was at stake rather than by which file was wrong, because that is
// how they will be re-introduced.

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

// ═══════════════════════════════════════════════════════════════
// retry() — the only documented exit from `failed`
// ═══════════════════════════════════════════════════════════════

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
    // The defect: `claimTasks` only considers tasks whose firing is `fanned`,
    // and a failed task had already settled its firing. `retry()` returned
    // true, moved the task to `pending`, and the task then sat there forever.
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
    // The old reason for NOT rewinding, and it was a real one: a digest
    // already went out saying one failed, and re-settling would send it
    // again. `drained` is what makes the rewind safe.
    const { tide } = await harness([reflex], flakyOnce());
    await tide.fire('billing.charge', { now: T0 });
    await tide.advance({ now: T0 });
    await tide.retry((await tide.ledger.tasks({ state: 'failed' }))[0]?.id ?? '', T0 + 10);
    await tide.advance({ now: T0 + 10 });

    const settlements = (await tide.ledger.facts()).filter((fact) => fact.kind === 'run');
    expect(settlements).toHaveLength(1);
  });

  it('releasing a parked fact actually releases it', async () => {
    // Clearing `parked` without recording the override was a ping-pong: the
    // matcher re-parked on the next tick, because the depth that parked it
    // had not changed and never would.
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

// ═══════════════════════════════════════════════════════════════
// overlap governs repeats, not distinct events
// ═══════════════════════════════════════════════════════════════

describe('two things happening at once', () => {
  const receipt: ReflexInput = {
    id: 'receipt.send',
    intent: 'Send a receipt when a payment lands.',
    on: { fact: { entity: 'payments', op: 'insert' } },
    effect: { name: 'mail', input: { invoice: { $ref: '$.fact.row.invoice_id' } } },
    // The DEFAULT policy. Nothing here is unusual — that is the point.
  };

  it('two payments in one tick produce two receipts', async () => {
    // The defect: `overlap` defaults to `'skip'`, and it was applied to every
    // cause. The first payment opened a run; the second found it unsettled and
    // was refused — one receipt sent, one recorded as skipped, and the member
    // who paid never heard anything. Every fact-triggered reflex was in this
    // state, and the count it dropped grew with how fast facts arrived.
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
    // The guard that overlap was FOR, kept: a manual fact is a repeat of the
    // same intent, and a long job should not double-start because somebody
    // clicked again.
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

    // Next month's billing run arriving while this month's is still going is
    // the same work coming round again. That is what the policy is for.
    const skipped = (await tide.ledger.runs()).filter((run) => run.state === 'skipped');
    expect(skipped).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// a write fact belongs to the tenant whose write it was
// ═══════════════════════════════════════════════════════════════

describe('two tenants watching one table', () => {
  const watcher = (id: string, as: string, from: string): ReflexInput => ({
    id,
    intent: `Welcome somebody who joins, as ${from}.`,
    on: { fact: { entity: 'members', op: 'insert' } },
    as,
    effect: { name: 'mail', input: { who: { $ref: '$.row.id' }, from } },
  });

  it('two tenants running the SAME automation do not act on each other’s people', async () => {
    // The serious one, and the whole reason facts carry identity. Two
    // studios each run "welcome somebody who joins"; both watch `members`.
    // A fact paired with reflexes by entity alone once fanned a row out to
    // a reflex that had never selected it — so a competitor emailed your
    // member, under their own studio id, with your member's address inside.
    // A scope engine cannot catch that: the ROW written is legitimately the
    // sender's; only the data in it came from somewhere else. The bridge
    // stamps each fact with the identity of the WRITE's own tenant, and the
    // matcher joins on strict equality.
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
    // What polls could never give: two automations watching the same entity
    // BOTH wake on the same write — a stream, not a private delta.
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

// ═══════════════════════════════════════════════════════════════
// a fact belongs to the identity that minted it
// ═══════════════════════════════════════════════════════════════

describe('facts minted by a reflex', () => {
  // Two tenants, the same two automations each. The first writes a note; the
  // second reacts to notes being written. Within a tenant that chain is the
  // whole design. Across tenants it must not exist.
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
    // The same hole as door 4, through a different door. `ctx.emit` carries
    // a ROW as a payload, and the matcher paired it with every reflex watching
    // that entity — including one belonging to somebody else, whose effect
    // then ran over data it had never selected. No database read is involved,
    // so no scope policy is consulted: the row crossed the boundary INSIDE
    // tide, between a handler and a matcher.
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

// ═══════════════════════════════════════════════════════════════
// EVERY DOOR A FACT CAN COME THROUGH
//
// Tide is the one place in the stack where a row travels WITHOUT being read —
// carried as a payload in a minted fact — so no scope policy is consulted on
// the way and nothing downstream can catch it. There are five doors, and this
// block walks all five rather than the two that had reproductions.
// ═══════════════════════════════════════════════════════════════

describe('the tenant boundary, door by door', () => {
  const OTHER = 'automation@northrock';
  const MINE = 'automation@lumen';

  // One watcher per trigger kind, one per tenant. If a fact reaches the wrong
  // one, the wrong tenant's name appears in `calls`.
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
    // Strict, and deliberately so: an unlabelled fact used to wake everyone.
    const { tide, calls } = await harness(both, effects({ run: () => ({}) }));
    await tide.ingest({ kind: 'signal', name: 'stripe', payload: { evt: 'anon' }, at: T0 });
    await tide.advance({ now: T0 });
    expect(reached(calls, 'signal')).toEqual([]);
  });

  it('door 2 — `fire` reaches exactly the reflex it names', async () => {
    const { tide, calls } = await harness(both, effects({ run: () => ({}) }));
    await tide.fire('lumen:source', { now: T0 });
    for (let n = 0; n < 3; n += 1) await tide.advance({ now: T0 + n });
    // The manual fact woke `lumen:source` and nothing else; the run fact it
    // settled into is door 5, below.
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
    // The bridge (moss, off vex's write observer) ingests one fact per
    // committed row, stamped with the identity the WRITE's own scope names.
    // The row rides the fact — tide is the one place a row travels without
    // being read — so this stamp is the only thing between a carried row
    // and somebody else's effect.
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

// ═══════════════════════════════════════════════════════════════
// a bad minute is not a bad reflex
// ═══════════════════════════════════════════════════════════════

describe('fan-out failure', () => {
  const reflex: ReflexInput = {
    id: 'nightly.bill',
    intent: 'Bill everyone due, nightly.',
    on: { clock: { every: 'day', at: '03:00', tz: vienna } },
    select: { query: { table: 'due' }, mode: 'each', unitKey: 'id' },
    effect: { name: 'bill' },
  };

  it('defers a transient selection failure instead of consuming the occurrence', async () => {
    // The defect: any throw marked the firing `skipped`. `createFiring` is
    // idempotent on (reflexId, cause), so the occurrence could never
    // re-materialize — one unreachable database destroyed that night's run
    // permanently, and `skipped` is not `settled`, so fan-in waited forever.
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

    // Same occurrence, next tick. The work is not lost.
    const second = await tide.advance({ now: utc('2026-03-01T05:01:00Z') });
    expect(second.tasksCreated).toBe(2);
    expect(calls).toHaveLength(2);
    expect((await tide.ledger.runs())).toHaveLength(1);
  });

  it('still refuses a malformed reflex loudly', async () => {
    // The contrast that makes the distinction worth drawing: a duplicate unit
    // key is the reflex's GRAIN being wrong, and it will be wrong again next
    // tick. That skips, and says why.
    const select: SelectFn = () => [{ id: 'same' }, { id: 'same' }];
    const { tide } = await harness([reflex], { bill: { run: () => ({ ok: true }) } }, { select });
    await tide.advance({ now: utc('2026-03-01T05:00:00Z') });

    const [firing] = await tide.ledger.runs();
    expect(firing?.state).toBe('skipped');
    expect(firing?.note).toContain('refused');
  });
});

// ═══════════════════════════════════════════════════════════════
// preview must agree with the engine
// ═══════════════════════════════════════════════════════════════

describe('preview truthiness', () => {
  const reflex: ReflexInput = {
    id: 'digest.send',
    intent: 'Send a digest when there is something in it.',
    on: { fact: { signal: 'day.closed' } },
    when: { $length: { $ref: '$.fact.payload.items' } },
    effect: { name: 'mail' },
  };

  it('an empty list is falsy in BOTH, so preview does not promise a firing', async () => {
    // The defect: preview rejected only false/null/undefined while the matcher
    // also rejects 0, '' and []. A `when` returning an empty list previewed as
    // "this will fire" and then didn't — the exact surprise preview exists to
    // eliminate.
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

// ═══════════════════════════════════════════════════════════════
// the intake contract
// ═══════════════════════════════════════════════════════════════

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
    // The hole: manual facts are checked BEFORE enablement on purpose —
    // arming gates triggers, not people. A handler is not a person, and
    // `ctx.emit` was not validated at all.
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

// ═══════════════════════════════════════════════════════════════
// facts that arrive before anything is listening
// ═══════════════════════════════════════════════════════════════

describe('the load race', () => {
  it('a fact due before load() completes is still delivered afterwards', async () => {
    // The defect: `completeFact` ran unconditionally, so a tick racing `load()`
    // marked the whole backlog delivered against ZERO reflexes. The
    // never-retro-fire rule then put it permanently out of reach.
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

// ═══════════════════════════════════════════════════════════════
// the chain ceiling, and what a sweep must not reset
// ═══════════════════════════════════════════════════════════════

describe('the chain ceiling under retention', () => {
  it('holds when the firing has been swept out from under the chain', async () => {
    // The defect: the executor read `depth` back off the firing at emit time
    // and fell back to 0 when it was gone — defeating the backstop in exactly
    // the swept, long-running case it exists for.
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
      // Every firing is gone the moment it settles. The depth has to live
      // somewhere that survives that.
      await tide.sweep(T0 + n, { runs: 0 });
    }

    const facts = await tide.ledger.facts();
    expect(facts.some((fact) => fact.parked !== undefined)).toBe(true);
    expect(Math.max(...facts.map((fact) => fact.depth))).toBeLessThanOrEqual(5);
  });
});

// ═══════════════════════════════════════════════════════════════
// occurrences past the per-tick cap
// ═══════════════════════════════════════════════════════════════

describe('a long outage', () => {
  it('does not drop the occurrences past the per-tick cap', async () => {
    // The defect: the cap bounded what was minted while the watermark jumped
    // to `now` regardless. Everything past the cap was unreachable forever,
    // with no row anywhere saying it had existed.
    const reflex: ReflexInput = {
      id: 'daily.report',
      intent: 'Every day at 03:00.',
      on: { clock: { every: 'day', at: '03:00', tz: vienna } },
      effect: { name: 'work' },
      policy: { catchUp: 'skip', lateMs: 3_600_000 },
    };
    const { tide } = await harness([reflex], { work: { run: () => ({}) } });

    // 600 days dark: more occurrences than one tick may materialize.
    const back = T0 + 600 * DAY;
    await tide.advance({ now: back });
    const afterFirst = await tide.ledger.runs({ limit: 5_000 });
    expect(afterFirst).toHaveLength(500);

    await tide.advance({ now: back + 60_000 });
    const afterSecond = await tide.ledger.runs({ limit: 5_000 });
    expect(afterSecond.length).toBeGreaterThan(595);

    // Contiguous: every calendar day between the two ends has a row.
    const keys = new Set(afterSecond.map((firing) => firing.occurrence));
    expect(keys.has('2026-03-02')).toBe(true);
    expect(keys.has('2027-08-01')).toBe(true);
    expect(keys.size).toBe(afterSecond.length);
  });
});
