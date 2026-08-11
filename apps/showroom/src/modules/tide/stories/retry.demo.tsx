import { TideLab } from '@showroom/modules/tide/tide-lab';
import type { ReflexInput } from '@niscorp/tide';

// Retry classification is a CALLING CONVENTION, not metadata.
//
//   return  →  done. A card decline is a domain outcome: record it, and let
//              another reflex branch on the row. Never retried.
//   throw   →  transient. Retried on bounded backoff, then parked `failed`:
//              terminal, visible, and exitable only by a human verb.
//
// The decision sits where the knowledge is — only the payment handler can
// tell a decline from a gateway 500 — and nobody can forget to declare it,
// because there is nothing to declare.

const charge: ReflexInput = {
  id: 'payments.charge',
  intent: 'Charge three cards with three different fates.',
  on: { clock: { every: 'day', at: '03:00', tz: 'UTC' } },
  select: { query: {}, mode: 'each', unitKey: 'id' },
  effect: { name: 'stripe.charge', input: { id: { $ref: '$.row.id' }, fate: { $ref: '$.row.fate' } } },
  policy: { retry: { max: 2, backoff: 'exponential', baseMs: 600_000 } },
};

const cards = [
  { id: 'ok', fate: 'succeeds' },
  { id: 'declined', fate: 'declines' },
  { id: 'flaky', fate: 'throws' },
];

let flakyAttempts = 0;

const effects = {
  'stripe.charge': {
    run: (input: unknown) => {
      const { fate } = input as { fate: string };
      // A decline RETURNS — it is an answer, not a failure.
      if (fate === 'declines') return { status: 'declined', code: 'insufficient_funds' };
      // A gateway fault THROWS — the only thing worth trying again.
      if (fate === 'throws') {
        flakyAttempts += 1;
        if (flakyAttempts <= 2) throw new Error('gateway 503');
        return { status: 'succeeded', afterAttempts: flakyAttempts };
      }
      return { status: 'succeeded' };
    },
  },
};

export const Demo = () => {
  flakyAttempts = 0;
  return (
    <TideLab
      reflexes={[charge]}
      rows={cards}
      effects={effects}
      start={Date.UTC(2026, 2, 1, 0, 0)}
      steps={[
        { label: '+1 day', ms: 86_400_000 },
        { label: '+10 min', ms: 600_000 },
        { label: '+30 min', ms: 1_800_000 },
      ]}
      note="+1 day runs all three. `ok` and `declined` are both DONE on the first pass — the decline returned an answer. `flaky` threw, so it is `retrying` with an exponential backoff you can watch elapse: press +10 min, then +30 min. Partial failure is structural here — one unit's trouble never touched its neighbours, and every attempt is its own ledger row."
    />
  );
};
