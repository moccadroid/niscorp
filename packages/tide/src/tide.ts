import { FactInputSchema, ReflexSchema } from './schemas';
import type { Reflex, ReflexInput } from './schemas';
import { TideError } from './errors';
import type {
  Attempt,
  EffectRegistry,
  Fact,
  FactInput,
  Firing,
  LoadReport,
  PreviewReport,
  Retention,
  Task,
  TaskState,
  TickReport,
  TideConfig,
} from './types';
import { versionOf } from './engine/runtime';
import type { EngineDeps, LoadedReflex } from './engine/runtime';
import { buildGraph } from './engine/graph';
import type { GraphReport } from './engine/graph';
import { runTick } from './engine/tick';
import type { TickOptions } from './engine/tick';
import { previewReflex } from './engine/preview';
import type { PreviewOptions } from './engine/preview';

// ═══════════════════════════════════════════════════════════════
// createTide — the whole public surface
//
// Two edges (ingest in, tick to run), three human verbs (fire,
// retry, preview), and a ledger anyone can read. Everything else
// is a seam the host filled.
// ═══════════════════════════════════════════════════════════════

export type Tide = {
  load: (reflexes: readonly ReflexInput[], options?: { at?: number }) => Promise<LoadReport>;
  reflexes: () => readonly Reflex[];
  graph: () => GraphReport;

  ingest: (fact: FactInput) => Promise<Fact | undefined>;
  tick: (options: TickOptions) => Promise<TickReport>;

  fire: (reflexId: string, options: { now: number; input?: unknown; by?: string }) => Promise<Fact | undefined>;
  retry: (taskId: string, now: number) => Promise<boolean>;
  preview: (reflexId: string, options: PreviewOptions) => Promise<PreviewReport>;

  arm: (reflexId: string) => boolean;
  disarm: (reflexId: string) => boolean;

  ledger: {
    firings: (filter?: { reflexId?: string; limit?: number }) => Promise<readonly Firing[]>;
    firing: (id: string) => Promise<Firing | undefined>;
    tasks: (filter?: { firingId?: string; reflexId?: string; state?: TaskState; limit?: number }) => Promise<readonly Task[]>;
    task: (id: string) => Promise<Task | undefined>;
    attempts: (taskId: string) => Promise<readonly Attempt[]>;
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
    // unguarded cycles, unknown firing subscriptions. If it loads, it's
    // coherent — the moss tradition, one layer down.
    const graph = buildGraph(parsed, mergedEffects(parsed));
    if (graph.errors.length > 0)
      throw new TideError('unguarded_cycle', `tide refused to load:\n  ${graph.errors.join('\n  ')}`, { errors: graph.errors });

    loaded.clear();
    for (const reflex of parsed) {
      // Arming persists, so a restart does not re-open the past — and a host
      // that passes no `at` gets 0, which matches whatever is already stored.
      const key = `armed:${reflex.id}`;
      const stored = await config.store.getWatermark(key);
      const armedAt = stored === undefined ? (options?.at ?? 0) : Number(stored);
      if (stored === undefined) await config.store.setWatermark(key, String(armedAt));
      loaded.set(reflex.id, { reflex, version: versionOf(reflex), armedAt });
    }

    return { loaded: parsed.length, cycles: graph.cycles, unverifiable: graph.unverifiable, warnings: graph.warnings };
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

  const ingest = async (fact: FactInput): Promise<Fact | undefined> => {
    const result = FactInputSchema.safeParse(fact);
    if (!result.success)
      throw new TideError('invalid_fact', `fact did not parse: ${result.error.issues.map((i) => i.message).join('; ')}`, {
        issues: result.error.issues,
      });
    const stored = await config.store.insertFact({ ...result.data, depth: 0 });
    if (stored !== undefined) deps.emit({ type: 'fact.ingested', fact: stored });
    return stored;
  };

  const tick = (options: TickOptions): Promise<TickReport> => runTick(deps, options);

  // ── human verbs ──────────────────────────────────────────────

  const fire = async (
    reflexId: string,
    options: { now: number; input?: unknown; by?: string },
  ): Promise<Fact | undefined> => {
    if (!loaded.has(reflexId)) throw new TideError('unknown_reflex', `no reflex "${reflexId}" is loaded`);
    // Sugar over ingest: even the human verb enters through the one intake,
    // with `at` supplied by the caller like every fact. Tide reads no clock.
    return ingest({
      kind: 'manual',
      target: reflexId,
      payload: options.input,
      by: options.by ?? 'operator',
      at: options.now,
    });
  };

  const retry = async (taskId: string, now: number): Promise<boolean> =>
    (await config.store.reopenTask(taskId, now)) !== undefined;

  const preview = (reflexId: string, options: PreviewOptions): Promise<PreviewReport> =>
    previewReflex(deps, reflexId, options);

  const setEnabled = (reflexId: string, enabled: boolean): boolean => {
    const entry = loaded.get(reflexId);
    if (entry === undefined) return false;
    // `enabled` is a switch, not an edit: the version hash excludes it, so
    // disarming does not mint a new version or disturb work in flight.
    loaded.set(reflexId, { ...entry, reflex: { ...entry.reflex, enabled } });
    return true;
  };

  // ── ledger ───────────────────────────────────────────────────

  const causeChain = async (factId: string): Promise<readonly Fact[]> => {
    const chain: Fact[] = [];
    let current = await config.store.getFact(factId);
    while (current !== undefined && chain.length < 64) {
      chain.push(current);
      const cause = current.cause;
      if (cause === undefined) break;
      if (cause.startsWith('task:')) {
        const task = await config.store.getTask(cause.slice(5));
        const firing = task === undefined ? undefined : await config.store.getFiring(task.firingId);
        const parentId = firing?.factIds?.[0];
        current = parentId === undefined ? undefined : await config.store.getFact(parentId);
        continue;
      }
      if (cause.startsWith('firing:')) {
        const firing = await config.store.getFiring(cause.slice(7));
        const parentId = firing?.factIds?.[0];
        current = parentId === undefined ? undefined : await config.store.getFact(parentId);
        continue;
      }
      break;
    }
    return chain;
  };

  return {
    load,
    reflexes: () => [...loaded.values()].map((entry) => entry.reflex),
    graph: () => buildGraph([...loaded.values()].map((entry) => entry.reflex), mergedEffects([...loaded.values()].map((e) => e.reflex))),

    ingest,
    tick,

    fire,
    retry,
    preview,

    arm: (reflexId) => setEnabled(reflexId, true),
    disarm: (reflexId) => setEnabled(reflexId, false),

    ledger: {
      firings: (filter) => config.store.listFirings(filter),
      firing: (id) => config.store.getFiring(id),
      tasks: (filter) => config.store.listTasks(filter),
      task: (id) => config.store.getTask(id),
      attempts: (taskId) => config.store.listAttempts(taskId),
      facts: (filter) => config.store.listFacts(filter),
      fact: (id) => config.store.getFact(id),
      causeChain,
      releaseParked: (factId) => config.store.releaseFact(factId),
    },

    sweep: (now, retention) => config.store.sweep(now, retention),
  };
};
