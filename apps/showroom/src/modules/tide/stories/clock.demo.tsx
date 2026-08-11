import { TideLab } from '@showroom/modules/tide/tide-lab';
import type { ReflexInput } from '@niscorp/tide';

// A reflex is an artifact: a trigger, an optional selection, one effect.
// This one runs nightly at 03:00 Vienna and emails whoever the selection
// returns. Push the clock forward a day at a time and watch the occurrences
// fire — then press "+1 hour" a few times and watch NOTHING happen, because
// `2026-03-02` has already run and an occurrence key fires exactly once.

const nightly: ReflexInput = {
  id: 'studio.reminders',
  intent: 'Remind everyone booked into tomorrow morning.',
  on: { clock: { every: 'day', at: '03:00', tz: 'Europe/Vienna' } },
  select: { query: { fingerprint: 'bookings/tomorrow' }, mode: 'each', unitKey: 'member_id' },
  effect: {
    name: 'mail.send',
    input: { to: { $ref: '$.row.email' }, day: { $ref: '$.occurrence.key' } },
  },
};

const bookings = [
  { member_id: 'm1', email: 'ada@studio.at' },
  { member_id: 'm2', email: 'grace@studio.at' },
];

export const Demo = () => (
  <TideLab
    reflexes={[nightly]}
    rows={bookings}
    effects={{ 'mail.send': { run: (input) => input } }}
    start={Date.UTC(2026, 2, 1, 0, 0)}
    steps={[
      { label: '+1 hour', ms: 3_600_000 },
      { label: '+1 day', ms: 86_400_000 },
      { label: '+1 week', ms: 604_800_000 },
    ]}
    note="Occurrence identity is LOCAL CALENDAR FIELDS — 2026-03-02, not an instant. Advance a day and it fires once; advance an hour and it does not fire again, because the key already ran. That is the whole idempotency story, and it is also why a DST transition can neither double-fire nor skip."
  />
);
