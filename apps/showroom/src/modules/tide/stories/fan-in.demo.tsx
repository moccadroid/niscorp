import { TideLab } from '@showroom/modules/tide/tide-lab';
import type { ReflexInput } from '@niscorp/tide';

// Fan-in without a barrier primitive.
//
// Tide is the bookkeeper of its own fan-out: the run knows it minted five
// tasks, and when the last one settles it mints a FACT carrying the stats.
// "Send one digest when the batch is done" is then an ordinary reflex on an
// ordinary fact — no barrier, no "am I last?" logic in a handler, no state
// anybody has to hold.

const run: ReflexInput = {
  id: 'billing.run',
  intent: 'Charge every member due this month.',
  on: { clock: { every: 'month', on: 1, at: '03:00', tz: 'Europe/Vienna' } },
  select: { query: { fingerprint: 'subscriptions/due' }, mode: 'each', unitKey: 'member_id' },
  effect: { name: 'payments.charge', input: { who: { $ref: '$.row.name' } } },
  policy: { retry: { max: 1, backoff: 'fixed', baseMs: 600_000 } },
};

const digest: ReflexInput = {
  id: 'billing.digest',
  intent: 'Mail the owner one summary once the run settles.',
  on: { fact: { run: 'billing.run' } },
  effect: {
    name: 'mail.send',
    input: {
      to: { $ref: '$.params.owner' },
      period: { $ref: '$.fact.occurrence' },
      charged: { $ref: '$.fact.stats.done' },
      failed: { $ref: '$.fact.stats.failed' },
    },
  },
  params: { owner: 'owner@studio.at' },
};

const members = [
  { member_id: 'm1', name: 'Ada' },
  { member_id: 'm2', name: 'Grace' },
  { member_id: 'm3', name: 'Alan' },
  { member_id: 'm4', name: 'Edsger' },
  { member_id: 'm5', name: 'Barbara' },
];

const effects = {
  // Alan's gateway is down — a THROW, so tide retries it on backoff. The
  // digest cannot fire until that task reaches a terminal state, which is
  // exactly the guarantee a summary needs.
  'payments.charge': {
    run: (input: unknown) => {
      if ((input as { who: string }).who === 'Alan') throw new Error('gateway 503');
      return { status: 'succeeded' };
    },
  },
  'mail.send': { run: (input: unknown) => input },
};

export const Demo = () => (
  <TideLab
    reflexes={[run, digest]}
    rows={members}
    effects={effects}
    start={Date.UTC(2026, 1, 28, 0, 0)}
    steps={[
      { label: '+1 day', ms: 86_400_000 },
      { label: '+20 min', ms: 1_200_000 },
    ]}
    note="+1 day starts the monthly run: five tasks, four succeed, Alan's throws and goes to `retrying`. The digest stays silent — the run is not settled. Press +20 min until the retry exhausts and the task parks `failed`; the moment the last task settles, tide mints a `run` fact and the digest fires ONCE, carrying 4✓ 1✗ /5."
  />
);
