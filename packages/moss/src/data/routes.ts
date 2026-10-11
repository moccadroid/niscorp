import { Hono } from 'hono';
import type { Context, Env } from 'hono';
import { vex } from '@niscorp/vex/hono';
import { createQueryEngine } from '@niscorp/vex';
import type {
  CacheBackend,
  DatabaseAdapter,
  DatabaseSchema,
  ExecuteRecord,
  GenerateDsl,
  MapToShape,
  MutationClient,
  QueryEngine,
  QueryEngineConfig,
  QueryResponse,
  ScopeBehaviors,
  ScopePolicy,
} from '@niscorp/vex';
import { writeRequestOf } from './writes';
import type { WriteNotifier } from './writes';

// ═══════════════════════════════════════════════════════════════
// THE VEX SURFACES — where a request reads and writes.
//
//   /api/vex              the cross-resource base surface
//   /api/<resource>/vex   one for each resource the app declares, over its
//                         entities only
//
// The adapter does the work. Locked always: only a seeded entry is replayed,
// never a query a caller authored. WHO the request is comes from the caller of
// this module, for each request and never from the request: the scope values
// that fill a `to:` in a behavior, and the compiled policy.
// ═══════════════════════════════════════════════════════════════

export type VexRoutesDeps<E extends Env> = {
  engine: QueryEngine;
  // The client a write is replayed on.
  db: MutationClient;
  // The app's resources (`NiscApp.resources`): a name, and the entities its
  // surface serves.
  resources?: Readonly<Record<string, readonly string[] | { entities: readonly string[] }>>;
  // The scope values this request carries. Asked per request, so a value
  // derived from today's date cannot be held for the life of a session that
  // began yesterday.
  scope: (c: Context<E>) => Record<string, unknown>;
  // The policy this request reads and writes under, and the same caller at a
  // reach an entry demands: an entry that names a reach is served at it, not
  // at the caller's own.
  policy: (c: Context<E>) => ScopePolicy;
  policyAtReach: (c: Context<E>, reach: string) => ScopePolicy;
  // One record per read and write on these surfaces: the busiest emission
  // point, and the reason vex has an observer at all.
  onExecute?: (record: ExecuteRecord) => void;
  // Where a committed write is reported, and how a request is run with what
  // it said kept for whoever hears a write it makes (./writes.ts).
  writes: Pick<WriteNotifier, 'within' | 'report'>;
};

// A sub-app, for the server to mount at its root behind the authentication
// every route gets. It holds the paths: a shell's wire and the client both
// tell a vex surface by where it is.
export const createVexRoutes = <E extends Env>(deps: VexRoutesDeps<E>): Hono<E> => {
  const routes = new Hono<E>();

  // WHAT THE REQUEST SAID RIDES WITH IT, for whoever hears a write it makes:
  // its headers, asked by name, without the credential it carried. No header
  // is read here and none is known by name.
  routes.use('/api/*', (c, next) =>
    deps.writes.within(
      writeRequestOf((name) => c.req.header(name)),
      () => next(),
    ),
  );

  const mount = (path: string, entities?: readonly string[]): void => {
    routes.route(
      path,
      vex<E>({
        engine: deps.engine,
        ...(entities !== undefined ? { entities: [...entities] } : {}),
        locked: true,
        getScope: deps.scope,
        getPolicy: deps.policy,
        getPolicyForReach: deps.policyAtReach,
        ...(deps.onExecute !== undefined ? { onExecute: deps.onExecute } : {}),
        // Vex's write observer, fired once per committed mutation with
        // per-statement writes: handed on to the lane, whoever listens there.
        mutations: { client: deps.db, onWrite: deps.writes.report },
      }),
    );
  };
  mount('/api/vex');
  for (const [name, resource] of Object.entries(deps.resources ?? {})) {
    mount(`/api/${name}/vex`, 'entities' in resource ? resource.entities : resource);
  }
  return routes;
};

// AN INTENT, ANSWERED BY A QUERY WRITTEN FOR IT.
//
// The routes replay what is stored and write nothing: a request that would
// need a query written is refused there, by design. An app that lets a model
// write one supplies the two seams that do it (vex's `generateDsl` and
// `mapToShape`) and asks here, for somebody: the query is written, compiled
// and run under that caller's policy and scope values, and stored in the
// cache the routes replay from. So what was written for one intent is
// replayed afterwards by its fingerprint, through the routes, by whoever the
// policy lets.
//
// It is an engine beside the app's own, over the same adapter, the same
// tables and the same cache, with the app's writers in it. Neither the
// adapter nor the cache is handed out of the data module.

// The two seams that write: an intent and a shape into a query, and rows into
// the shape that was asked for.
export type QueryWriters = { generateDsl: GenerateDsl; mapToShape: MapToShape };

// What is asked: in words, and the shape the answer takes. `context` holds the
// values that vary from one asking to the next.
export type Intent = { intent: string; shape: unknown; context?: Record<string, unknown> };

export type IntentAnswersDeps = {
  // What the app's own engine reads through, and the tables it found there:
  // a query is written over the tables a replay can read.
  adapter: DatabaseAdapter;
  schema: DatabaseSchema;
  // The cache the routes replay from: a query written here is stored there.
  cache: CacheBackend;
  // The app's row behaviors: which columns a scope value is bound to, so a
  // writer can say "the caller" in the tables' own terms.
  behaviors?: ScopeBehaviors;
  // The engine's own settings, as the app's engine has them.
  vexConfig?: QueryEngineConfig['config'];
};

// Throws what vex throws: a writer that finds no query for the intent, or a
// query that reaches past the caller's policy.
export type AnswerIntent = (writers: QueryWriters, asked: Intent, caller: { policy: ScopePolicy; scope: Record<string, unknown> }) => Promise<QueryResponse>;

export const createIntentAnswers = (deps: IntentAnswersDeps): AnswerIntent => {
  // ONE ENGINE FOR EACH PAIR OF WRITERS, kept for as long as the app keeps the
  // object it handed over. An app has one pair, made when it starts.
  const engines = new WeakMap<QueryWriters, Promise<QueryEngine>>();
  const engineFor = (writers: QueryWriters): Promise<QueryEngine> => {
    const kept = engines.get(writers);
    if (kept !== undefined) return kept;
    const { adapter, schema } = deps;
    const created = (async (): Promise<QueryEngine> => {
      const engine = createQueryEngine({
        // It introspects nothing: the tables are the ones the app's engine found.
        adapter: { id: adapter.id, compile: adapter.compile, execute: adapter.execute, capabilities: adapter.capabilities, introspect: async () => schema },
        cache: deps.cache,
        generateDsl: writers.generateDsl,
        mapToShape: writers.mapToShape,
        ...(deps.behaviors !== undefined ? { behaviors: deps.behaviors } : {}),
        ...(deps.vexConfig !== undefined ? { config: deps.vexConfig } : {}),
      });
      await engine.introspect();
      return engine;
    })();
    engines.set(writers, created);
    return created;
  };

  // No policy of its own: every asking is handed the caller's.
  return async (writers, asked, caller) =>
    (await engineFor(writers)).execute({ intent: asked.intent, shape: asked.shape, context: asked.context ?? {} }, { scope: caller.scope, scopePolicy: caller.policy });
};
