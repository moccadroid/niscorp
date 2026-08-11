import { describe, it, expect } from 'vitest';
import { createMemoryStore, createTide } from '../src/index';
import type { EffectRegistry, ReflexInput, Row, Tide, TideConfig } from '../src/index';
import { testTransform, utc } from './support';

// The execution semantics, exercised. Every test drives the clock by hand:
// tide reads no wall clock, so there is nothing here to wait for.

const vienna = 'Europe/Vienna';
const T0 = utc('2026-03-01T00:00:00Z');

type Harness = {
  tide: Tide;
  store: ReturnType<typeof createMemoryStore>;
  calls: { name: string; input: unknown; taskKey: string }[];
};

const harness = async (
  reflexes: readonly ReflexInput[],
  effects: EffectRegistry,
  extra?: Partial<TideConfig> & { armedAt?: number },
): Promise<Harness> => {
  const store = createMemoryStore();
  const calls: Harness['calls'] = [];
  const traced: EffectRegistry = Object.fromEntries(
    Object.entries(effects).map(([name, handler]) => [
      name,
      {
        ...handler,
        run: (input: unknown, ctx: Parameters<typeof handler.run>[1]) => {
          calls.push({ name, input, taskKey: ctx.taskKey });
          return handler.run(input, ctx);
        },
      },
    ]),
  );
  const tide = createTide({ store, transform: testTransform, effects: traced, ...extra });
  // Armed at T0 — the host's boot time, in real deployments. Without one a
  // clock reflex would establish its baseline on the first tick and mint
  // nothing, which is the safe default but makes for a dull test.
  await tide.load(reflexes, { at: extra?.armedAt ?? T0 });
  return { tide, store, calls };
};

const noop = { run: () => ({ ok: true }) };

describe('the clock', () => {
  const daily: ReflexInput = {
    id: 'sweep.daily',
    intent: 'Run every night at 03:00 Vienna.',
    on: { clock: { every: 'day', at: '03:00', tz: vienna } },
    effect: { name: 'work' },
  };

  it('materializes an occurrence, fans out, and executes', async () => {
    const { tide, calls } = await harness([daily], { work: noop });
    const report = await tide.tick({ now: utc('2026-03-01T05:00:00Z') });

    expect(report.materialized).toBe(1);
    expect(report.tasksCreated).toBe(1);
    expect(report.succeeded).toBe(1);
    expect(calls).toHaveLength(1);

    const firings = await tide.ledger.firings();
    expect(firings[0]?.occurrence).toBe('2026-03-01');
    expect(firings[0]?.state).toBe('settled');
  });

  it('is idempotent — a second tick over the same occurrence does nothing', async () => {
    const { tide, calls } = await harness([daily], { work: noop });
    await tide.tick({ now: utc('2026-03-01T05:00:00Z') });
    await tide.tick({ now: utc('2026-03-01T06:00:00Z') });
    await tide.tick({ now: utc('2026-03-01T07:00:00Z') });
    expect(calls).toHaveLength(1);
  });

  it('records the version the firing ran under', async () => {
    const { tide } = await harness([daily], { work: noop });
    await tide.tick({ now: utc('2026-03-01T05:00:00Z') });
    const [firing] = await tide.ledger.firings();
    expect(firing?.version).toMatch(/^v_[0-9a-f]{16}$/);
  });
});

describe('catch-up', () => {
  const after = (catchUp: 'run' | 'skip' | 'latest'): ReflexInput => ({
    id: `nightly.${catchUp}`,
    intent: 'Nightly.',
    on: { clock: { every: 'day', at: '03:00', tz: vienna } },
    effect: { name: 'work' },
    policy: { catchUp, overlap: 'allow' },
  });

  // Four days of downtime, then one tick 30 minutes after the day's 03:00
  // local run. Each answer below is right for a different automation, which
  // is why the library refuses to guess.
  const downtime = utc('2026-03-05T02:30:00Z');

  it('`run` fires every missed occurrence', async () => {
    const { tide, calls } = await harness([after('run')], { work: noop });
    const report = await tide.tick({ now: downtime, limit: 50 });
    expect(report.materialized).toBe(5);
    expect(calls).toHaveLength(5);
  });

  it('`latest` fires only the most recent, and records the rest as skipped', async () => {
    const { tide, calls } = await harness([after('latest')], { work: noop });
    const report = await tide.tick({ now: downtime, limit: 50 });
    expect(report.materialized).toBe(1);
    expect(report.skippedOccurrences).toBe(4);
    expect(calls).toHaveLength(1);
    const skipped = (await tide.ledger.firings()).filter((firing) => firing.state === 'skipped');
    expect(skipped).toHaveLength(4);
    expect(skipped[0]?.note).toContain('catchUp: latest');
  });

  it('`skip` drops what is late and keeps what is on time', async () => {
    const { tide, calls } = await harness([after('skip')], { work: noop });
    const report = await tide.tick({ now: downtime, limit: 50 });
    // Only 2026-03-05 03:00 local (02:00Z) is inside the default one-hour
    // lateness window; the four older runs are recorded as skipped.
    expect(report.materialized).toBe(1);
    expect(report.skippedOccurrences).toBe(4);
    expect(calls).toHaveLength(1);
  });
});

