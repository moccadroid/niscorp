import { factOf, isManual } from '../schemas';
import type { Fact, Row, Run } from '../types';
import { buildEnv, evaluateTemplate, isTruthy } from './runtime';
import type { EngineDeps, LoadedReflex } from './runtime';

export type OpenRunInput = {
  cause: string;
  depth: number;
  dueAt: number;
  now: number;
  occurrence?: string;
  factIds?: readonly string[];
  note?: string;
  state?: 'pending' | 'skipped';
  repeat?: boolean;
};

export const openRun = async (deps: EngineDeps, loaded: LoadedReflex, input: OpenRunInput): Promise<Run | undefined> => {
  const { reflex, version } = loaded;

  const base = {
    reflexId: reflex.id,
    version,
    as: reflex.as,
    cause: input.cause,
    occurrence: input.occurrence,
    factIds: input.factIds,
    depth: input.depth,
    total: 0,
    done: 0,
    failed: 0,
    dueAt: input.dueAt,
    createdAt: input.now,
  };

  // Overlap governs repeats, not distinct events. An occurrence coming round
  // again, or a person firing twice, is the same work and may be skipped; a
  // write, a signal or a settlement happens once, and skipping it loses it.
  if (input.repeat !== false && input.state !== 'skipped' && reflex.policy.overlap === 'skip') {
    const [unsettled] = await deps.store.query({
      table: 'run',
      where: { reflexId: reflex.id, state: { in: ['pending', 'fanned'] } },
      limit: 1,
    });
    if (unsettled !== undefined) {
      await deps.store.appendIfAbsent('run', {
        ...base,
        state: 'skipped',
        settledAt: input.now,
        drained: true,
        note: `overlap: the previous run (${unsettled.id}) is still unsettled`,
      });
      deps.emit({ type: 'run.skipped', reflexId: reflex.id, reason: 'overlap' });
      return undefined;
    }
  }

  const skipped = input.state === 'skipped';
  const run = await deps.store.appendIfAbsent('run', {
    ...base,
    state: input.state ?? 'pending',
    settledAt: skipped ? input.now : undefined,
    drained: skipped ? true : undefined,
    note: input.note,
  });

  if (run !== undefined && run.state === 'pending') deps.emit({ type: 'run.created', run });
  return run;
};

const factAsRow = (fact: Fact): Row => ({ ...fact });

export const reflexMatchesFact = (loaded: LoadedReflex, fact: Fact): boolean => {
  const { reflex } = loaded;

  // Before enablement and arming: a person can fire a reflex that is disabled.
  if (fact.kind === 'manual') return fact.target === reflex.id;

  // The tenant boundary inside the engine: a fact wakes only reflexes running
  // under the same identity, since its row reaches the effect with no query
  // and so no host policy. No identity wakes only reflexes with none.
  if (fact.as !== reflex.as) return false;

  if (!reflex.enabled) return false;
  if (fact.at < loaded.armedAt) return false;

  if (isManual(reflex.on)) return false;

  const watched = factOf(reflex.on);
  if (watched === undefined) return false;

  if (fact.kind === 'write')
    return watched.entity !== undefined && watched.entity === fact.entity && (watched.op === undefined || watched.op === fact.op);
  if (fact.kind === 'signal') return watched.signal !== undefined && watched.signal === fact.name;
  if (fact.kind === 'run') return watched.run !== undefined && watched.run === fact.reflex;
  return false;
};

export type MatchReport = { factsMatched: number; runsCreated: number; parked: number };

export const matchFacts = async (deps: EngineDeps, now: number, limit: number): Promise<MatchReport> => {
  const report: MatchReport = { factsMatched: 0, runsCreated: 0, parked: 0 };

  // With no reflex loaded, facts wait: marked delivered here, a backlog would
  // be out of reach of the reflexes a `load()` brings a moment later.
  if (deps.reflexes().length === 0) return report;

  const due = await deps.store.query({
    table: 'fact',
    where: { deliveredAt: { isNull: true }, parked: { isNull: true } },
    order: [{ by: 'at' }],
    limit: limit * 4,
  });

  for (const fact of due.filter((candidate) => (candidate.notBefore ?? candidate.at) <= now).slice(0, limit)) {
    if (fact.depth > deps.maxChainDepth && fact.released !== true) {
      const reason = `chain depth ${fact.depth} exceeds maxChainDepth ${deps.maxChainDepth}`;
      await deps.store.cas('fact', fact.id, {}, { parked: reason });
      deps.emit({ type: 'fact.parked', fact, reason });
      report.parked += 1;
      continue;
    }

    let woke = false;

    for (const loaded of deps.reflexes()) {
      if (!reflexMatchesFact(loaded, fact)) continue;

      const env = buildEnv({ params: loaded.reflex.params, fact: factAsRow(fact), now });

      if (loaded.reflex.when !== undefined) {
        try {
          if (!isTruthy(evaluateTemplate(deps.transform, loaded.reflex.when, env))) {
            deps.emit({ type: 'fact.unmatched', fact, reflexId: loaded.reflex.id, reason: '`when` did not match' });
            continue;
          }
        } catch (error) {
          deps.emit({
            type: 'fact.unmatched',
            fact,
            reflexId: loaded.reflex.id,
            reason: `when: ${error instanceof Error ? error.message : String(error)}`,
          });
          continue;
        }
      }

      woke = true;

      const run = await openRun(deps, loaded, {
        cause: `fact:${fact.id}`,
        depth: fact.depth,
        dueAt: now,
        now,
        occurrence: fact.occurrence,
        factIds: [fact.id],
        repeat: fact.kind === 'manual',
      });
      if (run !== undefined) report.runsCreated += 1;
    }

    await deps.store.cas('fact', fact.id, {}, { deliveredAt: now });
    if (woke) report.factsMatched += 1;
  }

  return report;
};
