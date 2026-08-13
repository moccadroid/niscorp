import { clockOf } from '../schemas';
import { occurrencesBetween } from './occurrence';
import { stateOf } from './materialize';
import type { EngineDeps } from './runtime';

// ═══════════════════════════════════════════════════════════════
// nextDue — when is the next instant worth waking for?
//
// Tide still reads no clocks. It answers this question from its own
// rows and hands the answer to the driver, which owns the timer: a
// scheduler that sleeps until exactly this instant, preempted by any
// ingest. That inversion is what replaced the interval beat — the
// old world woke every minute to discover there was nothing to do,
// and made every chain crawl at the metronome's speed.
//
// The invariant that keeps the driver honest: an instant returned
// here is one where `advance` can MAKE PROGRESS. That is why a
// fanned run's `dueAt` is NOT considered — its tasks are the live
// thing (their backoff and leases are), and a fanned run waiting on
// a retrying task would otherwise report a past instant forever, a
// busy loop wearing a scheduler's clothes.
// ═══════════════════════════════════════════════════════════════

// Far enough that any real recurrence (daily, weekly, monthly, a yearly
// anniversary) has an occurrence inside it; a clock with nothing due in a
// year genuinely has nothing to say.
const CLOCK_HORIZON_MS = 370 * 24 * 60 * 60 * 1000;

export const nextDue = async (deps: EngineDeps, now: number): Promise<number | undefined> => {
  let due: number | undefined;
  const consider = (at: number | undefined): void => {
    if (at === undefined) return;
    if (due === undefined || at < due) due = at;
  };

  // Facts the matcher has not consumed: due at `notBefore ?? at`. Two
  // queries because the grammar has no coalesce — one min over the
  // immediate, one over the delayed.
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

  // Pending runs wait for fan-out at their own dueAt. (Fanned runs are
  // deliberately absent — see the header.)
  const [run] = await deps.store.query({ table: 'run', where: { state: 'pending' }, order: [{ by: 'dueAt' }], limit: 1 });
  consider(run?.dueAt);

  // Tasks: unclaimed work waits on its backoff; claimed work becomes
  // reclaimable when its lease lapses — the "found behind the couch" scan
  // is just this instant arriving.
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
      // No baseline yet: one advance establishes it and mints nothing —
      // due now, so the driver performs that one advance.
      if (state?.materializedThrough === undefined) {
        consider(now);
        continue;
      }
      // A DISABLED clock is due too. Its occurrence materializes nothing,
      // but the advance moves the watermark — "paused" means the clock
      // keeps moving, and a driver that never woke for it would hand the
      // reflex its whole pause as a backlog on re-arm.
      consider(occurrencesBetween(clock, state.materializedThrough, state.materializedThrough + CLOCK_HORIZON_MS, 1)[0]?.at);
    }
  }

  return due;
};
