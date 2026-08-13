import { TideLab } from '@showroom/modules/tide/tide-lab';
import type { EffectRegistry, ReflexInput } from '@niscorp/tide';

// THERE IS NO RUN BODY. This is the requirements doc's hardest sentence —
// "charge the card, and if that succeeds mark the invoice paid and send the
// receipt; if it fails, record the failure" — as four reflexes joined by
// committed rows rather than one procedure.
//
// Press "one step" repeatedly and watch the chain walk: each hop is a fact,
// each fact is a row, and a crash between any two of them loses nothing,
// because the joint IS the database.

const charge: ReflexInput = {
  id: 'billing.charge',
  intent: 'Charge every subscription due tonight.',
  on: { clock: { every: 'day', at: '03:00', tz: 'Europe/Vienna' } },
  select: { query: { fingerprint: 'subscriptions/due' }, mode: 'each', unitKey: 'subscription_id' },
  effect: { name: 'payments.charge', input: { amount: { $ref: '$.row.amount' }, who: { $ref: '$.row.name' } } },
};

const markPaid: ReflexInput = {
  id: 'billing.mark-paid',
  intent: 'Mark the invoice paid when a charge succeeds.',
  on: { fact: { entity: 'charge_attempts', op: 'insert' } },
  when: { $eq: [{ $ref: '$.fact.row.status' }, 'succeeded'] },
  effect: { name: 'invoice.markPaid', input: { who: { $ref: '$.fact.row.who' } } },
};

const recordDecline: ReflexInput = {
  id: 'billing.record-decline',
  intent: 'Record a decline — a domain outcome, not an error.',
  on: { fact: { entity: 'charge_attempts', op: 'insert' } },
  when: { $eq: [{ $ref: '$.fact.row.status' }, 'declined'] },
  effect: { name: 'invoice.markFailed', input: { who: { $ref: '$.fact.row.who' } } },
};

const receipt: ReflexInput = {
  id: 'billing.send-receipt',
  intent: 'Send the receipt once the invoice is paid.',
  on: { fact: { entity: 'invoices', op: 'update' } },
  effect: { name: 'mail.send', input: { receiptFor: { $ref: '$.fact.row.who' } } },
};

const due = [
  { subscription_id: 's1', name: 'Ada', amount: 4900 },
  { subscription_id: 's2', name: 'Grace', amount: 4900 },
];

// The handlers write their outcome back as facts — that is how a chain
// continues without an orchestrator holding state. Under moss these are
// ordinary vex mutations, and the facts arrive for free.
const whoOf = (input: unknown): string => String((input as { who?: unknown }).who ?? '');

const effects: EffectRegistry = {
  'payments.charge': {
    writes: ['charge_attempts'],
    run: (input, ctx) => {
      const who = whoOf(input);
      // Grace's card declines. That is an ANSWER, not a failure — so the
      // handler returns it, the task is done, and a different reflex branches
      // on the row it wrote.
      const status = who === 'Grace' ? 'declined' : 'succeeded';
      ctx.emit({ kind: 'write', entity: 'charge_attempts', op: 'insert', row: { who, status }, at: ctx.now });
      return { status };
    },
  },
  'invoice.markPaid': {
    writes: ['invoices'],
    run: (input, ctx) => {
      const who = whoOf(input);
      ctx.emit({ kind: 'write', entity: 'invoices', op: 'update', row: { who, status: 'paid' }, at: ctx.now });
      return { paid: true };
    },
  },
  'invoice.markFailed': { writes: ['invoices'], run: (input) => input },
  'mail.send': { run: (input) => input },
};

export const Demo = () => (
  <TideLab
    reflexes={[charge, markPaid, recordDecline, receipt]}
    rows={due}
    effects={effects}
    start={Date.UTC(2026, 2, 1, 0, 0)}
    steps={[{ label: '+1 day', ms: 86_400_000 }]}
    note="Press +1 day to start the run, then ONE STEP repeatedly and watch the chain walk hop by hop: charge → charge_attempts → mark paid (or record the decline) → invoices → receipt. Grace's card declines: the handler RETURNS that outcome rather than throwing, so the task is done and a different reflex branches on the row. Every arrow in that sentence is a committed fact in the bottom panel. A host's driver does not press the button — it drains to quiescence on every ingest, so the whole chain runs in the milliseconds after the write."
  />
);
