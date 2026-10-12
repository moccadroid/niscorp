import { FactInputSchema, ReflexSchema, factOf } from './schemas';
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
import { admitFact, announceFact } from './engine/facts';

export type Tide = {
  load: (reflexes: readonly ReflexInput[], options?: { at?: number }) => Promise<LoadReport>;
  reflexes: () => readonly Reflex[];
  graph: () => GraphReport;

  ingest: (fact: FactInput, options?: { as?: string; cause?: string; depth?: number }) => Promise<Fact | undefined>;
  advance: (options: AdvanceOptions) => Promise<AdvanceReport>;
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
    causeChain: (factId: string) => Promise<readonly Fact[]>;
    releaseParked: (factId: string) => Promise<boolean>;
  };

  sweep: (now: number, retention: Retention) => Promise<number>;
};

const DEFAULT_MAX_CHAIN_DEPTH = 24;
const DEFAULT_MAX_CHAIN_FACTS = 10_000;
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

  let tokens = 0;
  const deps: EngineDeps = {
    store: config.store,
    transform: config.transform,
    select: config.select,
    effectsFor,
    actorFor: config.actor ?? ((as) => as),
    maxChainDepth: config.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH,
    maxChainFacts: config.maxChainFacts ?? DEFAULT_MAX_CHAIN_FACTS,
    maxFanOut: config.maxFanOut ?? DEFAULT_MAX_FAN_OUT,
    leaseMs: config.leaseMs ?? DEFAULT_LEASE_MS,
    emit: config.onEvent ?? (() => undefined),
    reflexes: () => [...loaded.values()],
    find: (id) => loaded.get(id),
    nextToken: () => {
      tokens += 1;
      return `tok_${tokens.toString(36)}`;
    },
  };

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

    const graph = buildGraph(parsed, mergedEffects(parsed));
    const refused = graph.refusals[0];
    if (refused !== undefined)
      throw new TideError(refused.code, `tide refused to load:\n  ${graph.errors.join('\n  ')}`, { errors: graph.errors, refusals: graph.refusals });

    const previously = new Set(loaded.keys());

    // Built aside and swapped in one synchronous step: a concurrent reader
    // never sees a half-loaded set.
    const next = new Map<string, LoadedReflex>();
    for (const reflex of parsed) {
      const stored = await stateOf(deps, reflex.id);
      // The stored arming time wins over `at`: a restart does not arm the
      // reflex again.
      const armedAt = stored?.armedAt ?? options?.at ?? 0;
      if (stored === undefined) await config.store.appendIfAbsent('state', { reflexId: reflex.id, armedAt });

      // A reflex entering the set has its watermark moved up to `at`: left out
      // of the load for a while, it would otherwise materialize all it missed.
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
    const union: EffectRegistry = {};
    for (const reflex of parsed) Object.assign(union, config.effects(reflex.as));
    return union;
  };

  // Looser than the matcher on purpose: nothing is dropped while no reflex is
  // loaded, and `enabled`, `as` and `armedAt` are not consulted.
  const watchable = (fact: FactInput): boolean => {
    if (config.storeUnwatchedWrites !== false) return true;
    if (fact.kind !== 'write') return true;
    if (loaded.size === 0) return true;
    for (const entry of loaded.values()) {
      const watched = factOf(entry.reflex.on);
      if (watched === undefined) continue;
      if (watched.entity === fact.entity && (watched.op === undefined || watched.op === fact.op)) return true;
    }
    return false;
  };

  const ingest = async (fact: FactInput, options?: { as?: string; cause?: string; depth?: number }): Promise<Fact | undefined> => {
    const result = FactInputSchema.safeParse(fact);
    if (!result.success)
      throw new TideError('invalid_fact', `fact did not parse: ${result.error.issues.map((i) => i.message).join('; ')}`, {
        issues: result.error.issues,
      });
    // Identity, cause and depth come from the second argument, never from the
    // fact: the fact is what a webhook body parses into, so whoever talks to
    // the host could choose them. A `cause` inside the fact is discarded.
    if (!watchable(result.data)) return undefined;
    const admission = await admitFact(config.store, { ...result.data, cause: options?.cause, depth: options?.depth ?? 0, as: options?.as }, deps.maxChainFacts);
    announceFact(deps.emit, admission);
    return 'stored' in admission ? admission.stored : undefined;
  };

  const advance = (options: AdvanceOptions): Promise<AdvanceReport> => runAdvance(deps, options);

  const fire = async (reflexId: string, options: { now: number; input?: unknown; by?: string }): Promise<Fact | undefined> => {
    if (!loaded.has(reflexId)) throw new TideError('unknown_reflex', `no reflex "${reflexId}" is loaded`);
    return ingest(
      { kind: 'manual', target: reflexId, payload: options.input, by: options.by ?? 'operator', at: options.now },
      { as: loaded.get(reflexId)?.reflex.as },
    );
  };

  const preview = (reflexId: string, options: PreviewOptions): Promise<PreviewReport> => previewReflex(deps, reflexId, options);

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
      // `released` as well: with `parked` alone cleared, the depth check would
      // park the fact again on the next advance.
      releaseParked: async (factId) => {
        const fact = await one('fact', factId);
        if (fact?.parked === undefined) return false;
        return config.store.cas('fact', factId, {}, { parked: undefined, released: true });
      },
    },

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
