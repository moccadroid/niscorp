import { clockOf } from '../schemas';
import { occurrencesBetween } from './occurrence';
import { stateOf } from './materialize';
import type { EngineDeps } from './runtime';

const CLOCK_HORIZON_MS = 370 * 24 * 60 * 60 * 1000;

export const nextDue = async (deps: EngineDeps, now: number): Promise<number | undefined> => {
  let due: number | undefined;
  const consider = (at: number | undefined): void => {
    if (at === undefined) return;
    if (due === undefined || at < due) due = at;
  };

  const [immediate] = await deps.store.query({
    table: 'fact',
    where: { deliveredAt: { isNull: true }, parked: { isNull: true }, notBefore: { isNull: true } },
    order: [{ by: 'at' }],
    limit: 1,
  });
  consider(immediate?.at);
  const [delayed] = await deps.store.query({
    table: 'fact',
    where: { deliveredAt: { isNull: true }, parked: { isNull: true }, notBefore: { isNull: false } },
    order: [{ by: 'notBefore' }],
    limit: 1,
  });
  consider(delayed?.notBefore);

  // Pending runs only: a fanned run waiting on a retrying task would report a
  // past instant on every call. Its tasks, below, are what is due.
  const [run] = await deps.store.query({ table: 'run', where: { state: 'pending' }, order: [{ by: 'dueAt' }], limit: 1 });
  consider(run?.dueAt);

  const [waiting] = await deps.store.query({
    table: 'task',
    where: { state: { in: ['pending', 'retrying'] } },
    order: [{ by: 'notBefore' }],
    limit: 1,
  });
  consider(waiting?.notBefore);
  const [claimed] = await deps.store.query({ table: 'task', where: { state: 'claimed' }, order: [{ by: 'claimedUntil' }], limit: 1 });
  consider(claimed?.claimedUntil);

  for (const loaded of deps.reflexes()) {
    const clock = clockOf(loaded.reflex.on);
    if (clock !== undefined) {
      const state = await stateOf(deps, loaded.reflex.id);
      // No watermark yet: due now, so the driver's next advance sets it.
      if (state?.materializedThrough === undefined) {
        consider(now);
        continue;
      }
      // A disabled clock is due too: the advance moves its watermark, or the
      // reflex would get its whole pause as a backlog when enabled again.
      consider(occurrencesBetween(clock, state.materializedThrough, state.materializedThrough + CLOCK_HORIZON_MS, 1)[0]?.at);
    }
  }

  return due;
};
