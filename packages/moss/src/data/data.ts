import type { Context, Env, Hono } from 'hono';
import { migrate, upgradeStore } from '@niscorp/strata/postgres';
import { handleDiscovery, seedCache } from '@niscorp/vex';
import type { Sequence, Upgrader } from '@niscorp/strata';
import type { DocumentStore } from '@niscorp/strata/postgres';
import type { CacheBackend, DatabaseAdapter, ExecuteRecord, MutationClient, PgPool, QueryEngine, QueryEngineConfig, QueryResponse, ScopePolicy, SeedEntry, SeedMutation } from '@niscorp/vex';
import { memoKey } from '../identity';
import type { ResolvedIdentity } from '../identity';
import type { NiscApp, Pointer, RunningManifest } from '../manifest';
import { emitterOf } from '../runtime';
import type { Telemetry } from '../runtime';
import { createDataLayer } from './engine';
import { createExecuteAs } from './execute-as';
import type { FeatureTables } from './feature-tables';
import type { ExecuteAs } from './execute-as';
import { createGrammarUpgrader } from './grammar';
import { createIntentAnswers } from './intents';
import type { AnswerIntent, Intent, QueryWriters } from './intents';
import { tableSequencesOf } from './migrate';
import { createOwnEntries } from './own-entries';
import type { OwnEntries, Replay } from './own-entries';
import { createPolicies, resolvePolicyForRoles } from './policy';
import { POINTER, createPointer } from './pointer';
import { createVexRoutes } from './routes';
import { vexRecordToSpan } from './span';
import { createWriteNotifier } from './writes';
import type { WriteListener } from './writes';

// ═══════════════════════════════════════════════════════════════
// WHAT SOMEBODY MAY READ AND WRITE, as one object the server builds once and
// every surface asks.
//
// It is handed exactly what the answer is made of: the database, the tables,
// the charter and the row behaviors a policy is compiled from, and where a
// span goes; and, once it stands, the entries it serves (`seed`). It knows no
// manifest and no runtime, and nothing of who is calling: the caller says
// that, for each request.
// ═══════════════════════════════════════════════════════════════

export type DataConfig = {
  // THE DATABASE: the pool every statement goes through, and the client a
  // write is replayed on.
  pool: PgPool;
  db: MutationClient;
  // Where compiled entries are kept. Absent: vex's Postgres cache on the pool,
  // which is the seeded-cache posture.
  cache?: CacheBackend;
  // The query engine's own settings (`runtime.vexConfig`), handed to vex and
  // not read here.
  vexConfig?: QueryEngineConfig['config'];
  // What the table run does (`runtime.migrations`): 'apply' (the default) runs
  // what is pending; 'verify' refuses to start if anything is.
  migrations?: 'apply' | 'verify';
  // The deployment keeps moss's own credential (`session: 'sessions'`), so its
  // table is one of the run's.
  storesSessions: boolean;
  // The tables the app's features keep (./feature-tables.ts): their
  // sequences run after moss's and the cache's, in the same run, and their
  // names are all a feature's own entries may address.
  featureTables?: readonly FeatureTables[];
  // The app's own tables (`runtime.tables`): last, in the same run.
  tables?: readonly Sequence[];
  // The app's own grammars (`NiscApp.grammars`): after nova's and Prism's.
  grammars?: readonly Sequence[];
  // What every policy is compiled from.
  charter: NiscApp['charter'];
  behaviors?: NiscApp['behaviors'];
  // Where a span of each vex execution goes. Absent: none is built.
  telemetry?: Telemetry;
};

// Who a policy is asked for: somebody already resolved (../identity). The
// `key` is what the kept policies are filed under.
type Caller = Pick<ResolvedIdentity, 'key' | 'roles'>;

export type DataRoutesConfig<E extends Env> = {
  // The app's resources (`NiscApp.resources`): each is a surface of its own.
  resources?: Readonly<Record<string, readonly string[] | { entities: readonly string[] }>>;
  // WHO THIS REQUEST IS, said by the server for each request and never read
  // from the request: the scope values it carries, and whose policy it reads
  // and writes under.
  scope: (c: Context<E>) => Record<string, unknown>;
  caller: (c: Context<E>) => Caller;
};

