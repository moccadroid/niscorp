import type { Context, Env, Hono } from 'hono';
import { migrate, upgradeStore } from '@niscorp/strata/postgres';
import type { Sequence, Upgrader } from '@niscorp/strata';
import type { CacheBackend, DatabaseAdapter, ExecuteRecord, MutationClient, PgPool, QueryEngine, QueryEngineConfig, ScopePolicy, SeedEntry, SeedMutation } from '@niscorp/vex';
import type { ResolvedIdentity } from '../identity';
import type { NiscApp, RunningManifest } from '../manifest';
import { emitterOf } from '../runtime';
import type { Telemetry } from '../runtime';
import { createDataLayer } from './engine';
import { createExecuteAs } from './execute-as';
import type { ExecuteAs } from './execute-as';
import { createGrammarUpgrader } from './grammar';
import { tableSequencesOf } from './migrate';
import { createOwnEntries } from './own-entries';
import type { OwnEntries, Replay } from './own-entries';
import { createPolicies, resolvePolicyAtReachForRoles, resolvePolicyForRoles } from './policy';
import { createVexRoutes } from './routes';
import { vexRecordToSpan } from './span';
import { INTEGRATION_ACTIONS_STORE } from './tables';
import { createWriteLane } from './writes';
import type { WriteListener } from './writes';

// ═══════════════════════════════════════════════════════════════
// WHAT SOMEBODY MAY READ AND WRITE, as one object the server builds once and
// every surface asks.
//
// It is handed exactly what the answer is made of: the database, the tables
// and the entries, the charter and the row behaviors a policy is compiled
// from, and where a span goes. It knows no manifest and no runtime, and
// nothing of who is calling: the caller says that, for each request.
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
  // The tables the app's features keep (./migrate.ts, `featureTablesOf`):
  // after moss's and the cache's, in the same run.
  featureTables?: readonly Sequence[];
  // The app's own tables (`runtime.tables`): last, in the same run.
  tables?: readonly Sequence[];
  // The app's own grammars (`NiscApp.grammars`): after nova's and Prism's.
  grammars?: readonly Sequence[];
  // The entries the app serves. They are seeded, and they are the whole
  // surface: nothing else is replayed.
  entries?: readonly (SeedEntry | SeedMutation)[];
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
  engine: QueryEngine;
  // every `<table>.<verb>` the database can carry: what a charter's `data`
  // section is resolved over
  grants: readonly string[];
  // The upgrader over nova's, Prism's and the app's grammars: it reads a
  // stored document current, and stamps one that is written.
  grammars: Upgrader;
  // The policy somebody reads and writes under: compiled once for each set of
  // roles, and kept until the manifest changes.
  policyOf: (who: Caller) => ScopePolicy;
  // What a set of roles may read and write, for a caller that holds roles and
  // has resolved nobody: a check, a tool. Compiled for the asking and the
  // caller's own, so nothing it does to the answer reaches a policy a request
  // is served under.
  policyForRoles: (roles: readonly string[]) => ScopePolicy;
  // Run a seeded entry as a charter role (./execute-as.ts).
  executeAs: ExecuteAs;
  // Take a feature's own entries, and answer how one is replayed
  // (./own-entries.ts). No route serves them.
  ownEntries: (own: OwnEntries) => Promise<Replay>;
  // The vex surfaces, for the server to mount at its root (./routes.ts).
  routes: <E extends Env>(config: DataRoutesConfig<E>) => Hono<E>;
  // Hear every write those surfaces serve (./writes.ts). Returns the way to
  // stop hearing.
  onWrite: (listener: WriteListener) => () => void;
  // WHEN THE MANIFEST CHANGES, what was compiled from it goes. This is handed
  // the manifest's own way of saying that it changed, once, after both stand:
  // the manifest cannot be built before `grants` is known, so it cannot
  // arrive with the rest. From then on nobody clears a policy by hand.
  dropOnChange: (changed: RunningManifest['onChange']) => void;
};

// What stands once the database has been brought up: the engine, what can be
// granted, the grammars, and the adapter the engine reads through.
export type StoodUp = Pick<Data, 'engine' | 'grants' | 'grammars'> & { adapter: DatabaseAdapter };

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
// THEN THE DOCUMENTS IN THOSE TABLES, brought to this code's grammars
// (./grammar.ts). Rows carry the stamp they were written at; what they have
// not seen runs now, once, and they are written back current. A row written
// by newer code refuses the boot, as a ledger written by newer code does.
const standUp = async (config: DataConfig): Promise<StoodUp> => {
  await migrate(config.pool, tableSequencesOf(config), { mode: config.migrations ?? 'apply' });
  const grammars = await createGrammarUpgrader({ grammars: config.grammars });
  await upgradeStore(config.pool, INTEGRATION_ACTIONS_STORE, grammars);
  const layer = await createDataLayer(config);
  return { grammars, engine: layer.engine, grants: layer.grants, adapter: layer.adapter };
};

// EVERYTHING ELSE, over what stood up. Nothing here touches the database but
// through the engine and the write client, which is why it is a function of
// its own: it can be held against an engine with nothing behind it.
export const dataOver = (stood: StoodUp, config: Pick<DataConfig, 'db' | 'charter' | 'behaviors' | 'telemetry'>): Data => {
  const { grammars, engine, grants } = stood;
  const governed = { charter: config.charter, behaviors: config.behaviors };
  const policies = createPolicies({ ...governed, grants });

  // One span per vex execution, on the routes and for machinery alike. With
  // no sink there is no observer, and vex builds no record.
  const emit = emitterOf(config.telemetry);
  const onExecute = emit === undefined ? undefined : (record: ExecuteRecord) => emit(vexRecordToSpan(record));

  const writes = createWriteLane();

  return {
    engine,
    grants,
    grammars,
    policyOf: policies.of,
    policyForRoles: (roles) => resolvePolicyForRoles(governed, grants, roles),
    // Compiled for each call: nothing keeps a machinery role's policy.
    executeAs: createExecuteAs({
      engine,
      db: config.db,
      policyFor: (roles) => resolvePolicyForRoles(governed, grants, roles),
      policyAtReach: (roles, reach) => resolvePolicyAtReachForRoles(governed, grants, roles, reach),
      ...(onExecute !== undefined ? { onExecute } : {}),
    }),
    ownEntries: async (own) => {
      const schema = engine.getSchema();
      if (schema === undefined) throw new Error("moss: a feature's entries were handed over before the engine had read the database.");
      return createOwnEntries({ adapter: stood.adapter, schema, db: config.db, engine, ...(onExecute !== undefined ? { onExecute } : {}) })(own);
    },
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
    onWrite: writes.subscribe,
    dropOnChange: (changed) => {
      changed(policies.drop);
    },
  };
};

export const createData = async (config: DataConfig): Promise<Data> => dataOver(await standUp(config), config);
