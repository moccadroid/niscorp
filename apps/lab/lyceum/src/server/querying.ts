import { createMemoryCache, createPostgresAdapter, createQueryEngine } from '@niscorp/vex';
import type { GenerateDsl, GenerationCaller, MapToShape, Query, QueryEngine } from '@niscorp/vex';
import { createShapeMapper, describeCaller } from '@niscorp/vex/agent';
import type { SignalClient } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import type { ChoiceQuestion } from '@niscorp/signal';
import type { NiscRuntime } from '@niscorp/moss';
import { QUERY_SHAPES } from '@lyceum/app/vex/query.shapes';
import { BEHAVIORS } from '@lyceum/app/vex/behaviors';
import { createDecider } from './decider';
import { testStep, watchedQueryDsl } from './generation';
import type { Tracer } from './generation';
import type { QueryShape } from '@lyceum/app/vex/query.shapes';

// WHO TURNS A REQUEST IN WORDS INTO A VEX QUERY — the two model seams.
//
//   ROUTING   — a CHOICE, never writing: has an earlier request already asked
//               for the same thing (then its query is replayed), and which of
//               the authored shapes (../app/vex/query.shapes.ts) does the
//               answer take. Jev (TypeSafe, `decide()`) with TYPESAFE_API_KEY;
//               without it, gpt-oss-120b answers the same choices by
//               emulation (uncalibrated picks).
//   GENERATION — a new request's query, written by vex's query agent and
//               mapped by prism's mapping agent, on gpt-oss-120b at `low`
//               (PLAN.md, "Measured"). It runs under the ASKER's policy: the
//               model is handed only the tables they may read, and whatever it
//               writes is compiled under the same policy. The run is WATCHED
//               (./generation): every tool call and test goes into a trace the
//               stage draws.
//
//   LYCEUM_QUERY=live   the above; needs GROQ_API_KEY
//   LYCEUM_QUERY=fake   deterministic stand-ins for both — what the checks use,
//                     and a talk with no network. The fake generator writes
//                     real DSL and tests it through the engine like the real
//                     one, so the engine, the cache, the policy, the replay
//                     path and the trace are the real ones.
//
// Unset, it is `live` when there is a Groq key and `fake` when there is not.

export type Known = { request: string; fingerprint: string; shape: string };
export type Route = { replay: Known } | { generate: QueryShape };

export type Querier = {
  kind: 'live' | 'fake';
  // What the stage watches (./generation).
  trace: Tracer;
  route: (request: string, known: readonly Known[]) => Promise<Route>;
  generateDsl: GenerateDsl;
  mapToShape: MapToShape;
};

const DEFAULT_SHAPE: QueryShape = QUERY_SHAPES[0] ?? { kind: 'list', description: '', shape: [] };
const shapeOf = (kind: string): QueryShape => QUERY_SHAPES.find((shape) => shape.kind === kind) ?? DEFAULT_SHAPE;

// The router is handed at most this many earlier requests — a choice has at
// most 255 options, and the newest are the likeliest to be run again.
const KNOWN_LIMIT = 200;

// ── live ──

const liveQuerier = (env: Record<string, string | undefined>, tracer: Tracer): Querier => {
  const llm = createSignal('groq', { options: { reasoningEffort: 'low' } }).model('openai/gpt-oss-120b');
  // The one decider (./decider.ts): the router is one of its questions.
  const decider = createDecider(env);
  const dslSchema = createQueryEngine({ adapter: createPostgresAdapter({ pool: { query: () => Promise.reject(new Error('unused')) } }) }).getDslSchema();

  return {
    kind: 'live',
    trace: tracer,
    // Jev's words below say "question": they are the measured contract (48/48,
    // MEASURED.md) — renaming them is a re-measurement, not a tidy-up.
    route: async (question, known) => {
      const candidates = known.slice(0, KNOWN_LIMIT);
      const byKey = new Map(candidates.map((entry, index) => [`q${index}`, entry]));
      // The earlier questions are FACTS, so they go in the state; the options
      // only name them. Written into the options' own text instead, Jev read
      // them poorly — 0.94 "new" for the identical question with one
      // candidate — and in the state it is certain (measured 2026-09-27).
      const same: ChoiceQuestion = {
        type: 'choice',
        instructions: 'Does one of the earlier questions ask for exactly the same information as this question — the same rows, the same numbers? Different wording is fine; a different subject, filter or grouping is not.',
        criteria: { new: 'None of the earlier questions asks for the same information.', ...Object.fromEntries(candidates.map((_, index) => [`q${index}`, `Earlier question q${index} asks for the same information.`])) },
      };
      const shape: ChoiceQuestion = {
        type: 'choice',
        instructions: 'What shape does the answer to this question take?',
        criteria: Object.fromEntries(QUERY_SHAPES.map((entry) => [entry.kind, entry.description])),
      };
      const earlier = Object.fromEntries(candidates.map((entry, index) => [`q${index}`, entry.request]));
      const result = await decider.decide({ state: { question, earlier }, questions: candidates.length === 0 ? { shape } : { same, shape } });
      const decisions: Record<string, unknown> = result.decisions;
      const pick = (name: string): string => {
        const decision = decisions[name];
        return typeof decision === 'object' && decision !== null && 'choice' in decision && typeof decision.choice === 'string' ? decision.choice : '';
      };
      // A replay answers in the EARLIER question's shape, so it is the answer
      // only if this question wants that shape too. "How many people are in
      // Archive?" matched "…in each department?" at 0.73 — the counts contain
      // Archive's — but it wants one number, not a count per group.
      const match = byKey.get(pick('same'));
      const wanted = shapeOf(pick('shape'));
      return match !== undefined && match.shape === wanted.kind ? { replay: match } : { generate: wanted };
    },
    generateDsl: watchedQueryDsl({ llm, dslSchema, tracer }),
    mapToShape: createShapeMapper(llm),
  };
};

