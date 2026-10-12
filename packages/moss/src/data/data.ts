import type { Context, Env, Hono } from 'hono';
import { migrate, upgradeStore } from '@niscorp/strata/postgres';
import { handleDiscovery } from '@niscorp/vex';
import type { Sequence, Upgrader } from '@niscorp/strata';
import type { DocumentStore } from '@niscorp/strata/postgres';
import type { CacheBackend, DatabaseAdapter, ExecuteRecord, MutationClient, PgPool, QueryEngine, QueryEngineConfig, QueryResponse, ScopePolicy } from '@niscorp/vex';
import { memoKey } from '../identity';
import type { ResolvedIdentity } from '../identity';
import type { NiscApp } from '../manifest';
import { emitterOf } from '../runtime';
import type { Telemetry } from '../runtime';
import { createDataLayer, createGrammarUpgrader, vexRecordToSpan } from './engine';
import type { EntryCache } from './engine';
import { tableSequencesOf } from './migrate';
import type { FeatureTables } from './migrate';
import { POINTER, createOwnEntries, createPointer } from './own-entries';
import type { OwnEntries, Pointer, Replay } from './own-entries';
import { createExecuteAs, createPolicies, resolvePolicyForRoles } from './policy';
import type { ExecuteAs } from './policy';
import { createIntentAnswers, createVexRoutes } from './routes';
import type { AnswerIntent, Intent, QueryWriters } from './routes';
import { createWriteNotifier } from './writes';
import type { WriteListener } from './writes';

export type DataConfig = {
  pool: PgPool;
  db: MutationClient;
  cache?: CacheBackend;
  vexConfig?: QueryEngineConfig['config'];
  migrations?: 'apply' | 'verify';
  storesSessions: boolean;
  featureTables?: readonly FeatureTables[];
  tables?: readonly Sequence[];
  grammars?: readonly Sequence[];
  charter: NiscApp['charter'];
  behaviors?: NiscApp['behaviors'];
  telemetry?: Telemetry;
};

type Caller = Pick<ResolvedIdentity, 'memoKey' | 'roles'>;

export type DataRoutesConfig<E extends Env> = {
  resources?: Readonly<Record<string, readonly string[] | { entities: readonly string[] }>>;
  scope: (c: Context<E>) => Record<string, unknown>;
  caller: (c: Context<E>) => Caller;
};

export type Data = {
  grants: readonly string[];
  grammars: Upgrader;
  entriesHeldBy: EntryCache['askFirst'];
  policyOf: (who: Caller) => ScopePolicy;
  policyForRoles: (roles: readonly string[]) => ScopePolicy;
  fingerprints: () => Promise<readonly string[]>;
  fingerprintsFor: (who: Caller) => Promise<string[]>;
  executeAs: ExecuteAs;
  answerIntent: (writers: QueryWriters, asked: Intent, who: Caller, scope: Record<string, unknown>) => Promise<QueryResponse>;
  ownEntries: (feature: string, entries: OwnEntries['entries']) => Promise<Replay>;
  routes: <E extends Env>(config: DataRoutesConfig<E>) => Hono<E>;
  upgradeStore: (feature: string, store: DocumentStore) => Promise<void>;
  onWrite: (listener: WriteListener) => () => void;
  pointer: Pointer;
  dropOnChange: (changed: (listener: () => void) => () => void) => void;
};

const callerOfRoles = (roles: readonly string[]): Caller => ({ memoKey: memoKey(roles, undefined), roles });

export type PreparedEngine = Pick<Data, 'grants' | 'grammars'> & {
  engine: QueryEngine;
  adapter: DatabaseAdapter;
  askFirst: EntryCache['askFirst'];
  upgradeStore: (store: DocumentStore) => Promise<void>;
};

const prepareEngine = async (config: DataConfig): Promise<PreparedEngine> => {
  // The tables exist before the engine introspects: a table created after
  // that is one no grant can reach, and nothing says so.
  await migrate(config.pool, tableSequencesOf(config), { mode: config.migrations ?? 'apply' });
  const grammars = await createGrammarUpgrader({ grammars: config.grammars });
  const layer = await createDataLayer(config);
  return {
    grammars,
    engine: layer.engine,
    grants: layer.grants,
    adapter: layer.adapter,
    askFirst: layer.askFirst,
    upgradeStore: async (store) => {
      await upgradeStore(config.pool, store, grammars);
    },
  };
};

