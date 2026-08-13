import { TideLab } from '@showroom/modules/tide/tide-lab';
import type { ReflexInput } from '@niscorp/tide';

// Dry run is a VERB, not a flag.
//
// Press preview: the real pipeline runs — the occurrence is computed, the
// selection hits real data, every Prism template is evaluated — and exactly
// one function is stubbed, the effect executor. Because that function is the
// only door out of tide, there is no per-reflex dry-run flag and no
// `if (dryRun)` for an author to forget. A reflex cannot opt out.
//
// Note what the report gives an operator: the eleven members who would be
// emailed tonight, BY NAME, with the exact message each would receive —
// before anything is armed.

const dunning: ReflexInput = {
  id: 'billing.dunning',
  intent: 'Email members whose payment failed, after the grace period.',
  on: { clock: { every: 'day', at: '09:00', tz: 'Europe/Vienna' } },
  select: { query: { fingerprint: 'members/overdue' }, mode: 'each', unitKey: 'member_id' },
  effect: {
    name: 'mail.send',
    input: {
      to: { $ref: '$.row.email' },
      subject: { $interpolate: { template: 'Hi {{name}} — your payment did not go through', values: { name: { $ref: '$.row.name' } } } },
      graceDays: { $ref: '$.params.graceDays' },
    },
  },
  params: { graceDays: 3 },
};

const overdue = [
  { member_id: 'm1', name: 'Ada', email: 'ada@studio.at' },
  { member_id: 'm2', name: 'Grace', email: 'grace@studio.at' },
  { member_id: 'm3', name: 'Alan', email: 'alan@studio.at' },
];

export const Demo = () => (
  <TideLab
    reflexes={[dunning]}
    rows={overdue}
    effects={{
      'mail.send': {
        run: (input: unknown) => input,
        // A handler may render what it WOULD do. Optional: preview works
        // without it, this just makes the report speak the effect's language.
        preview: (input: unknown) => ({ channel: 'email', to: (input as { to: string }).to, subject: (input as { subject: string }).subject }),
      },
    }}
    start={Date.UTC(2026, 2, 10, 12, 0)}
    previewOf="billing.dunning"
    steps={[{ label: '+1 day', ms: 86_400_000 }]}
    note="Press preview and read the report: three members by name, each with the resolved message. Then check the panels — no run, no task, nothing sent. Preview writes nothing at all. It is also where a typo'd template surfaces, which makes it the inner verb of the authoring loop rather than a debugging afterthought."
  />
);
