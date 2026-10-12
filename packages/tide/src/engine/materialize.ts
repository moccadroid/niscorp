import { clockOf } from '../schemas';
import type { ReflexState } from '../types';
import type { EngineDeps, LoadedReflex } from './runtime';
import { occurrencesBetween } from './occurrence';
import { openRun } from './match';

const MAX_OCCURRENCES_PER_TICK = 500;

export const stateOf = async (deps: EngineDeps, reflexId: string): Promise<ReflexState | undefined> =>
  (await deps.store.query({ table: 'state', where: { reflexId }, limit: 1 }))[0];

const patchState = async (deps: EngineDeps, reflexId: string, patch: Partial<ReflexState>): Promise<void> => {
  if (await deps.store.cas('state', reflexId, {}, patch)) return;
  const created = await deps.store.appendIfAbsent('state', { reflexId, armedAt: 0, ...patch });
  if (created === undefined) await deps.store.cas('state', reflexId, {}, patch);
};

export type MaterializeReport = { materialized: number; skippedOccurrences: number; runsCreated: number };

export const materializeClocks = async (deps: EngineDeps, now: number): Promise<MaterializeReport> => {
  const report: MaterializeReport = { materialized: 0, skippedOccurrences: 0, runsCreated: 0 };

  for (const loaded of deps.reflexes()) {
    const clock = clockOf(loaded.reflex.on);
    if (clock === undefined) continue;

    const state = await stateOf(deps, loaded.reflex.id);
    const through = state?.materializedThrough ?? (loaded.armedAt > 0 ? loaded.armedAt : now);

    // A disabled reflex materializes nothing and still moves its watermark:
    // otherwise enabling it again would mint every occurrence of the pause.
    if (!loaded.reflex.enabled || now <= through) {
      if (state?.materializedThrough === undefined || now > through)
        await patchState(deps, loaded.reflex.id, { materializedThrough: loaded.reflex.enabled ? through : now });
      continue;
    }

    const occurrences = occurrencesBetween(clock, through, now, MAX_OCCURRENCES_PER_TICK);
    const newest = occurrences.length === 0 ? undefined : occurrences[occurrences.length - 1];
    const { catchUp, lateMs } = loaded.reflex.policy;

    for (const occurrence of occurrences) {
      const isNewest = occurrence === newest;
      const late = now - occurrence.at > lateMs;
      const skip = catchUp === 'latest' ? !isNewest : catchUp === 'skip' ? late : false;

      const run = await openRun(deps, loaded, {
        cause: `occurrence:${occurrence.key}`,
        depth: 0,
        dueAt: occurrence.at,
        now,
        occurrence: occurrence.key,
        state: skip ? 'skipped' : 'pending',
        note: skip ? `catchUp: ${catchUp} — occurrence ${occurrence.key} was ${Math.round((now - occurrence.at) / 1000)}s late` : undefined,
      });

      if (skip) report.skippedOccurrences += 1;
      else if (run !== undefined) {
        report.materialized += 1;
        report.runsCreated += 1;
      }
    }

    // When the cap bites, the watermark stops at the last occurrence
    // materialized and the next advance resumes after it: `occurrencesBetween`
    // excludes its start.
    const capped = occurrences.length >= MAX_OCCURRENCES_PER_TICK && newest !== undefined;
    await patchState(deps, loaded.reflex.id, { materializedThrough: capped ? newest.at : now });
  }

  return report;
};