describe('selection and fan-out', () => {
  const perMember: ReflexInput = {
    id: 'billing.charge',
    intent: 'Charge every due subscription.',
    on: { clock: { every: 'month', on: 1, at: '03:00', tz: vienna } },
    select: { query: { table: 'due' }, mode: 'each', unitKey: 'member_id' },
    effect: { name: 'charge', input: { member: { $ref: '$.row.member_id' } } },
  };

  const rows: Row[] = [{ member_id: 'm1' }, { member_id: 'm2' }, { member_id: 'm3' }];

  it('mints one task per row and carries the row into the template', async () => {
    const { tide, calls } = await harness([perMember], { charge: noop }, { select: () => rows });
    const report = await tide.tick({ now: utc('2026-03-01T05:00:00Z') });
    expect(report.tasksCreated).toBe(3);
    expect(calls.map((call) => call.input)).toEqual([{ member: 'm1' }, { member: 'm2' }, { member: 'm3' }]);
  });

  it('survives partial failure — 237 fails, its neighbours do not', async () => {
    const { tide } = await harness(
      [perMember],
      {
        charge: {
          run: (input: unknown) => {
            if ((input as { member: string }).member === 'm2') throw new Error('gateway 500');
            return { ok: true };
          },
        },
      },
      { select: () => rows },
    );
    const report = await tide.tick({ now: utc('2026-03-01T05:00:00Z') });
    expect(report.succeeded).toBe(2);
    expect(report.retrying).toBe(1);
    const done = await tide.ledger.tasks({ state: 'done' });
    expect(done.map((task) => task.unit).sort()).toEqual(['m1', 'm3']);
  });

  it('treats zero rows as an ordinary outcome', async () => {
    const { tide } = await harness([perMember], { charge: noop }, { select: () => [] });
    const report = await tide.tick({ now: utc('2026-03-01T05:00:00Z') });
    expect(report.tasksCreated).toBe(0);
    const [firing] = await tide.ledger.firings();
    expect(firing?.state).toBe('settled');
    expect(firing?.total).toBe(0);
  });

  it('fails the firing loudly on a duplicate unit key', async () => {
    const { tide } = await harness([perMember], { charge: noop }, { select: () => [{ member_id: 'm1' }, { member_id: 'm1' }] });
    await tide.tick({ now: utc('2026-03-01T05:00:00Z') });
    const [firing] = await tide.ledger.firings();
    expect(firing?.state).toBe('skipped');
    expect(firing?.note).toContain('duplicate unit key');
  });

  it('batch mode pins the whole result into one task', async () => {
    const digest: ReflexInput = {
      ...perMember,
      id: 'billing.digest',
      select: { query: { table: 'due' }, mode: 'batch' },
      effect: { name: 'charge', input: { count: { $length: { $ref: '$.rows' } } } },
    };
    const { tide, calls } = await harness([digest], { charge: noop }, { select: () => rows });
    await tide.tick({ now: utc('2026-03-01T05:00:00Z') });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toEqual({ count: 3 });
  });
});

describe('idempotency and the task key', () => {
  it('hands the handler a stable key it can pass downstream', async () => {
    const reflex: ReflexInput = {
      id: 'pay.run',
      intent: 'Charge.',
      on: { clock: { every: 'month', on: 1, at: '03:00', tz: vienna } },
      select: { query: {}, mode: 'each', unitKey: 'id' },
      effect: { name: 'charge' },
    };
    const { tide, calls } = await harness([reflex], { charge: noop }, { select: () => [{ id: 'a' }] });
    await tide.tick({ now: utc('2026-03-01T05:00:00Z') });
    expect(calls[0]?.taskKey).toBe('pay.run:occurrence:2026-03:a');
  });
});