// ── fake ──

const normalise = (text: string): string => text.trim().toLowerCase().replace(/[?.!]+$/, '');

const fakeKind = (request: string): string => {
  const q = normalise(request);
  if (/\b(each|per|by)\b/.test(q)) return 'counts';
  if (/^how (many|much)\b/.test(q)) return 'number';
  if (/^who\b/.test(q)) return 'people';
  return 'list';
};

// A query per shape, aliased to the shape's keys so the rows already fit — and
// one that reaches for a table no member may read, to be refused the way a
// real generation would be: by the engine, under the caller's policy.
const FAKE_DSL: Record<string, Query> = {
  number: { from: ['members'], aggregate: { value: { count: '*' } } },
  counts: { from: ['members'], fields: [{ field: 'members.name', as: 'group' }], aggregate: { count: { count: '*' } }, groupBy: ['members.name'], sort: [{ field: 'members.name', dir: 'asc' }] },
  people: { from: ['members'], fields: ['members.name'], sort: [{ field: 'members.joined_at', dir: 'asc' }] },
  list: { from: ['members'], fields: [{ field: 'members.name', as: 'label' }, { field: 'members.joined_at', as: 'detail' }], sort: [{ field: 'members.joined_at', dir: 'asc' }] },
  forbidden: { from: ['login_links'], fields: ['login_links.principal'] },
};
// A first draft that names a column the table does not have — so the trace
// carries the engine's own message about it, as a real run's would.
const MISTAKEN: Query = { from: ['members'], fields: ['members.nothing'] };

// A draft, tested the way the real writer's tool tests it: through the
// caller's own door into the engine, five rows at most.
const tested = async (caller: GenerationCaller, draft: Query): Promise<ReturnType<typeof testStep>> => {
  const at = Date.now();
  try {
    const { rows, sql } = await caller.read({ ...draft, limit: 5 });
    return testStep(draft, { sql, errors: [], rows: rows.length }, Date.now() - at);
  } catch (error) {
    return testStep(draft, { sql: '', errors: [error instanceof Error ? error.message : String(error)], rows: 0 }, Date.now() - at);
  }
};

const refuse = (): never => {
  throw new Error('lyceum: the fake query router calls no model');
};
const NO_MODEL: SignalClient = { step: refuse, stepStream: refuse, count: refuse, describe: refuse };

const fakeQuerier = (tracer: Tracer): Querier => ({
  kind: 'fake',
  trace: tracer,
  route: async (request, known) => {
    const earlier = known.find((entry) => normalise(entry.request) === normalise(request));
    return earlier !== undefined ? { replay: earlier } : { generate: shapeOf(fakeKind(request)) };
  },
  // No model: a wrong draft first, then the one the request gets — each tested
  // through the engine, so the trace shows what a real run shows.
  generateDsl: async (request, schema, caller) => {
    const intent = request.intent ?? '';
    tracer.started(intent, { tables: schema.entities.map((entity) => entity.name).join(', '), caller: describeCaller(caller.bindings) }, request.shape);
    const dsl = (/login|sign in|password/i.test(intent) ? FAKE_DSL['forbidden'] : FAKE_DSL[fakeKind(intent)]) ?? { from: ['members'] };
    tracer.step(intent, await tested(caller, MISTAKEN));
    const passing = await tested(caller, dsl);
    tracer.step(intent, passing);
    tracer.written(intent, dsl, passing.lang === 'sql' ? passing.answer : '');
    return dsl;
  },
  // Vex's own mapper, with a model that is never there: rows that fit their
  // shape get the identity, anything else fails — which the fake's queries,
  // aliased to their shapes, never do.
  mapToShape: createShapeMapper(NO_MODEL),
});

export const createQuerier = (env: Record<string, string | undefined>, tracer: Tracer): Querier => {
  const chosen = env['LYCEUM_QUERY'];
  const hasKey = (env['GROQ_API_KEY'] ?? '') !== '';
  if (chosen === 'fake' || (chosen !== 'live' && !hasKey)) return fakeQuerier(tracer);
  if (!hasKey) throw new Error('lyceum: LYCEUM_QUERY=live needs GROQ_API_KEY in apps/lab/lyceum/.env.');
  return liveQuerier(env, tracer);
};

// THE GENERATIVE ENGINE: the same database and the same CACHE as moss's own
// engine — so a fingerprint minted here is one moss's locked /api/vex replays
// — with the querier's hooks. No policy of its own: every execute is handed the
// caller's. One per runtime.
const engines = new WeakMap<object, Promise<QueryEngine>>();

export const queryEngineFor = (runtime: NiscRuntime, querier: Querier): Promise<QueryEngine> => {
  const hit = engines.get(runtime.pool);
  if (hit !== undefined) return hit;
  const booted = (async () => {
    const engine = createQueryEngine({
      adapter: createPostgresAdapter({ pool: runtime.pool }),
      cache: runtime.cache ?? createMemoryCache(),
      generateDsl: querier.generateDsl,
      mapToShape: querier.mapToShape,
      // Who "me" is: the columns lyceum's behaviors bind to the caller's
      // userId (members.member_id, queries.member_id) — so "what's my name?" is
      // a filter on the caller's own value, bound by the engine, and one
      // stored query answers it for everybody.
      behaviors: BEHAVIORS,
    });
    await engine.introspect();
    return engine;
  })();
  engines.set(runtime.pool, booted);
  return booted;
};
