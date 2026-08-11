import { clockOf, pollOf } from '../schemas';
import type { Row } from '../types';
import { buildEnv, evaluateTemplate } from './runtime';
import type { EngineDeps, LoadedReflex } from './runtime';
import { occurrencesBetween } from './occurrence';
import { openFiring } from './match';
import { collectRows } from './fanout';

// ═══════════════════════════════════════════════════════════════
// Materialize (the clock) and Poll (the pull)
//
// Occurrences are materialized AHEAD, which is what makes silence
// visible: a firing that should have happened and didn't is a
// pending row past its due time — a query, not a vanished event.
// ═══════════════════════════════════════════════════════════════

const MAX_OCCURRENCES_PER_TICK = 500;

const materializedKey = (reflexId: string): string => `materialized:${reflexId}`;
const polledKey = (reflexId: string): string => `polled:${reflexId}`;

export type MaterializeReport = { materialized: number; skippedOccurrences: number; firingsCreated: number };

export const materializeClocks = async (deps: EngineDeps, now: number): Promise<MaterializeReport> => {
  const report: MaterializeReport = { materialized: 0, skippedOccurrences: 0, firingsCreated: 0 };

  for (const loaded of deps.reflexes()) {
    const clock = clockOf(loaded.reflex.on);
    if (clock === undefined || !loaded.reflex.enabled) continue;

    const stored = await deps.store.getWatermark(materializedKey(loaded.reflex.id));
    // A clock reflex with no arming time ESTABLISHES its baseline on the
    // first tick and mints nothing — the same rule a poll's first run
    // follows, and for the same reason: materializing from the epoch would
    // backfill decades of occurrences nobody asked for. A host that wants
    // history passes `at` to load(), or waits for the deferred backfill verb.
    const through = stored !== undefined ? Number(stored) : loaded.armedAt > 0 ? loaded.armedAt : now;
    if (now <= through) {
      if (stored === undefined) await deps.store.setWatermark(materializedKey(loaded.reflex.id), String(through));
      continue;
    }

    const occurrences = occurrencesBetween(clock, through, now, MAX_OCCURRENCES_PER_TICK);
    const newest = occurrences.length === 0 ? undefined : occurrences[occurrences.length - 1];
    const { catchUp, lateMs } = loaded.reflex.policy;

    for (const occurrence of occurrences) {
      // Catch-up is AUTHORED, not guessed. Each decision leaves a firing row
      // saying which happened — a skipped run is a recorded decision, never
      // an absence somebody has to infer.
      const isNewest = occurrence === newest;
      const late = now - occurrence.at > lateMs;
      const skip = catchUp === 'latest' ? !isNewest : catchUp === 'skip' ? late : false;

      const firing = await openFiring(deps, loaded, {
        cause: `occurrence:${occurrence.key}`,
        depth: 0,
        dueAt: occurrence.at,
        now,
        occurrence: occurrence.key,
        state: skip ? 'skipped' : 'pending',
        note: skip ? `catchUp: ${catchUp} — occurrence ${occurrence.key} was ${Math.round((now - occurrence.at) / 1000)}s late` : undefined,
      });

      if (skip) report.skippedOccurrences += 1;
      else if (firing !== undefined) {
        report.materialized += 1;
        report.firingsCreated += 1;
      }
    }

    await deps.store.setWatermark(materializedKey(loaded.reflex.id), String(now));
  }

  return report;
};

// ── poll ────────────────────────────────────────────────────────

type PollState = { cursor?: string; at: number };

const readPollState = (raw: string | undefined): PollState | undefined => {
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'at' in parsed) {
      const state = parsed as { cursor?: unknown; at?: unknown };
      return { cursor: typeof state.cursor === 'string' ? state.cursor : undefined, at: Number(state.at) };
    }
  } catch {
    return undefined;
  }
  return undefined;
};

// ISO timestamps and zero-padded ids compare correctly as strings; numeric
// ids do not. Compare numerically when both sides are numbers.
const isAfter = (candidate: string, cursor: string): boolean => {
  const left = Number(candidate);
  const right = Number(cursor);
  if (Number.isFinite(left) && Number.isFinite(right)) return left > right;
  return candidate > cursor;
};

export const pollSources = async (deps: EngineDeps, now: number): Promise<number> => {
  let minted = 0;

  for (const loaded of deps.reflexes()) {
    const poll = pollOf(loaded.reflex.on);
    if (poll === undefined || !loaded.reflex.enabled || loaded.reflex.select === undefined) continue;
    if (deps.select === undefined) continue;

    const state = readPollState(await deps.store.getWatermark(polledKey(loaded.reflex.id)));
    if (state !== undefined && now - state.at < poll.everyMs) continue;

    const env = buildEnv({ params: loaded.reflex.params, now });
    let rows: readonly Row[] = [];
    try {
      const query = evaluateTemplate(deps.transform, loaded.reflex.select.query, env);
      rows = await collectRows(deps.select(query, { reflexId: loaded.reflex.id, now, actor: deps.actorFor(loaded.reflex.as), env }), deps.maxFanOut);
    } catch {
      // A source that cannot be read is not a reason to lose the tick; the
      // watermark stays put, so nothing is silently skipped either.
      continue;
    }

    let highest = state?.cursor;
    const fresh: Row[] = [];
    for (const row of rows) {
      const value = row[poll.cursor];
      if (value === undefined || value === null) continue;
      const cursorValue = String(value);
      if (state?.cursor === undefined || isAfter(cursorValue, state.cursor)) fresh.push(row);
      if (highest === undefined || isAfter(cursorValue, highest)) highest = cursorValue;
    }

    // The first run ESTABLISHES the watermark and mints nothing. Pointing a
    // new poll at an existing table must not report ten thousand historical
    // rows as "new" — the classic first-sync flood.
    if (state !== undefined)
      for (const row of fresh) {
        const inserted = await deps.store.insertFact({
          kind: 'write',
          entity: poll.entity,
          op: 'insert',
          row,
          at: now,
          depth: 0,
          dedupeKey: `${loaded.reflex.id}:${String(row[poll.cursor])}`,
          cause: `poll:${loaded.reflex.id}`,
        });
        if (inserted !== undefined) {
          deps.emit({ type: 'fact.ingested', fact: inserted });
          minted += 1;
        }
      }

    await deps.store.setWatermark(polledKey(loaded.reflex.id), JSON.stringify({ cursor: highest, at: now }));
  }

  return minted;
};

export const isClockReflex = (loaded: LoadedReflex): boolean => clockOf(loaded.reflex.on) !== undefined;
