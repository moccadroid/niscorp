import { TideLab } from '@showroom/modules/tide/tide-lab';
import type { ReflexInput } from '@niscorp/tide';

// After four days of downtime, does the 03:00 run fire late, or is it
// skipped? BOTH answers are right for different automations, and guessing
// wrong either double-bills a customer or silently skips a month. So it is
// authored, per reflex — and whichever way it goes, a run row records the
// decision. A skipped run is never an absence somebody has to infer.
//
// Three identical reflexes, three policies. Press +5 days once.

const nightly = (id: string, catchUp: 'run' | 'skip' | 'latest'): ReflexInput => ({
  id,
  intent: `Nightly, with catchUp: ${catchUp}.`,
  on: { clock: { every: 'day', at: '03:00', tz: 'UTC' } },
  effect: { name: 'report.build', input: { policy: catchUp, day: { $ref: '$.occurrence.key' } } },
  policy: { catchUp, overlap: 'allow' },
});

export const Demo = () => (
  <TideLab
    reflexes={[nightly('report.run', 'run'), nightly('report.latest', 'latest'), nightly('report.skip', 'skip')]}
    effects={{ 'report.build': { run: (input: unknown) => input } }}
    start={Date.UTC(2026, 2, 1, 2, 30)}
    steps={[
      // Lands half an hour after the fifth night's 03:00 run, so the newest
      // occurrence is inside the default one-hour lateness window and the
      // four older ones are not — which is what makes the three policies
      // visibly disagree.
      { label: '+4 days (the outage)', ms: 349_200_000 },
      { label: '+1 day', ms: 86_400_000 },
    ]}
    note="Press +4 days once — that is the outage, ending half an hour after the last night's run was due. `run` fires all five missed nights (a monthly close wants every one). `latest` fires only the most recent and records four skipped. `skip` fires the one that is still on time and drops the four that are not. Read the runs panel: every skip carries a note saying which policy made the call and how late the occurrence was."
  />
);
