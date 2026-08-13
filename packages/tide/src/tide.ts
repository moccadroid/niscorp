import { FactInputSchema, ReflexSchema } from './schemas';
import type { Reflex, ReflexInput } from './schemas';
import { TideError } from './errors';
import type {
  AdvanceReport,
  EffectRegistry,
  Fact,
  FactInput,
  LoadReport,
  PreviewReport,
  Retention,
  Run,
  Task,
  TaskState,
  TideConfig,
} from './types';
import { versionOf } from './engine/runtime';
import type { EngineDeps, LoadedReflex } from './engine/runtime';
import { buildGraph } from './engine/graph';
import type { GraphReport } from './engine/graph';
import { runAdvance } from './engine/advance';
import type { AdvanceOptions } from './engine/advance';
import { nextDue as computeNextDue } from './engine/due';
import { previewReflex } from './engine/preview';
import type { PreviewOptions } from './engine/preview';
import { reopenTask } from './engine/execute';
import { stateOf } from './engine/materialize';

// ═══════════════════════════════════════════════════════════════
// createTide — the whole public surface
//
// Two edges (ingest in, advance to run — the driver's verb, paired
// with `nextDue` so the driver knows when to wake), three human
// verbs (fire, retry, preview), and a ledger anyone can read.
// Everything else is a seam the host filled.
//
// THERE IS NO arm/disarm, and its absence is the design. Tide had
// a pair, and they mutated an in-memory map: a second copy of a
// fact the host already owned as a column, lost on restart, and
// disagreeing with the host's own screen in between. Enablement is
// a property of the reflex the host hands over. To pause one, write
// your own row and load again — which is one source of truth, it
// survives a restart, and it is auditable where a method call is not.
// ═══════════════════════════════════════════════════════════════

export type Tide = {
  load: (reflexes: readonly ReflexInput[], options?: { at?: number }) => Promise<LoadReport>;
  reflexes: () => readonly Reflex[];
  graph: () => GraphReport;

  // `as` names the identity this fact belongs to, and it is how a host with
  // more than one tenant keeps them apart: a fact is only ever offered to
  // reflexes running under the SAME identity. Omit it and the fact reaches
  // only reflexes that name no identity either — which is every reflex in a
  // single-tenant host, and none in a multi-tenant one. `cause`/`depth` are
  // the bridge's chain thread — see the implementation's doctrine.
  ingest: (fact: FactInput, options?: { as?: string; cause?: string; depth?: number }) => Promise<Fact | undefined>;
  // One committed increment, given `now` — the DRIVER'S verb. A chain
  // advances one hop per call, so a driver drains to quiescence; a check
  // hands it a fake `now` and time-travels. Nothing outside a driver or a
  // check should be calling this.
  advance: (options: AdvanceOptions) => Promise<AdvanceReport>;
  // When the next instant worth waking for is — undefined means "nothing
  // scheduled: sleep until an ingest". The timer this feeds belongs to the
  // driver; tide still reads no clocks.
  nextDue: (now: number) => Promise<number | undefined>;

  fire: (reflexId: string, options: { now: number; input?: unknown; by?: string }) => Promise<Fact | undefined>;
  retry: (taskId: string, now: number) => Promise<boolean>;
  preview: (reflexId: string, options: PreviewOptions) => Promise<PreviewReport>;

  ledger: {
    runs: (filter?: { reflexId?: string; limit?: number }) => Promise<readonly Run[]>;
    run: (id: string) => Promise<Run | undefined>;
    tasks: (filter?: { runId?: string; reflexId?: string; state?: TaskState; limit?: number }) => Promise<readonly Task[]>;
    task: (id: string) => Promise<Task | undefined>;
    facts: (filter?: { reflexId?: string; limit?: number }) => Promise<readonly Fact[]>;
    fact: (id: string) => Promise<Fact | undefined>;
    // Walks `cause` upward: "why did this member get this email" is a walk
    // up rows, not an archaeology project.
    causeChain: (factId: string) => Promise<readonly Fact[]>;
    releaseParked: (factId: string) => Promise<boolean>;
  };

  sweep: (now: number, retention: Retention) => Promise<number>;
};

const DEFAULT_MAX_CHAIN_DEPTH = 24;
const DEFAULT_MAX_FAN_OUT = 10_000;
const DEFAULT_LEASE_MS = 300_000;