const lazyIntentAnswers = (prepared: PreparedEngine, config: Pick<DataConfig, 'behaviors' | 'vexConfig'>): (() => AnswerIntent) => {
  const { engine } = prepared;
  let answers: AnswerIntent | undefined;
  const answering = (): AnswerIntent => {
    if (answers !== undefined) return answers;
    const schema = engine.getSchema();
    if (schema === undefined) throw new Error('moss: an intent was asked before the engine had read the database.');
    answers = createIntentAnswers({
      adapter: prepared.adapter,
      schema,
      cache: engine.cache,
      ...(config.behaviors !== undefined ? { behaviors: config.behaviors } : {}),
      ...(config.vexConfig !== undefined ? { vexConfig: config.vexConfig } : {}),
    });
    return answers;
  };
  return answering;
};

const tablesByFeature =
  (config: Pick<DataConfig, 'featureTables'>) =>
  (feature: string): readonly string[] => {
    const kept = (config.featureTables ?? []).find((tables) => tables.feature === feature);
    if (kept === undefined) throw new Error(`moss: the data module was asked for the tables of a feature it was never told of ("${feature}").`);
    return kept.names;
  };

const createUpgradeStore =
  (prepared: PreparedEngine, tablesOf: (feature: string) => readonly string[]): Data['upgradeStore'] =>
  async (feature, store) => {
    const own = tablesOf(feature);
    if (store.schema !== undefined) {
      throw new Error(
        `moss: the feature "${feature}" asked for the documents of a store in the schema "${store.schema}" to be upgraded. ` + 'To a feature a store is named by its table alone: one of its own.',
      );
    }
    if (!own.includes(store.table)) {
      throw new Error(`moss: the feature "${feature}" asked for the documents stored in "${store.table}" to be upgraded, and that table is not its own (its own: ${own.join(', ') || 'none'}).`);
    }
    await prepared.upgradeStore(store);
  };

export const createDataWith = (prepared: PreparedEngine, config: Pick<DataConfig, 'db' | 'charter' | 'behaviors' | 'telemetry' | 'vexConfig' | 'featureTables'>): Data => {
  const { grammars, engine, grants } = prepared;
  const governed = { charter: config.charter, behaviors: config.behaviors };
  const policies = createPolicies({ ...governed, grants });

  const emit = emitterOf(config.telemetry);
  const onExecute = emit === undefined ? undefined : (record: ExecuteRecord) => emit(vexRecordToSpan(record));

  const writes = createWriteNotifier();

  const answering = lazyIntentAnswers(prepared, config);

  const ownEntries = (own: OwnEntries, told: ((record: ExecuteRecord) => void) | undefined): Promise<Replay> =>
    createOwnEntries({ adapter: prepared.adapter, db: config.db, engine, ...(told !== undefined ? { onExecute: told } : {}) })(own);

  const tablesOf = tablesByFeature(config);

  // No span for the pointer's entries: a poll is not something a request did.
  let pointerEntries: Promise<Replay> | undefined;
  const pointerReplay = (): Promise<Replay> => {
    pointerEntries ??= ownEntries(POINTER, undefined);
    return pointerEntries;
  };

  return {
    grants,
    grammars,
    entriesHeldBy: prepared.askFirst,
    fingerprints: async () => (await engine.cache.keys?.()) ?? [],
    policyOf: policies.of,
    // Compiled afresh and not taken from the kept ones: the caller owns its
    // copy, and nothing it does to it reaches a policy a request is served under.
    policyForRoles: (roles) => resolvePolicyForRoles(governed, grants, roles),
    fingerprintsFor: async (who) => (await handleDiscovery({ engine, locked: true, scopePolicy: policies.of(who) })).fingerprints.map((entry) => entry.fingerprint).sort(),
    executeAs: createExecuteAs({
      engine,
      db: config.db,
      policyFor: (roles) => policies.of(callerOfRoles(roles)),
      policyAtReach: (roles, reach) => policies.atReach(callerOfRoles(roles), reach),
      ...(onExecute !== undefined ? { onExecute } : {}),
    }),
    answerIntent: async (writers, asked, who, scope) => answering()(writers, asked, { policy: policies.of(who), scope }),
    ownEntries: async (feature, entries) => ownEntries({ owner: `the feature "${feature}"`, entries, tables: tablesOf(feature) }, onExecute),
    routes: <E extends Env>(routing: DataRoutesConfig<E>): Hono<E> =>
      createVexRoutes<E>({
        engine,
        db: config.db,
        resources: routing.resources,
        scope: routing.scope,
        policy: (c) => policies.of(routing.caller(c)),
        policyAtReach: (c, reach) => policies.atReach(routing.caller(c), reach),
        ...(onExecute !== undefined ? { onExecute } : {}),
        writes,
      }),
    upgradeStore: createUpgradeStore(prepared, tablesOf),
    onWrite: writes.subscribe,
    pointer: createPointer(pointerReplay),
    dropOnChange: (changed) => {
      changed(policies.drop);
    },
  };
};

export const createData = async (config: DataConfig): Promise<Data> => createDataWith(await prepareEngine(config), config);