describe('retry is a calling convention', () => {
  const flaky = (failures: number): EffectRegistry => {
    let seen = 0;
    return {
      work: {
        run: () => {
          seen += 1;
          if (seen <= failures) throw new Error('transient');
          return { ok: true, attempts: seen };
        },
      },
    };
  };

  const reflex: ReflexInput = {
    id: 'retryable',
    intent: 'Retries on throw.',
    on: { manual: {} },
    effect: { name: 'work' },
    policy: { retry: { max: 2, backoff: 'fixed', baseMs: 1_000 }, overlap: 'allow' },
  };

  it('a throw retries on backoff and eventually succeeds', async () => {
    const { tide } = await harness([reflex], flaky(1));
    await tide.fire('retryable', { now: T0 });
    const first = await tide.tick({ now: T0 });
    expect(first.retrying).toBe(1);

    // Too early — the backoff has not elapsed.
    expect((await tide.tick({ now: T0 + 500 })).executed).toBe(0);

    const second = await tide.tick({ now: T0 + 1_500 });
    expect(second.succeeded).toBe(1);
  });

  it('a bounded retry parks the task in a terminal, visible state', async () => {
    const { tide } = await harness([reflex], flaky(99));
    await tide.fire('retryable', { now: T0 });
    await tide.tick({ now: T0 });
    await tide.tick({ now: T0 + 2_000 });
    await tide.tick({ now: T0 + 4_000 });
    const failed = await tide.ledger.tasks({ state: 'failed' });
    expect(failed).toHaveLength(1);
    expect(failed[0]?.error).toBe('transient');
    const attempts = await tide.ledger.attempts(failed[0]?.id ?? '');
    expect(attempts).toHaveLength(3);
  });

  it('a RETURN is done, however unhappy the outcome', async () => {
    // A card decline is a domain outcome, not an error: the handler returns
    // it, the task is done, and the chain branches on the row it wrote.
    const { tide } = await harness([reflex], { work: { run: () => ({ status: 'declined' }) } });
    await tide.fire('retryable', { now: T0 });
    const report = await tide.tick({ now: T0 });
    expect(report.succeeded).toBe(1);
    expect(report.retrying).toBe(0);
    const [task] = await tide.ledger.tasks();
    expect(task?.output).toEqual({ status: 'declined' });
  });

  it('a timeout is a failed attempt, and the human verb reopens it', async () => {
    const { tide } = await harness(
      [{ ...reflex, policy: { retry: { max: 0, backoff: 'fixed', baseMs: 1 }, timeoutMs: 5, overlap: 'allow' } }],
      { work: { run: () => new Promise(() => undefined) } },
    );
    await tide.fire('retryable', { now: T0 });
    await tide.tick({ now: T0 });
    const [failed] = await tide.ledger.tasks({ state: 'failed' });
    expect(failed?.error).toContain('timed out');

    expect(await tide.retry(failed?.id ?? '', T0 + 10)).toBe(true);
    expect((await tide.ledger.task(failed?.id ?? ''))?.state).toBe('pending');
  });
});

describe('overlap and order', () => {
  it('`skip` refuses to start while the previous firing is unsettled', async () => {
    const reflex: ReflexInput = {
      id: 'long.run',
      intent: 'Slow.',
      on: { manual: {} },
      effect: { name: 'work' },
      policy: { overlap: 'skip', retry: { max: 9, backoff: 'fixed', baseMs: 60_000 } },
    };
    const { tide } = await harness([reflex], { work: { run: () => { throw new Error('still going'); } } });
    await tide.fire('long.run', { now: T0 });
    await tide.tick({ now: T0 });

    // The first firing is still unsettled (its task is retrying).
    await tide.fire('long.run', { now: T0 + 1_000 });
    await tide.tick({ now: T0 + 1_000 });

    const skipped = (await tide.ledger.firings()).filter((firing) => firing.state === 'skipped');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.note).toContain('overlap');
  });
});

