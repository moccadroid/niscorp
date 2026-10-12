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

export type VexRoutesDeps<E extends Env> = {
  engine: QueryEngine;
  db: MutationClient;
  resources?: Readonly<Record<string, readonly string[] | { entities: readonly string[] }>>;
  scope: (c: Context<E>) => Record<string, unknown>;
  policy: (c: Context<E>) => ScopePolicy;
  policyAtReach: (c: Context<E>, reach: string) => ScopePolicy;
  onExecute?: (record: ExecuteRecord) => void;
  writes: Pick<WriteNotifier, 'within' | 'report'>;
};

export const createVexRoutes = <E extends Env>(deps: VexRoutesDeps<E>): Hono<E> => {
  const routes = new Hono<E>();

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

export type QueryWriters = { generateDsl: GenerateDsl; mapToShape: MapToShape };

export type Intent = { intent: string; shape: unknown; context?: Record<string, unknown> };

export type IntentAnswersDeps = {
  adapter: DatabaseAdapter;
  schema: DatabaseSchema;
  cache: CacheBackend;
  behaviors?: ScopeBehaviors;
  vexConfig?: QueryEngineConfig['config'];
};

export type AnswerIntent = (writers: QueryWriters, asked: Intent, caller: { policy: ScopePolicy; scope: Record<string, unknown> }) => Promise<QueryResponse>;

export const createIntentAnswers = (deps: IntentAnswersDeps): AnswerIntent => {
  const engines = new WeakMap<QueryWriters, Promise<QueryEngine>>();
  const engineFor = (writers: QueryWriters): Promise<QueryEngine> => {
    const kept = engines.get(writers);
    if (kept !== undefined) return kept;
    const { adapter, schema } = deps;
    const created = (async (): Promise<QueryEngine> => {
      const engine = createQueryEngine({
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

  return async (writers, asked, caller) =>
    (await engineFor(writers)).execute({ intent: asked.intent, shape: asked.shape, context: asked.context ?? {} }, { scope: caller.scope, scopePolicy: caller.policy });
};