export const createTide = (config: TideConfig): Tide => {
  const loaded = new Map<string, LoadedReflex>();
  let effectsCache: EffectRegistry | undefined;

  const effectsFor = (as: string | undefined): EffectRegistry => {
    if (typeof config.effects === 'function') return config.effects(as);
    if (effectsCache === undefined) effectsCache = config.effects ?? {};
    return effectsCache;
  };

  const deps: EngineDeps = {
    store: config.store,
    transform: config.transform,
    select: config.select,
    effectsFor,
    actorFor: config.actor ?? ((as) => as),
    maxChainDepth: config.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH,
    maxFanOut: config.maxFanOut ?? DEFAULT_MAX_FAN_OUT,
    leaseMs: config.leaseMs ?? DEFAULT_LEASE_MS,
    emit: config.onEvent ?? (() => undefined),
    reflexes: () => [...loaded.values()],
    find: (id) => loaded.get(id),
  };

  // ── load ─────────────────────────────────────────────────────

  const load = async (input: readonly ReflexInput[], options?: { at?: number }): Promise<LoadReport> => {
    const parsed: Reflex[] = [];
    const seen = new Set<string>();

    for (const candidate of input) {
      const result = ReflexSchema.safeParse(candidate);
      if (!result.success)
        throw new TideError('invalid_reflex', `reflex did not parse: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, {
          issues: result.error.issues,
        });
      if (seen.has(result.data.id)) throw new TideError('duplicate_reflex', `duplicate reflex id "${result.data.id}"`);
      seen.add(result.data.id);
      parsed.push(result.data);
    }

    // Every opinion the load gate holds, in one pass: unregistered effects,
    // unguarded cycles, unknown run subscriptions. If it loads, it's
    // coherent — the moss tradition, one layer down.
    const graph = buildGraph(parsed, mergedEffects(parsed));
    if (graph.errors.length > 0)
      throw new TideError('unguarded_cycle', `tide refused to load:\n  ${graph.errors.join('\n  ')}`, { errors: graph.errors });

    const previously = new Set(loaded.keys());

    // Built ASIDE and swapped in one synchronous step. Clearing first and
    // filling across awaits left a window where a concurrent reader — a
    // screen re-reading right after the write that triggered the reload —
    // saw an empty or half-loaded engine and reported every reflex missing.
    const next = new Map<string, LoadedReflex>();
    for (const reflex of parsed) {
      const stored = await stateOf(deps, reflex.id);
      // Arming persists, so a restart does not re-open the past — and a host
      // that passes no `at` gets 0, which matches whatever is already stored.
      const armedAt = stored?.armedAt ?? options?.at ?? 0;
      if (stored === undefined) await config.store.appendIfAbsent('state', { reflexId: reflex.id, armedAt });

      // A REFLEX ENTERING THE SET RE-BASELINES ITS CLOCK.
      //
      // Without this, a reflex absent for eight days — deleted and restored,
      // or disabled by the host and left out of the load — comes back with an
      // eight-day-old watermark and materializes every occurrence it missed.
      // Coming back is not the same as never having left, and the difference
      // is eight days of real effects.
      if (!previously.has(reflex.id) && stored?.materializedThrough !== undefined && options?.at !== undefined)
        await config.store.cas('state', reflex.id, {}, { materializedThrough: Math.max(stored.materializedThrough, options.at) });

      next.set(reflex.id, { reflex, version: versionOf(reflex), armedAt });
    }
    loaded.clear();
    for (const [id, entry] of next) loaded.set(id, entry);

    return { loaded: parsed.length, cycles: graph.cycles, blind: graph.blind, warnings: graph.warnings };
  };

  const mergedEffects = (parsed: readonly Reflex[]): EffectRegistry => {
    if (typeof config.effects !== 'function') return config.effects ?? {};
    // A per-actor registry still has to be checkable at load, so the graph
    // sees the union of what every declared identity can reach.
    const union: EffectRegistry = {};
    for (const reflex of parsed) Object.assign(union, config.effects(reflex.as));
    return union;
  };

  // ── edges ────────────────────────────────────────────────────

  const ingest = async (fact: FactInput, options?: { as?: string; cause?: string; depth?: number }): Promise<Fact | undefined> => {
    const result = FactInputSchema.safeParse(fact);
    if (!result.success)
      throw new TideError('invalid_fact', `fact did not parse: ${result.error.issues.map((i) => i.message).join('; ')}`, {
        issues: result.error.issues,
      });
    // WHOSE FACT THIS IS — and where it CAME FROM — declared by the host at
    // the door rather than inferred later. SECOND-ARGUMENT fields and not
    // fields on the fact, because the fact shape is what a webhook body
    // parses into: anything on it can be sent by whoever is talking to the
    // host, and an identity — or a provenance, or a chain depth — a caller
    // can choose is not one. These are the host's own word; a `cause` that
    // arrived inside the fact is discarded for the same reason.
    //
    // `cause`/`depth` exist for one producer: a bridge that mints a
    // handler's own writes back in as facts, and must carry the chain the
    // write belongs to or the depth ceiling resets at every trip through
    // the host's database.
    const stored = await config.store.appendIfAbsent('fact', { ...result.data, cause: options?.cause, depth: options?.depth ?? 0, as: options?.as });
    if (stored !== undefined) deps.emit({ type: 'fact.ingested', fact: stored });
    return stored;
  };

  const advance = (options: AdvanceOptions): Promise<AdvanceReport> => runAdvance(deps, options);

  // ── human verbs ──────────────────────────────────────────────

  const fire = async (reflexId: string, options: { now: number; input?: unknown; by?: string }): Promise<Fact | undefined> => {
    if (!loaded.has(reflexId)) throw new TideError('unknown_reflex', `no reflex "${reflexId}" is loaded`);
    // Sugar over ingest: even the human verb enters through the one intake,
    // with `at` supplied by the caller like every fact. Tide reads no clock.
    return ingest(
      { kind: 'manual', target: reflexId, payload: options.input, by: options.by ?? 'operator', at: options.now },
      // Carried so the ledger reads consistently. Matching a manual fact does
      // not depend on it — `target` names one reflex, which is narrower.
      { as: loaded.get(reflexId)?.reflex.as },
    );
  };

  const preview = (reflexId: string, options: PreviewOptions): Promise<PreviewReport> => previewReflex(deps, reflexId, options);

  // ── ledger ───────────────────────────────────────────────────
  //
  // Ordinary queries, and that is the point. These used to be nine methods
  // on the store port that the ENGINE never called — a reporting surface
  // wedged into an execution contract. Under moss they are vex entries over
  // the same two tables; standalone they are these.

  const one = async <T extends 'run' | 'task' | 'fact'>(table: T, id: string) =>
    (await config.store.query({ table, where: { id } as never, limit: 1 }))[0];

  const causeChain = async (factId: string): Promise<readonly Fact[]> => {
    const chain: Fact[] = [];
    let current = await one('fact', factId);
    while (current !== undefined && chain.length < 64) {
      chain.push(current);
      const cause = current.cause;
      if (cause === undefined) break;
      const parentRunId = cause.startsWith('task:')
        ? (await one('task', cause.slice(5)))?.runId
        : cause.startsWith('run:')
          ? cause.slice(4)
          : undefined;
      if (parentRunId === undefined) break;
      const parentId = (await one('run', parentRunId))?.factIds?.[0];
      current = parentId === undefined ? undefined : await one('fact', parentId);
    }
    return chain;
  };

  // Newest first, so a `limit` means "the most recent N" everywhere. The two
  // stores used to answer opposite ends of the same list under the same
  // filter, which is the kind of divergence a contract test exists to catch.
  return {
    load,
    reflexes: () => [...loaded.values()].map((entry) => entry.reflex),
    graph: () => buildGraph([...loaded.values()].map((entry) => entry.reflex), mergedEffects([...loaded.values()].map((e) => e.reflex))),

    ingest,
    advance,
    nextDue: (now) => computeNextDue(deps, now),

    fire,
    retry: (taskId, now) => reopenTask(deps, taskId, now),
    preview,

    ledger: {
      runs: (filter) =>
        config.store.query({
          table: 'run',
          where: filter?.reflexId === undefined ? undefined : { reflexId: filter.reflexId },
          order: [{ by: 'createdAt', dir: 'desc' }],
          limit: filter?.limit,
        }),
      run: (id) => one('run', id),
      tasks: (filter) =>
        config.store.query({
          table: 'task',
          where: {
            ...(filter?.runId === undefined ? {} : { runId: filter.runId }),
            ...(filter?.reflexId === undefined ? {} : { reflexId: filter.reflexId }),
            ...(filter?.state === undefined ? {} : { state: filter.state }),
          },
          order: [{ by: 'createdAt', dir: 'desc' }],
          limit: filter?.limit,
        }),
      task: (id) => one('task', id),
      facts: async (filter) => {
        const found = await config.store.query({
          table: 'fact',
          order: [{ by: 'at', dir: 'desc' }],
          limit: filter?.reflexId === undefined ? filter?.limit : undefined,
        });
        const matched = filter?.reflexId === undefined ? found : found.filter((fact) => fact.reflex === filter.reflexId || fact.target === filter.reflexId);
        return filter?.limit === undefined ? matched : matched.slice(0, filter.limit);
      },
      fact: (id) => one('fact', id),
      causeChain,
      // Clears the park AND records that a human overrode the ceiling —
      // clearing the park alone is a ping-pong, because the depth that
      // parked it has not changed and never will.
      releaseParked: async (factId) => {
        const fact = await one('fact', factId);
        if (fact?.parked === undefined) return false;
        return config.store.cas('fact', factId, {}, { parked: undefined, released: true });
      },
    },

    // RETENTION, and the one place the ledger shrinks. Runs cascade to their
    // tasks in the store: a run and its members are one fact about the world,
    // and keeping half destroys the UNIQUE(runId, unit) row that IS the "this
    // unit already ran" record.
    sweep: async (now, retention) => {
      let removed = 0;
      if (retention.facts !== undefined)
        removed += await config.store.remove({ table: 'fact', where: { deliveredAt: { lt: now - retention.facts } } });
      if (retention.tasks !== undefined)
        removed += await config.store.remove({ table: 'task', where: { settledAt: { lt: now - retention.tasks } } });
      if (retention.runs !== undefined)
        removed += await config.store.remove({ table: 'run', where: { settledAt: { lt: now - retention.runs } } });
      return removed;
    },
  };
};
