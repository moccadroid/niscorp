import { factOf, isManual } from '../schemas';
import type { Fact, Row, Run } from '../types';
import { buildEnv, evaluateTemplate, isTruthy } from './runtime';
import type { EngineDeps, LoadedReflex } from './runtime';

// ═══════════════════════════════════════════════════════════════
// Match — facts × reflexes
//
// Matching is per (fact, reflex): one fact can wake five. A `when`
// that throws is a recorded non-match, never a crashed advance and
// never a silent one — the two failure modes a naive matcher
// chooses between.
//
// There is no delivery table. "Which reflexes did this fact wake"
// is `WHERE cause = 'fact:<id>'`, a column rather than a join
// table; and the non-matches, which outnumber the matches and grow
// with the number of loaded reflexes rather than with the work,
// are an EVENT the host can log at whatever grain it wants.
// ═══════════════════════════════════════════════════════════════

export type OpenRunInput = {
  cause: string;
  depth: number;
  dueAt: number;
  now: number;
  occurrence?: string;
  factIds?: readonly string[];
  note?: string;
  state?: 'pending' | 'skipped';
  // Whether this cause is a REPEAT of work that may already be running.
  // `overlap: 'skip'` reads it, and nothing else does. See openRun.
  repeat?: boolean;
};

// The one place a run is born. Overlap lives here because "may this start
// while the last is unsettled" is a question about the reflex, not about
// what woke it.
export const openRun = async (deps: EngineDeps, loaded: LoadedReflex, input: OpenRunInput): Promise<Run | undefined> => {
  const { reflex, version } = loaded;

  const base = {
    reflexId: reflex.id,
    version,
    // Written down so the ledger is scopeable by an ordinary host rule
    // rather than by parsing reflex ids. Opaque to tide.
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

  // OVERLAP GOVERNS REPEATS, NOT DISTINCT EVENTS.
  //
  // "May this start while the last is unsettled" is a sensible question about
  // an occurrence — next month's billing run arriving while this month's is
  // still going is the same work coming round again, and skipping it is the
  // whole point. It is the WRONG question about a payment: two payments are two
  // pieces of work, and the second is not a repeat of the first.
  //
  // The default is `'skip'`, so with no distinction every fact-triggered reflex
  // silently dropped its second fact per tick. Three members joining in one
  // minute produced one welcome email and two skipped runs — recorded, so not
  // invisible, but gone. Lyra's watched automations were all in that state.
  //
  // A `manual` fact IS a repeat — a human pressing "run now" twice — so it
  // still guards. The tool for "do not run my handlers concurrently" is
  // `order: 'serial'`, which QUEUES; overlap discards, and discarding an
  // external event that exists exactly once is data loss.
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
        // Nothing waits on it and nothing announces it: a run that never
        // started has no settlement to report.
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

  // Checked FIRST, before enablement and arming: arming gates triggers, not
  // people. Testing before arming is half of what `fire` is for.
  if (fact.kind === 'manual') return fact.target === reflex.id;

  // A FACT MINTED UNDER ONE IDENTITY CANNOT WAKE A REFLEX RUNNING UNDER
  // ANOTHER. This is the tenant boundary inside the engine, and it is needed
  // because tide is the one place a row travels WITHOUT being read.
  //
  // Every database access already goes through the host: a selection and an
  // effect's write both run as the reflex's own principal, under a compiled
  // scope policy, and neither can see another tenant's rows. That held.
  // What leaked was the row tide was already carrying as a payload — in a
  // minted write fact, in a handler's `emit`, in a settled run's stats. The
  // matcher paired those payloads with reflexes by ENTITY alone, so one
  // tenant's row was handed to another tenant's effect and written under
  // their identity. No query was involved, so no policy was consulted, and
  // nothing downstream could have caught it: the row that landed was
  // legitimately the recipient's.
  //
  // The string is opaque — tide never learns what a principal is. STRICT
  // equality is the entire rule, and strict is the point: an earlier version
  // exempted facts with no identity, on the reasoning that the host knows what
  // it ingested. That is a hole with a rationalisation on top. A Stripe
  // webhook ingested for one tenant woke every tenant's `signal: 'stripe'`
  // reflex, and the payload went with it.
  //
  // So a fact with no identity wakes only reflexes with no identity. A host
  // that uses `as` declares it at the intake — `ingest(fact, { as })` — and a
  // host that does not use identities at all is unaffected, because undefined
  // equals undefined. An event that genuinely concerns every tenant is
  // ingested once per tenant, by the only party that can know which those are.
  //
  // Manual facts are exempt above and do not need this: `target` names exactly
  // one reflex, which is narrower than an identity.
  if (fact.as !== reflex.as) return false;

  if (!reflex.enabled) return false;
  // Never retro-fire: a fact older than the arming belongs to a world in
  // which this reflex did not exist.
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

  // NOTHING LOADED IS NOT "OFFERED TO EVERYONE".
  //
  // A fact is complete once it has been offered to every loaded reflex, and
  // with none loaded that condition was vacuously true: a tick racing `load()`
  // marked the whole backlog delivered, and the never-retro-fire rule then put
  // it permanently out of reach. Facts wait instead; retention bounds the wait.
  if (deps.reflexes().length === 0) return report;

  // Due, undelivered, unparked — ordered by when they became due, so a
  // backlog drains oldest-first.
  const due = await deps.store.query({
    table: 'fact',
    where: { deliveredAt: { isNull: true }, parked: { isNull: true } },
    order: [{ by: 'at' }],
    limit: limit * 4,
  });

  for (const fact of due.filter((candidate) => (candidate.notBefore ?? candidate.at) <= now).slice(0, limit)) {
    // The runtime backstop behind the load-time cycle rules. Nearly free,
    // because causality is already recorded: a divergent loop hits a loud
    // ceiling instead of melting the ledger.
    //
    // `released` is a human's override and has to survive the check that
    // parked it. Clearing `parked` alone re-parked the fact on the very next
    // tick — the depth had not changed and never would.
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
        // A write, a signal or another reflex's settlement happened once and
        // will not happen again; a human pressing the button twice will.
        repeat: fact.kind === 'manual',
      });
      if (run !== undefined) report.runsCreated += 1;
    }

    await deps.store.cas('fact', fact.id, {}, { deliveredAt: now });
    if (woke) report.factsMatched += 1;
  }

  return report;
};