export type Data = {
  // every `<table>.<verb>` the database can carry: what a charter's `data`
  // section is resolved over
  grants: readonly string[];
  // The upgrader over nova's, Prism's and the app's grammars: it reads a
  // stored document current, and stamps one that is written.
  grammars: Upgrader;
  // THE ENTRIES THE APP SHIPPED, COPIED INTO THE CACHE VEX REPLAYS FROM. Each
  // lands there as a protected row, and one the cache already carries as
  // authored is left untouched; a write that fails vex's authoring lint
  // throws. No row is taken out: an entry an earlier boot seeded stays.
  //
  // Handed the entries by their source (the running manifest), once, after
  // both stand: the manifest cannot be built before `grants` is known, so its
  // entries cannot arrive with the rest. This module reads them off no app.
  //
  // FROM HERE ON THE CACHE IS WHAT A REPLAY READS, and it is asked of nobody
  // else: a request's fingerprint resolves in the cache, and so does
  // `fingerprints` below. So the entries have two holders, the manifest's
  // list and this copy, and the copy is not only the list: a query written
  // for an intent while the app runs is stored there too (./intents.ts). What
  // the cache holds, and who decides it, is the next module's to change
  // (docs/plans/moss-refactor.md, Part 10).
  seed: (entries: readonly (SeedEntry | SeedMutation)[]) => Promise<void>;
  // The policy somebody reads and writes under: compiled once for each set of
  // roles, and kept until the manifest changes.
  policyOf: (who: Caller) => ScopePolicy;
  // What a set of roles may read and write, for a caller that holds roles and
  // has resolved nobody: a check, a tool. Compiled for the asking and the
  // caller's own, so nothing it does to the answer reaches a policy a request
  // is served under.
  policyForRoles: (roles: readonly string[]) => ScopePolicy;
  // Every fingerprint the app serves: the keys of what vex replays from. THE
  // ENGINE ITSELF IS HANDED TO NOBODY: whoever needs something of it asks this
  // module the question.
  fingerprints: () => Promise<readonly string[]>;
  // The fingerprints somebody may be told of, sorted: of the reads and writes
  // the app serves, the ones their own policy lets them replay, as vex's
  // discovery lists them for that policy (a read by the tables it reads, a
  // write by what it writes). Whether a replay is then served is still decided
  // when it is asked.
  fingerprintsFor: (who: Caller) => Promise<string[]>;
  // Run a seeded entry as a charter role (./execute-as.ts).
  executeAs: ExecuteAs;
  // Answer an intent with a query written for it, as somebody already
  // resolved: under their policy, with the scope values the server says they
  // carry (./intents.ts). The one place a query is written; the routes replay.
  answerIntent: (writers: QueryWriters, asked: Intent, who: Caller, scope: Record<string, unknown>) => Promise<QueryResponse>;
  // Take the own entries of the feature of that name, and answer how one is
  // replayed (./own-entries.ts). No route serves them, and they reach the
  // tables that feature named as its own and no other: one that addresses
  // another table is refused here.
  ownEntries: (feature: string, entries: OwnEntries['entries']) => Promise<Replay>;
  // The vex surfaces, for the server to mount at its root (./routes.ts).
  routes: <E extends Env>(config: DataRoutesConfig<E>) => Hono<E>;
  // BRING THE DOCUMENTS STORED IN A FEATURE'S TABLE TO THIS CODE'S GRAMMARS
  // (strata's `upgradeStore`, over `grammars`): every row that is behind is
  // rewritten and stamped current, in one transaction, and a row written by
  // newer code refuses the whole run. Asked by the feature of that name, for a
  // table that is its own; for any other table it is refused, and nothing is
  // read. This module upgrades no feature's rows by itself.
  upgradeStore: (feature: string, store: DocumentStore) => Promise<void>;
  // Hear every write those surfaces serve (./writes.ts). Returns the way to
  // stop hearing.
  onWrite: (listener: WriteListener) => () => void;
  // THE GENERATION POINTER'S ROW (./pointer.ts): where the counter is, and one
  // step on from where it was read. The manifest module holds the clock that
  // polls it; the row is read and written here, through vex.
  pointer: Pointer;
  // WHEN THE MANIFEST CHANGES, what was compiled from it goes. This is handed
  // the manifest's own way of saying that it changed, once, after both stand:
  // the manifest cannot be built before `grants` is known, so it cannot
  // arrive with the rest. From then on nobody clears a policy by hand.
  dropOnChange: (changed: RunningManifest['onChange']) => void;
};

// Whoever runs as roles and is nobody: filed where somebody holding exactly
// those roles, with no install list, is.
const machinery = (roles: readonly string[]): Caller => ({ key: memoKey(roles, undefined), roles });

// What stands once the database has been brought up: the engine, what can be
// granted, the grammars, the adapter the engine reads through, and how the
// documents of one store are brought to those grammars (strata's own, over the
// pool).
export type PreparedEngine = Pick<Data, 'grants' | 'grammars'> & { engine: QueryEngine; adapter: DatabaseAdapter; upgradeStore: (store: DocumentStore) => Promise<void> };

