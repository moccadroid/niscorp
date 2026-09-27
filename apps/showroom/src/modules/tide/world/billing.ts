import { evaluate } from '@niscorp/prism';
import { createMemoryStore, createTide, type EffectRegistry, type PreviewReport, type ReflexInput, type Tide } from '@niscorp/tide';
import { readLedger, type Snapshot } from './ledger';

// ═══════════════════════════════════════════════════════════
// The first-of-the-month billing run — as a script, and as three reflexes.
//
// The payment gateway is a stand-in written here, with two real-world
// behaviours: one card declines, and the gateway has a bad few minutes for one
// charge. It honours an idempotency key, as real gateways do.
//
// The script is a SIMULATION, labelled as such: charge everyone in a loop,
// catch errors per member, and if anything errored exit non-zero so the
// scheduler retries the job — the ordinary shape of a billing cron. A decline
// is an error there, because payment SDKs throw on one.
//
// The tide side is the real engine: one reflex charges, two more react to the
// charge rows it writes — a receipt, or a card-declined email.
// ═══════════════════════════════════════════════════════════

const MINUTE = 60_000;

export const PLANS = [
  { id: 'ada', name: 'Ada', amount: 8900 },
  { id: 'alan', name: 'Alan', amount: 8900 },
  { id: 'grace', name: 'Grace', amount: 12000 },
  { id: 'linus', name: 'Linus', amount: 8900 },
  { id: 'mia', name: 'Mia', amount: 8900 },
  { id: 'ruth', name: 'Ruth', amount: 7400 },
] as const;

export const euros = (cents: number): string => `€${(cents / 100).toFixed(2)}`;

// 1 April, Vienna (CEST): 03:00 local is 01:00Z.
export const START = Date.UTC(2026, 3, 1, 0, 55);
export const RUN_AT = Date.UTC(2026, 3, 1, 1, 0);

export type Charge = { at: number; member: string; amount: number; outcome: 'succeeded' | 'declined' | 'error'; replay?: boolean; by: 'script' | 'tide' };
export type Mail = { at: number; member: string; kind: 'receipt' | 'declined' };

// ── the gateway ─────────────────────────────────────────────────

const makeGateway = (by: Charge['by']) => {
  const log: Charge[] = [];
  const seen = new Map<string, Charge['outcome']>();
  let linusCalls = 0;
  const charge = (member: string, amount: number, at: number, key?: string): Charge['outcome'] => {
    if (key !== undefined) {
      const prior = seen.get(key);
      if (prior === 'succeeded' || prior === 'declined') {
        log.push({ at, member, amount, outcome: prior, replay: true, by });
        return prior;
      }
    }
    let outcome: Charge['outcome'] = 'succeeded';
    if (member === 'ada') outcome = 'declined';
    if (member === 'linus') {
      linusCalls += 1;
      if (linusCalls <= 2) outcome = 'error';
    }
    log.push({ at, member, amount, outcome, by });
    if (key !== undefined) seen.set(key, outcome);
    return outcome;
  };
  return { log, charge };
};

// ── the script, simulated ───────────────────────────────────────

// Attempts at 03:00, 03:10 and 03:30 — the scheduler's retry of a failed job.
export const SCRIPT_ATTEMPTS = [RUN_AT, RUN_AT + 10 * MINUTE, RUN_AT + 30 * MINUTE] as const;

export type ScriptState = { charges: readonly Charge[]; lines: readonly { at: number; text: string; bad: boolean }[] };

export const runScript = (until: number): ScriptState => {
  const gateway = makeGateway('script');
  const lines: { at: number; text: string; bad: boolean }[] = [];
  for (const [i, at] of SCRIPT_ATTEMPTS.entries()) {
    if (at > until) break;
    const errors: string[] = [];
    for (const p of PLANS) {
      const outcome = gateway.charge(p.id, p.amount, at);
      if (outcome === 'declined') errors.push(`${p.name}: CardError — card declined`);
      if (outcome === 'error') errors.push(`${p.name}: 503 from the gateway`);
    }
    lines.push({ at, text: `attempt ${i + 1}: charged ${PLANS.length - errors.length}, ${errors.length} error${errors.length === 1 ? '' : 's'} (${errors.join('; ')})`, bad: errors.length > 0 });
    if (errors.length === 0) break;
    lines.push({ at, text: i < SCRIPT_ATTEMPTS.length - 1 ? 'exit 1 — the scheduler will retry the job' : 'exit 1 — out of retries', bad: true });
  }
  return { charges: gateway.log, lines };
};

