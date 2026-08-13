import { clockOf, isRecurring } from '../schemas';
import { TideError } from '../errors';
import type { Fact, FactInput, PreviewReport, PreviewUnit } from '../types';
import { evaluateTemplate, isTruthy, withNow } from './runtime';
import type { EngineDeps } from './runtime';
import { occurrencesBetween } from './occurrence';
import { unitsForRun } from './fanout';

// ═══════════════════════════════════════════════════════════════
// Preview — dry run as a verb, not a flag
//
// The real pipeline runs: the occurrence is computed, the
// selection hits real data, every template is evaluated. Exactly
// one function is stubbed — the effect executor — and because
// that is the only door out of tide, there is no per-reflex
// dry-run flag and no `if (dryRun)` for an author to forget. A
// reflex CANNOT opt out of being previewable.
//
// Nothing here writes to the store. Preview is also where template
// typos surface, which makes it the authoring loop's inner verb.
// ═══════════════════════════════════════════════════════════════

const LOOKBACK_MS = 400 * 86_400_000;
const LOOKAHEAD_MS = 400 * 86_400_000;

export type PreviewOptions = { now: number; fact?: FactInput };

export const previewReflex = async (
  deps: EngineDeps,
  reflexId: string,
  options: PreviewOptions,
): Promise<PreviewReport> => {
  const loaded = deps.find(reflexId);
  if (loaded === undefined) throw new TideError('unknown_reflex', `no reflex "${reflexId}" is loaded`);

  const { reflex, version } = loaded;
  const { now } = options;

  const clock = clockOf(reflex.on);
  const occurrence = clock === undefined ? undefined : nearestOccurrence(clock, now);

  const facts: Fact[] =
    options.fact === undefined ? [] : [{ ...options.fact, id: 'preview-fact', depth: 0 }];

  const cause =
    occurrence !== undefined
      ? `occurrence:${occurrence.key}`
      : facts.length > 0
        ? 'fact:preview-fact'
        : `manual:preview`;

  const report: PreviewReport = {
    reflexId,
    version,
    fired: true,
    effect: reflex.effect.name,
    cause,
    occurrence: occurrence?.key,
    selected: 0,
    units: [],
  };

  // `when` is part of the truth a preview owes its reader: a reflex that
  // would not have matched must say so rather than showing a hypothetical.
  if (reflex.when !== undefined && facts.length > 0) {
    try {
      const env = { params: reflex.params ?? {}, fact: { ...facts[0] }, now };
      // THE ENGINE'S OWN PREDICATE, imported rather than restated. Preview
      // used to reject only false/null/undefined while the matcher also
      // rejects 0, '' and []: a `when` returning an empty list previewed as
      // "this will fire" and then didn't — the exact class of surprise preview
      // exists to eliminate.
      if (!isTruthy(evaluateTemplate(deps.transform, reflex.when, env)))
        return { ...report, fired: false, reason: '`when` did not match this fact' };
    } catch (error) {
      return { ...report, fired: false, reason: `when: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  let units;
  try {
    units = await unitsForRun(
      deps,
      loaded,
      { cause, occurrence: occurrence?.key, dueAt: occurrence?.at ?? now },
      facts,
      now,
    );
  } catch (error) {
    return { ...report, fired: false, reason: error instanceof Error ? error.message : String(error) };
  }

  const registry = deps.effectsFor(reflex.as);
  const handler = registry[reflex.effect.name];
  const actor = deps.actorFor(reflex.as);

  const previewed: PreviewUnit[] = units.map((unit) => {
    try {
      const input = evaluateTemplate(deps.transform, reflex.effect.input, withNow(unit.env, now));
      const render = handler?.preview?.(input, { reflexId, unit: unit.unit, now, actor });
      return { unit: unit.unit, env: unit.env, input, render };
    } catch (error) {
      return { unit: unit.unit, env: unit.env, error: error instanceof Error ? error.message : String(error) };
    }
  });

  return { ...report, selected: units.length, units: previewed };
};

// The occurrence a preview should show: the most recent one, or — for a
// reflex that has not come round yet — the next. Showing nothing because
// the clock happens to be between beats would be the least useful answer.
const nearestOccurrence = (
  clock: NonNullable<ReturnType<typeof clockOf>>,
  now: number,
): { key: string; at: number } | undefined => {
  const past = occurrencesBetween(clock, now - LOOKBACK_MS, now, 500);
  if (past.length > 0) return past[past.length - 1];
  const future = occurrencesBetween(clock, now, now + LOOKAHEAD_MS, 1);
  if (future.length > 0) return future[0];
  // A one-shot whose moment has passed outside the lookback still deserves
  // a key rather than an empty preview.
  return isRecurring(clock) ? undefined : { key: clock.at, at: now };
};
