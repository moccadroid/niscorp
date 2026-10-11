import { createQueryEngine } from '@niscorp/vex';
import type { CacheBackend, DatabaseAdapter, DatabaseSchema, GenerateDsl, MapToShape, QueryEngine, QueryEngineConfig, QueryResponse, ScopeBehaviors, ScopePolicy } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
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
// ═══════════════════════════════════════════════════════════════

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