describe('facts', () => {
  const onWrite: ReflexInput = {
    id: 'receipt.send',
    intent: 'Send a receipt when a payment is recorded.',
    on: { fact: { entity: 'payments', op: 'insert' } },
    effect: { name: 'mail', input: { invoice: { $ref: '$.fact.row.invoice_id' } } },
  };

  it('a write fact wakes a reflex and carries its row', async () => {
    const { tide, calls } = await harness([onWrite], { mail: noop });
    await tide.ingest({ kind: 'write', entity: 'payments', op: 'insert', row: { invoice_id: 'inv_1' }, at: T0 });
    const report = await tide.tick({ now: T0 });
    expect(report.factsMatched).toBe(1);
    expect(calls[0]?.input).toEqual({ invoice: 'inv_1' });
  });

  it('ops are distinct stimuli — an update does not wake an insert reflex', async () => {
    const { tide, calls } = await harness([onWrite], { mail: noop });
    await tide.ingest({ kind: 'write', entity: 'payments', op: 'update', row: { invoice_id: 'inv_1' }, at: T0 });
    await tide.tick({ now: T0 });
    expect(calls).toHaveLength(0);
  });

  it('drops a duplicate provider event silently', async () => {
    const { tide } = await harness(
      [{ ...onWrite, id: 'stripe.handle', on: { fact: { signal: 'stripe' } } }],
      { mail: noop },
    );
    await tide.ingest({ kind: 'signal', name: 'stripe', dedupeKey: 'evt_1', payload: {}, at: T0 });
    const second = await tide.ingest({ kind: 'signal', name: 'stripe', dedupeKey: 'evt_1', payload: {}, at: T0 });
    expect(second).toBeUndefined();
    expect((await tide.tick({ now: T0 })).executed).toBe(1);
  });

  it('never retro-fires: a fact older than the arming is not matched', async () => {
    const { tide, calls } = await harness([onWrite], { mail: noop }, { armedAt: T0 });
    await tide.ingest({ kind: 'write', entity: 'payments', op: 'insert', row: { invoice_id: 'old' }, at: T0 - 1 });
    await tide.ingest({ kind: 'write', entity: 'payments', op: 'insert', row: { invoice_id: 'new' }, at: T0 });
    await tide.tick({ now: T0 });
    expect(calls.map((call) => call.input)).toEqual([{ invoice: 'new' }]);
  });

  it('a `when` that throws is a recorded no-match, not a crashed tick', async () => {
    const { tide, calls } = await harness(
      [{ ...onWrite, when: { $throw: 'bad template' } }],
      { mail: noop },
    );
    await tide.ingest({ kind: 'write', entity: 'payments', op: 'insert', row: {}, at: T0 });
    const report = await tide.tick({ now: T0 });
    expect(report.factsMatched).toBe(0);
    expect(calls).toHaveLength(0);
    const [fact] = await tide.ledger.facts();
    expect(fact).toBeDefined();
  });

  it('one fact wakes every reflex watching it', async () => {
    const { tide, calls } = await harness(
      [onWrite, { ...onWrite, id: 'ledger.post', effect: { name: 'mail', input: { posted: true } } }],
      { mail: noop },
    );
    await tide.ingest({ kind: 'write', entity: 'payments', op: 'insert', row: { invoice_id: 'inv_9' }, at: T0 });
    await tide.tick({ now: T0 });
    expect(calls).toHaveLength(2);
  });

  it('a delayed fact waits for its notBefore', async () => {
    const { tide, calls } = await harness([onWrite], { mail: noop });
    await tide.ingest({
      kind: 'write',
      entity: 'payments',
      op: 'insert',
      row: { invoice_id: 'later' },
      at: T0,
      notBefore: T0 + 86_400_000,
    });
    await tide.tick({ now: T0 });
    expect(calls).toHaveLength(0);
    await tide.tick({ now: T0 + 86_400_001 });
    expect(calls).toHaveLength(1);
  });
});