// ── tide, for real ──────────────────────────────────────────────

export const CHARGE: ReflexInput = {
  id: 'billing.charge',
  intent: 'Charge every membership on the first of the month.',
  on: { clock: { every: 'month', on: 1, at: '03:00', tz: 'Europe/Vienna' } },
  select: { query: { table: 'memberships' }, mode: 'each', unitKey: 'id' },
  effect: { name: 'payments.charge', input: { member: { $ref: '$.row.id' }, amount: { $ref: '$.row.amount' } } },
  policy: { retry: { max: 3, backoff: 'exponential', baseMs: 10 * MINUTE } },
};

export const RECEIPT: ReflexInput = {
  id: 'billing.receipt',
  intent: 'Email a receipt when a charge succeeds.',
  on: { fact: { entity: 'charges', op: 'insert' } },
  when: { $eq: [{ $ref: '$.fact.row.status' }, 'succeeded'] },
  effect: { name: 'mail.send', input: { to: { $ref: '$.fact.row.member' }, kind: 'receipt' } },
};

export const DECLINED: ReflexInput = {
  id: 'billing.card-declined',
  intent: 'Ask the member to update their card when a charge is declined.',
  on: { fact: { entity: 'charges', op: 'insert' } },
  when: { $eq: [{ $ref: '$.fact.row.status' }, 'declined'] },
  effect: { name: 'mail.send', input: { to: { $ref: '$.fact.row.member' }, kind: 'declined' } },
};

export type TideState = {
  charges: readonly Charge[];
  mails: readonly Mail[];
  tasks: readonly { reflex: string; unit: string; state: string; attempt: number; error?: string }[];
  nextDue?: number;
  // tide's own rows — facts, runs, tasks — for the Ledger panel.
  ledger: Snapshot;
};

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const recordOf = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : {});

export type BillingTide = { preview: (now: number) => Promise<PreviewReport>; advanceTo: (now: number) => Promise<TideState> };

export const createBillingTide = async (): Promise<BillingTide> => {
  const gateway = makeGateway('tide');
  const mails: Mail[] = [];
  const effects: EffectRegistry = {
    'payments.charge': {
      writes: ['charges'],
      run: (input, ctx) => {
        const rec = recordOf(input);
        const member = str(rec['member']);
        const amount = Number(rec['amount'] ?? 0);
        // The task key goes to the gateway as its idempotency key.
        const outcome = gateway.charge(member, amount, ctx.now, ctx.taskKey);
        // A gateway fault is the only thing worth trying again: throw.
        if (outcome === 'error') throw new Error('503 from the gateway');
        // A decline is an answer, not a failure: record it and return.
        ctx.emit({ kind: 'write', entity: 'charges', op: 'insert', row: { member, status: outcome }, at: ctx.now });
        return { status: outcome };
      },
      preview: (input) => {
        const rec = recordOf(input);
        return { charge: euros(Number(rec['amount'] ?? 0)), to: str(rec['member']) };
      },
    },
    'mail.send': {
      run: (input, ctx) => {
        const rec = recordOf(input);
        mails.push({ at: ctx.now, member: str(rec['to']), kind: rec['kind'] === 'declined' ? 'declined' : 'receipt' });
        return { sent: true };
      },
    },
  };
  const tide: Tide = createTide({
    store: createMemoryStore(),
    transform: (config, source) => evaluate(config, JSON.parse(JSON.stringify(source))),
    select: () => PLANS.map((p) => ({ ...p })),
    effects,
  });
  await tide.load([CHARGE, RECEIPT, DECLINED], { at: START });

  const state = async (now: number): Promise<TideState> => {
    const tasks = await tide.ledger.tasks({ limit: 100 });
    const nextDue = await tide.nextDue(now);
    return {
      charges: [...gateway.log],
      mails: [...mails],
      tasks: tasks.map((t) => ({ reflex: t.reflexId, unit: t.unit, state: t.state, attempt: t.attempt, ...(t.error === undefined ? {} : { error: t.error }) })),
      ...(nextDue === undefined ? {} : { nextDue }),
      ledger: await readLedger(tide, now),
    };
  };

  return {
    preview: (now) => tide.preview('billing.charge', { now }),
    advanceTo: async (now) => {
      for (let pass = 0; pass < 30; pass += 1) {
        const r = await tide.advance({ now, limit: 200 });
        if (r.materialized + r.factsMatched + r.tasksCreated + r.executed + r.runsSettled === 0) break;
      }
      return state(now);
    },
  };
};
