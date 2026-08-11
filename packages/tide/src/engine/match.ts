import { factOf, isManual, pollOf } from '../schemas';
import type { Fact, Firing, Row } from '../types';
import { buildEnv, evaluateTemplate, isTruthy } from './runtime';
import type { EngineDeps, LoadedReflex } from './runtime';

// ═══════════════════════════════════════════════════════════════
// Match — facts × reflexes
//
// Delivery is per (fact, reflex): one fact can wake five reflexes,
// and each gets its own accounting row. A `when` that throws is a
// recorded no-match, never a crashed tick and never a silent one —
// the two failure modes a naive matcher chooses between.
// ═══════════════════════════════════════════════════════════════

export type OpenFiringInput = {
  cause: string;
  depth: number;
  dueAt: number;
  now: number;
  occurrence?: string;
  factIds?: readonly string[];
  note?: string;
  state?: 'pending' | 'skipped';
};

// The one place a firing is born. Overlap lives here because "may this
// start while the last is unsettled" is a question about the reflex, not
// about what woke it.
export const openFiring = async (
  deps: EngineDeps,
  loaded: LoadedReflex,
  input: OpenFiringInput,
): Promise<Firing | undefined> => {
  const { reflex, version } = loaded;

  if (input.state !== 'skipped' && reflex.policy.overlap === 'skip') {
    const unsettled = await deps.store.unsettledFiring(reflex.id);
    if (unsettled !== undefined) {
      await deps.store.createFiring({
        reflexId: reflex.id,
        version,
        cause: input.cause,
        occurrence: input.occurrence,
        factIds: input.factIds,
        state: 'skipped',
        depth: input.depth,
        total: 0,
        done: 0,
        failed: 0,
        dueAt: input.dueAt,
        createdAt: input.now,
        settledAt: input.now,
        note: `overlap: the previous firing (${unsettled.id}) is still unsettled`,
      });
      deps.emit({ type: 'firing.skipped', reflexId: reflex.id, reason: 'overlap' });
      return undefined;
    }
  }

  const firing = await deps.store.createFiring({
    reflexId: reflex.id,
    version,
    cause: input.cause,
    occurrence: input.occurrence,
    factIds: input.factIds,
    state: input.state ?? 'pending',
    depth: input.depth,
    total: 0,
    done: 0,
    failed: 0,
    dueAt: input.dueAt,
    createdAt: input.now,
    settledAt: input.state === 'skipped' ? input.now : undefined,
    note: input.note,
  });

  if (firing !== undefined && firing.state === 'pending') deps.emit({ type: 'firing.created', firing });
  return firing;
};

const factAsRow = (fact: Fact): Row => ({ ...fact });

export const reflexMatchesFact = (loaded: LoadedReflex, fact: Fact): boolean => {
  const { reflex } = loaded;

  // Checked FIRST, before enablement and arming: arming gates triggers, not
  // people. Testing before arming is half of what `fire` is for.
  if (fact.kind === 'manual') return fact.target === reflex.id;

  if (!reflex.enabled) return false;
  // Never retro-fire: a fact older than the arming belongs to a world in
  // which this reflex did not exist.
  if (fact.at < loaded.armedAt) return false;

  const poll = pollOf(reflex.on);
  if (poll !== undefined) return fact.kind === 'write' && fact.entity === poll.entity;

  if (isManual(reflex.on)) return false;

  const watched = factOf(reflex.on);
  if (watched === undefined) return false;

  if (fact.kind === 'write')
    return watched.entity !== undefined && watched.entity === fact.entity && (watched.op === undefined || watched.op === fact.op);
  if (fact.kind === 'signal') return watched.signal !== undefined && watched.signal === fact.name;
  if (fact.kind === 'firing') return watched.firing !== undefined && watched.firing === fact.reflex;
  return false;
};

export type MatchReport = { factsMatched: number; firingsCreated: number; parked: number };

export const matchFacts = async (deps: EngineDeps, now: number, limit: number): Promise<MatchReport> => {
  const report: MatchReport = { factsMatched: 0, firingsCreated: 0, parked: 0 };
  const due = await deps.store.dueFacts(now, limit);

  for (const fact of due) {
    // The runtime backstop behind the load-time cycle rules. Nearly free,
    // because causality is already recorded: a divergent loop hits a loud
    // ceiling instead of melting the ledger.
    if (fact.depth > deps.maxChainDepth) {
      await deps.store.parkFact(fact.id, `chain depth ${fact.depth} exceeds maxChainDepth ${deps.maxChainDepth}`);
      deps.emit({ type: 'fact.parked', fact, reason: 'maxChainDepth' });
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
            await deps.store.recordDelivery({ factId: fact.id, reflexId: loaded.reflex.id, outcome: 'no-match', at: now });
            continue;
          }
        } catch (error) {
          await deps.store.recordDelivery({
            factId: fact.id,
            reflexId: loaded.reflex.id,
            outcome: 'error',
            at: now,
            note: `when: ${error instanceof Error ? error.message : String(error)}`,
          });
          continue;
        }
      }

      woke = true;

      const coalesce = loaded.reflex.policy.coalesce;
      if (coalesce !== undefined) {
        let key = '';
        try {
          if (coalesce.key !== undefined) key = String(evaluateTemplate(deps.transform, coalesce.key, env) ?? '');
        } catch {
          key = '';
        }
        await deps.store.appendCoalesce(loaded.reflex.id, key, fact.id, now, coalesce.windowMs);
        await deps.store.recordDelivery({ factId: fact.id, reflexId: loaded.reflex.id, outcome: 'coalesced', at: now });
        continue;
      }

      const firing = await openFiring(deps, loaded, {
        cause: `fact:${fact.id}`,
        depth: fact.depth,
        dueAt: now,
        now,
        occurrence: fact.occurrence,
        factIds: [fact.id],
      });
      await deps.store.recordDelivery({
        factId: fact.id,
        reflexId: loaded.reflex.id,
        outcome: firing === undefined ? 'skipped' : 'fired',
        at: now,
      });
      if (firing !== undefined) report.firingsCreated += 1;
    }

    await deps.store.completeFact(fact.id, now);
    if (woke) report.factsMatched += 1;
  }

  // Closed windows become one firing carrying the whole batch. The close is
  // claimed atomically, so two instances cannot both fire the digest.
  for (const window of await deps.store.claimClosedWindows(now)) {
    const loaded = deps.find(window.reflexId);
    if (loaded === undefined) continue;
    const firing = await openFiring(deps, loaded, {
      cause: `window:${window.id}`,
      depth: 0,
      dueAt: now,
      now,
      factIds: window.factIds,
    });
    if (firing !== undefined) report.firingsCreated += 1;
  }

  return report;
};