describe('chains', () => {
  it('an emitted fact continues the flow, and the ledger records the cause', async () => {
    const first: ReflexInput = {
      id: 'charge',
      intent: 'Charge, then record the outcome.',
      on: { manual: {} },
      effect: { name: 'charge' },
    };
    const second: ReflexInput = {
      id: 'mark-paid',
      intent: 'Mark paid when a charge succeeds.',
      on: { fact: { entity: 'charge_attempts' } },
      when: { $eq: [{ $ref: '$.fact.row.status' }, 'succeeded'] },
      effect: { name: 'mark' },
    };

    const { tide, calls } = await harness([first, second], {
      charge: {
        touches: ['charge_attempts'],
        run: (_input: unknown, ctx) => {
          ctx.emit({ kind: 'write', entity: 'charge_attempts', op: 'insert', row: { status: 'succeeded' }, at: ctx.now });
          return { status: 'succeeded' };
        },
      },
      mark: noop,
    });

    await tide.fire('charge', { now: T0 });
    await tide.tick({ now: T0 });
    expect(calls.map((call) => call.name)).toEqual(['charge']);

    // The nudge gives latency, the tick gives the guarantee: the chain
    // advances one hop per tick.
    await tide.tick({ now: T0 + 1_000 });
    expect(calls.map((call) => call.name)).toEqual(['charge', 'mark']);

    const facts = await tide.ledger.facts();
    const emitted = facts.find((fact) => fact.entity === 'charge_attempts');
    expect(emitted?.cause).toMatch(/^task:/);
    expect(emitted?.depth).toBe(1);
  });

  it('a throwing handler does not mint its emitted facts', async () => {
    const reflex: ReflexInput = {
      id: 'emitter',
      intent: 'Emits then throws.',
      on: { manual: {} },
      effect: { name: 'work' },
      policy: { retry: { max: 0, backoff: 'fixed', baseMs: 1 } },
    };
    const { tide } = await harness([reflex], {
      work: {
        run: (_input: unknown, ctx) => {
          ctx.emit({ kind: 'write', entity: 'orders', op: 'insert', row: {}, at: ctx.now });
          throw new Error('failed after emitting');
        },
      },
    });
    await tide.fire('emitter', { now: T0 });
    await tide.tick({ now: T0 });
    const orders = (await tide.ledger.facts()).filter((fact) => fact.entity === 'orders');
    expect(orders).toHaveLength(0);
  });
});

