import { clockOf } from '../schemas';
import type { ReflexState } from '../types';
import type { EngineDeps, LoadedReflex } from './runtime';
import { occurrencesBetween } from './occurrence';
import { openRun } from './match';

// ═══════════════════════════════════════════════════════════════
// Materialize — the clock
//
// Occurrences are materialized AHEAD, which is what makes silence
// visible: a run that should have happened and didn't is a pending
// row past its due time — a query, not a vanished event.
//
// One row read and written per reflex. The watermark used to be
// an unbounded key/value table with a growing set of string keys;
// "where has this reflex got to" is a property of the reflex, and
// there are as many of those as there are reflexes.
// ═══════════════════════════════════════════════════════════════

const MAX_OCCURRENCES_PER_TICK = 500;

export const stateOf = async (deps: EngineDeps, reflexId: string): Promise<ReflexState | undefined> =>
  (await deps.store.query({ table: 'state', where: { reflexId }, limit: 1 }))[0];

// Upsert on a table whose primary key IS the reflex id. The append can lose
// to another instance creating the row first, which is a refusal rather than
// an error — so the patch is re-applied to the row that won.
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
    // A clock reflex with no arming time ESTABLISHES its baseline on the
    // first advance and mints nothing: materializing from the epoch would
    // backfill decades of occurrences nobody asked for. A host that wants
    // history passes `at` to load(), or waits for the deferred backfill verb.
    const through = state?.materializedThrough ?? (loaded.armedAt > 0 ? loaded.armedAt : now);

    // A DISARMED REFLEX STILL MOVES ITS WATERMARK.
    //
    // Skipping it outright froze the line where the disarm happened, so a
    // reflex paused for eight days minted eight occurrences the moment it
    // came back — and, before the switch became the host's own column, eight
    // real effects with it. Nothing is materialized while it is off; the
    // clock simply keeps moving, which is what "paused" means to everybody
    // who is not a computer.
    if (!loaded.reflex.enabled || now <= through) {
      if (state?.materializedThrough === undefined || now > through)
        await patchState(deps, loaded.reflex.id, { materializedThrough: loaded.reflex.enabled ? through : now });
      continue;
    }

    const occurrences = occurrencesBetween(clock, through, now, MAX_OCCURRENCES_PER_TICK);
    const newest = occurrences.length === 0 ? undefined : occurrences[occurrences.length - 1];
    const { catchUp, lateMs } = loaded.reflex.policy;

    for (const occurrence of occurrences) {
      // Catch-up is AUTHORED, not guessed. Each decision leaves a run row
      // saying which happened — a skipped run is a recorded decision, never
      // an absence somebody has to infer.
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

    // THE WATERMARK FOLLOWS THE WORK, NOT THE CLOCK.
    //
    // It used to jump to `now` unconditionally. A reflex that came back after
    // a long outage produced more occurrences than the per-tick cap, and
    // everything past the cap was dropped while the watermark sailed past it:
    // unreachable forever, with no row anywhere saying they had existed. When
    // the cap bites, the next tick resumes from the last key actually
    // materialized — `occurrencesBetween` is half-open at the start, so the
    // edge is not re-minted.
    const capped = occurrences.length >= MAX_OCCURRENCES_PER_TICK && newest !== undefined;
    await patchState(deps, loaded.reflex.id, { materializedThrough: capped ? newest.at : now });
  }

  return report;
};
