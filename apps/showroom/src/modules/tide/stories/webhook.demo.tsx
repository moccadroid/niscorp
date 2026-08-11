import { TideLab } from '@showroom/modules/tide/tide-lab';
import type { ReflexInput } from '@niscorp/tide';

// Two sources of change, and only two: the clock and the fact.
//
// A webhook is somebody else's write arriving over HTTP. Push one and watch
// it wake a reflex. Push the SAME one again — the provider's event id is a
// `dedupeKey`, so the repeat drops silently, which is a refusal rather than
// an error. Then push the delayed one: "retry the decline in three days" is
// a fact with a `notBefore`, sitting visibly in the ledger. No setTimeout is
// hiding in a process anywhere; timers are data.

const onPaymentFailed: ReflexInput = {
  id: 'billing.on-failed',
  intent: 'Open a dunning case when Stripe reports a failed charge.',
  on: { fact: { signal: 'stripe' } },
  when: { $eq: [{ $ref: '$.fact.payload.type' }, 'charge.failed'] },
  effect: {
    name: 'dunning.open',
    input: { charge: { $ref: '$.fact.payload.id' }, member: { $ref: '$.fact.payload.member' } },
  },
};

const onReminderDue: ReflexInput = {
  id: 'billing.reminder',
  intent: 'Send the follow-up once the grace period has elapsed.',
  on: { fact: { entity: 'dunning_reminders', op: 'insert' } },
  effect: { name: 'mail.send', input: { member: { $ref: '$.fact.row.member' } } },
};

const effects = {
  'dunning.open': { touches: ['dunning_cases'], run: (input: unknown) => input },
  'mail.send': { run: (input: unknown) => input },
};

const THREE_DAYS = 259_200_000;

export const Demo = () => (
  <TideLab
    reflexes={[onPaymentFailed, onReminderDue]}
    effects={effects}
    start={Date.UTC(2026, 2, 1, 9, 0)}
    steps={[
      { label: '+1 hour', ms: 3_600_000 },
      { label: '+1 day', ms: 86_400_000 },
      { label: '+3 days', ms: THREE_DAYS },
    ]}
    push={[
      {
        label: 'webhook: charge.failed (evt_92xk)',
        fact: { kind: 'signal', name: 'stripe', dedupeKey: 'evt_92xk', payload: { type: 'charge.failed', id: 'ch_1', member: 'Ada' }, at: 0 },
      },
      {
        label: 'webhook: charge.succeeded (evt_51ab)',
        fact: { kind: 'signal', name: 'stripe', dedupeKey: 'evt_51ab', payload: { type: 'charge.succeeded', id: 'ch_2', member: 'Grace' }, at: 0 },
      },
      {
        label: 'schedule a reminder in 3 days',
        fact: { kind: 'write', entity: 'dunning_reminders', op: 'insert', row: { member: 'Ada' }, at: 0, notBefore: Date.UTC(2026, 2, 4, 9, 0) },
      },
    ]}
    note="Push the failed charge, then press one tick. Push the SAME webhook again — the ledger does not grow, because the provider's event id already arrived. The succeeded webhook is delivered but does not match the `when`, which is recorded rather than silent. Finally schedule the reminder: it sits in the fact panel marked with the time it waits for, and only fires once you cross it."
  />
);