describe('fan-in', () => {
  it('a settled firing mints a fact carrying its stats', async () => {
    const run: ReflexInput = {
      id: 'billing.run',
      intent: 'Charge each member.',
      on: { manual: {} },
      select: { query: {}, mode: 'each', unitKey: 'id' },
      effect: { name: 'charge' },
    };
    const digest: ReflexInput = {
      id: 'billing.digest',
      intent: 'One summary once the run settles.',
      on: { fact: { firing: 'billing.run' } },
      effect: { name: 'mail', input: { failed: { $ref: '$.fact.stats.failed' }, total: { $ref: '$.fact.stats.total' } } },
    };

    const { tide, calls } = await harness(
      [run, digest],
      {
        charge: {
          run: (_input: unknown, ctx) => {
            if (ctx.taskKey.endsWith('b')) throw new Error('declined hard');
            return { ok: true };
          },
        },
        mail: noop,
      },
      { select: () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
    );

    await tide.fire('billing.run', { now: T0 });
    await tide.tick({ now: T0 });
    // 'b' throws with the default retry policy, so the run is not settled yet.
    expect(calls.filter((call) => call.name === 'mail')).toHaveLength(0);

    // Let the retries exhaust.
    for (let step = 1; step <= 5; step += 1) await tide.tick({ now: T0 + step * 600_000 });

    const mails = calls.filter((call) => call.name === 'mail');
    expect(mails).toHaveLength(1);
    expect(mails[0]?.input).toEqual({ failed: 1, total: 3 });
  });

  it('a zero-task firing still settles and still mints its fact', async () => {
    const run: ReflexInput = {
      id: 'empty.run',
      intent: 'Nothing due.',
      on: { manual: {} },
      select: { query: {}, mode: 'each', unitKey: 'id' },
      effect: { name: 'charge' },
    };
    const digest: ReflexInput = {
      id: 'empty.digest',
      intent: 'Report even an empty run.',
      on: { fact: { firing: 'empty.run' } },
      effect: { name: 'mail', input: { total: { $ref: '$.fact.stats.total' } } },
    };
    const { tide, calls } = await harness([run, digest], { charge: noop, mail: noop }, { select: () => [] });
    await tide.fire('empty.run', { now: T0 });
    await tide.tick({ now: T0 });
    await tide.tick({ now: T0 + 1_000 });
    expect(calls.filter((call) => call.name === 'mail')[0]?.input).toEqual({ total: 0 });
  });
});

describe('coalescing', () => {
  it('holds facts for a fixed window and fires once with the batch', async () => {
    const reflex: ReflexInput = {
      id: 'notify.digest',
      intent: 'One notification per five minutes.',
      on: { fact: { entity: 'messages' } },
      effect: { name: 'mail', input: { count: { $length: { $ref: '$.facts' } } } },
      policy: { coalesce: { windowMs: 300_000 } },
    };
    const { tide, calls } = await harness([reflex], { mail: noop });

    await tide.ingest({ kind: 'write', entity: 'messages', op: 'insert', row: { n: 1 }, at: T0 });
    await tide.tick({ now: T0 });
    await tide.ingest({ kind: 'write', entity: 'messages', op: 'insert', row: { n: 2 }, at: T0 + 1_000 });
    await tide.tick({ now: T0 + 1_000 });
    expect(calls).toHaveLength(0);

    await tide.tick({ now: T0 + 300_001 });
    await tide.tick({ now: T0 + 300_002 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toEqual({ count: 2 });
  });
});

describe('polling', () => {
  const reflex: ReflexInput = {
    id: 'orders.watch',
    intent: 'Watch a table tide does not own.',
    on: { poll: { everyMs: 60_000, entity: 'orders', cursor: 'seq' } },
    select: { query: {}, mode: 'each', unitKey: 'seq' },
    effect: { name: 'work', input: { seq: { $ref: '$.row.seq' } } },
  };

  it('the first run establishes the watermark and mints nothing', async () => {
    const existing: Row[] = [{ seq: 1 }, { seq: 2 }, { seq: 3 }];
    const { tide, calls } = await harness([reflex], { work: noop }, { select: () => existing });
    const report = await tide.tick({ now: T0 });
    expect(report.polled).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('mints a fact per row beyond the cursor, once', async () => {
    const rows: Row[] = [{ seq: 1 }, { seq: 2 }];
    const { tide, calls } = await harness([reflex], { work: noop }, { select: () => rows });
    await tide.tick({ now: T0 });

    rows.push({ seq: 3 });
    await tide.tick({ now: T0 + 60_001 });
    await tide.tick({ now: T0 + 60_002 });
    expect(calls.map((call) => call.input)).toEqual([{ seq: 3 }]);

    await tide.tick({ now: T0 + 200_000 });
    expect(calls).toHaveLength(1);
  });
});

describe('the chain ceiling', () => {
  it('parks a fact whose cause chain runs away', async () => {
    // Guarded (a `when` is present), so load allows it — static analysis
    // cannot tell a convergent guard from this one, which always says yes.
    // That is precisely the case the runtime ceiling exists for.
    const loop: ReflexInput = {
      id: 'loop',
      intent: 'Re-emits itself forever — the divergent case.',
      on: { fact: { entity: 'ping' } },
      when: { $not: false },
      effect: { name: 'echo' },
    };
    const { tide } = await harness(
      [loop],
      {
        echo: {
          touches: ['ping'],
          run: (_input: unknown, ctx) => {
            ctx.emit({ kind: 'write', entity: 'ping', op: 'insert', row: {}, at: ctx.now });
            return { ok: true };
          },
        },
      },
      { maxChainDepth: 3 },
    );

    await tide.ingest({ kind: 'write', entity: 'ping', op: 'insert', row: {}, at: T0 });
    let parked = 0;
    for (let step = 0; step < 10; step += 1) parked += (await tide.tick({ now: T0 + step * 1_000 })).parked;
    expect(parked).toBeGreaterThan(0);

    const stuck = (await tide.ledger.facts()).filter((fact) => fact.parked !== undefined);
    expect(stuck.length).toBeGreaterThan(0);
    expect(stuck[0]?.parked).toContain('maxChainDepth');
  });
});

describe('arming', () => {
  it('a disarmed reflex does not trigger, but can still be fired by hand', async () => {
    const reflex: ReflexInput = {
      id: 'nightly',
      intent: 'Nightly.',
      on: { clock: { every: 'day', at: '03:00', tz: vienna } },
      effect: { name: 'work' },
      enabled: false,
    };
    const { tide, calls } = await harness([reflex], { work: noop });
    await tide.tick({ now: utc('2026-03-02T05:00:00Z') });
    expect(calls).toHaveLength(0);

    await tide.fire('nightly', { now: T0, by: 'ada' });
    await tide.tick({ now: T0 });
    expect(calls).toHaveLength(1);

    tide.arm('nightly');
    await tide.tick({ now: utc('2026-03-03T05:00:00Z') });
    expect(calls.length).toBeGreaterThan(1);
  });
});