// THE TABLES EXIST BEFORE INTROSPECTION. The engine's introspected schema is
// the grant universe policies compile from — a table created after it is a
// table no grant can reach, silently: an app granting `integrations.read`
// compiled a policy that denied the very screen the grant existed for, and
// nothing said so until somebody opened it.
//
// ONE LEDGERED RUN (strata) for every owner's tables: moss's own, the
// sessions table when the deployment chose moss's credential, the vex
// cache's and the app's — in one transaction, recorded, refused if the ledger
// was edited or written by newer code. The engine's `cache.init()` then finds
// its sequence already applied.
//
// THEN THE GRAMMARS this code reads documents in (./grammar.ts). NO ROW IS
// BROUGHT TO THEM HERE. The documents stored in a table are its owner's to
// bring current, and the only tables that hold any are a feature's: it asks
// when it starts (`Data.upgradeStore`). This used to rewrite the integrations'
// stored actions at every boot, whether or not the app named that feature.
const prepareEngine = async (config: DataConfig): Promise<PreparedEngine> => {
  await migrate(config.pool, tableSequencesOf(config), { mode: config.migrations ?? 'apply' });
  const grammars = await createGrammarUpgrader({ grammars: config.grammars });
  const layer = await createDataLayer(config);
  return {
    grammars,
    engine: layer.engine,
    grants: layer.grants,
    adapter: layer.adapter,
    upgradeStore: async (store) => {
      await upgradeStore(config.pool, store, grammars);
    },
  };
};

// THE ANSWERS TO AN INTENT, stood up at the first asking: an app that writes
// no query pays for none.
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

// The tables a feature named as its own. One that is asked for and was never
// read off the manifest is a fault of the wiring, and is said.
const tablesByFeature =
  (config: Pick<DataConfig, 'featureTables'>) =>
  (feature: string): readonly string[] => {
    const kept = (config.featureTables ?? []).find((tables) => tables.feature === feature);
    if (kept === undefined) throw new Error(`moss: the data module was asked for the tables of a feature it was never told of ("${feature}").`);
    return kept.names;
  };

// THE DOCUMENTS A FEATURE STORED, BROUGHT TO THE GRAMMARS: of a table that is
// its own, and of no other.
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

// EVERYTHING ELSE, over the engine that was prepared. Nothing here touches the database but
// through the engine and the write client, which is why it is a function of
// its own: it can be held against an engine with nothing behind it.
export const createDataWith = (prepared: PreparedEngine, config: Pick<DataConfig, 'db' | 'charter' | 'behaviors' | 'telemetry' | 'vexConfig' | 'featureTables'>): Data => {
  const { grammars, engine, grants } = prepared;
  const governed = { charter: config.charter, behaviors: config.behaviors };
  const policies = createPolicies({ ...governed, grants });

  // One span per vex execution, on the routes and for machinery alike. With
  // no sink there is no observer, and vex builds no record.
  const emit = emitterOf(config.telemetry);
  const onExecute = emit === undefined ? undefined : (record: ExecuteRecord) => emit(vexRecordToSpan(record));

  const writes = createWriteNotifier();

  const answering = lazyIntentAnswers(prepared, config);

  // ENTRIES THAT ARE NOT THE APP'S, over the engine that stood up: seeded where
  // no route serves them, and replayed in process (./own-entries.ts).
  const ownEntries = (own: OwnEntries, told: ((record: ExecuteRecord) => void) | undefined): Promise<Replay> =>
    createOwnEntries({ adapter: prepared.adapter, db: config.db, engine, ...(told !== undefined ? { onExecute: told } : {}) })(own);

  const tablesOf = tablesByFeature(config);

  // The pointer's two entries, seeded when the pointer is first asked. NO SPAN
  // for them: a poll is not something a request did, and one every interval
  // from every process would be a line in every sink that says nothing. The
  // statements they stand in for made none.
  let pointerEntries: Promise<Replay> | undefined;
  const pointerReplay = (): Promise<Replay> => {
    pointerEntries ??= ownEntries(POINTER, undefined);
    return pointerEntries;
  };

  return {
    grants,
    grammars,
    seed: (entries) => seedCache(engine.cache, entries),
    fingerprints: async () => (await engine.cache.keys?.()) ?? [],
    policyOf: policies.of,
    policyForRoles: (roles) => resolvePolicyForRoles(governed, grants, roles),
    // Vex's own discovery, asked under the caller's policy: it lists an entry
    // only when the policy can touch every table the entry reads, or writes.
    // This compiled the policy and then kept every fingerprint whatever it
    // said, so somebody granted nothing was told the whole surface.
    fingerprintsFor: async (who) => (await handleDiscovery({ engine, locked: true, scopePolicy: policies.of(who) })).fingerprints.map((entry) => entry.fingerprint).sort(),
    // A ROLE MACHINERY RUNS AS IS A SET OF ROLES LIKE ANY OTHER: its policy is
    // the kept one for that set, compiled at first sight and dropped when the
    // manifest changes, and the same one a request by somebody holding exactly
    // that role is served under. It was compiled afresh, twice, for each call.
    executeAs: createExecuteAs({
      engine,
      db: config.db,
      policyFor: (roles) => policies.of(machinery(roles)),
      policyAtReach: (roles, reach) => policies.atReach(machinery(roles), reach),
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
