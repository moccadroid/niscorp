import { createMemoryCache, createPostgresAdapter, createQueryEngine } from '@niscorp/vex';
import type { GenerateDsl, GenerationCaller, MapToShape, Query, QueryEngine } from '@niscorp/vex';
import { createSignal } from '@niscorp/signal';
import type { ChoiceQuestion } from '@niscorp/signal';
import type { NiscRuntime } from '@niscorp/moss';
import { ALL_SHAPES, QUERY_SHAPES } from '@lyceum/app/vex/query.shapes';
import { BEHAVIORS } from '@lyceum/app/vex/behaviors';
import { createDecider } from './decider';
import { agentMapping, testCall, watchedQueryDsl, watchedShapeMapper } from './generation';
import type { Call, Tracer } from './generation';
import type { QueryShape } from '@lyceum/app/vex/query.shapes';

// WHO TURNS A REQUEST IN WORDS INTO A VEX QUERY — the two model seams.
//
//   ROUTING   — a CHOICE, never writing: has an earlier request already asked
//               for the same thing (then its query is replayed), and which of
//               the authored shapes (../app/vex/query.shapes.ts) does the
//               answer take — unless the request carries its shape, and
//               then only the first is asked, of the stored queries in that
//               shape. Jev (TypeSafe, `decide()`) with TYPESAFE_API_KEY;
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
// What was decided: the stored query that answers — its fingerprint and the
// intent it was stored for — or none, and the shape. A stored query answers
// only in its own shape: one Jev picks in another shape counts as none.
// `given`: the request carried the shape, Jev did not pick it. `asked`: Jev
// was asked anything at all — not when the shape is given and nothing is
// stored in it.
export type Decided = { fingerprint: string | null; intent: string | null; shape: string; given: boolean; asked: boolean };
export type Route = ({ replay: Known } | { generate: QueryShape }) & { decided: Decided };

export type Querier = {
  kind: 'live' | 'fake';
  // What the stage watches (./generation).
  trace: Tracer;
  route: (request: string, known: readonly Known[], given?: QueryShape) => Promise<Route>;
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
    route: async (question, known, given) => {
      // A given shape: only what is stored in that shape can answer.
      const candidates = (given === undefined ? known : known.filter((entry) => entry.shape === given.kind)).slice(0, KNOWN_LIMIT);
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
      const questions: Record<string, ChoiceQuestion> = { ...(candidates.length === 0 ? {} : { same }), ...(given === undefined ? { shape } : {}) };
      const asked = Object.keys(questions).length > 0;
      const decisions: Record<string, unknown> = asked ? (await decider.decide({ state: { question, earlier }, questions })).decisions : {};
      const pick = (name: string): string => {
        const decision = decisions[name];
        return typeof decision === 'object' && decision !== null && 'choice' in decision && typeof decision.choice === 'string' ? decision.choice : '';
      };
      // A replay answers in the EARLIER question's shape, so it is the answer
      // only if this question wants that shape too. "How many people are in
      // Archive?" matched "…in each department?" at 0.73 — the counts contain
      // Archive's — but it wants one number, not a count per group.
      const picked = byKey.get(pick('same'));
      const wanted = given ?? shapeOf(pick('shape'));
      // The same words can be stored in two shapes: the one in the wanted
      // shape answers. A pick in another shape answers nothing — there is no
      // stored query for this request, and that is what is decided.
      const match = picked === undefined || picked.shape === wanted.kind ? picked : candidates.find((entry) => entry.request === picked.request && entry.shape === wanted.kind);
      const usable = match?.shape === wanted.kind ? match : undefined;
      const decided: Decided = { fingerprint: usable?.fingerprint ?? null, intent: usable?.request ?? null, shape: wanted.kind, given: given !== undefined, asked };
      return usable !== undefined ? { replay: usable, decided } : { generate: wanted, decided };
    },
    generateDsl: watchedQueryDsl({ llm, dslSchema, tracer }),
    mapToShape: watchedShapeMapper({ write: agentMapping(llm), tracer }),
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
  // Flat rows, as any query returns them: not the timeline's nested shape, so
  // the mapping has to be written.
  timeline: { from: ['members'], fields: ['members.name', 'members.joined_at'], sort: [{ field: 'members.joined_at', dir: 'desc' }] },
  forbidden: { from: ['login_links'], fields: ['login_links.principal'] },
};
// The mapping the stand-in writes for the timeline's rows — what the mapping
// agent writes for them (measured, MEASURED.md), as a document.
const item = (key: string): unknown => ({ $get: { from: { $var: 'item' }, path: [key] } });
const FAKE_MAPPING = { $map: { over: { $ref: '$.result' }, as: 'item', body: { who: { name: item('name') }, at: item('joined_at') } } };
// A first draft that names a column the table does not have — so the trace
// carries the engine's own message about it, as a real run's would.
const MISTAKEN: Query = { from: ['members'], fields: ['members.nothing'] };
// How long the stand-in waits between its drafts: a model's pace, roughly.
const FAKE_PACE_MS = 500;

// A draft, tested the way the real writer's tool tests it: through the
// caller's own door into the engine, five rows at most.
const tested = async (caller: GenerationCaller, draft: Query): Promise<Call> => {
  const at = Date.now();
  try {
    const { rows } = await caller.read({ ...draft, limit: 5 });
    return testCall(draft, { errors: [], rows: rows.length });
  } catch (error) {
    return testCall(draft, { errors: [error instanceof Error ? error.message : String(error)], rows: 0 });
  }
};

const fakeQuerier = (tracer: Tracer): Querier => ({
  kind: 'fake',
  trace: tracer,
  route: async (request, known, given) => {
    const wanted = given ?? shapeOf(fakeKind(request));
    const earlier = known.find((entry) => normalise(entry.request) === normalise(request) && entry.shape === wanted.kind);
    const how = { shape: wanted.kind, given: given !== undefined, asked: true };
    return earlier !== undefined ? { replay: earlier, decided: { fingerprint: earlier.fingerprint, intent: earlier.request, ...how } } : { generate: wanted, decided: { fingerprint: null, intent: null, ...how } };
  },
  // No model: a wrong draft first, then the one the request gets — each tested
  // through the engine, so the trace shows what a real run shows.
  generateDsl: async (request, _schema, caller) => {
    const intent = request.intent ?? '';
    tracer.writing(intent);
    const began = Date.now();
    // Written to the shape the request carries, as a real writer does.
    const kind = ALL_SHAPES.find((entry) => JSON.stringify(entry.shape) === JSON.stringify(request.shape))?.kind ?? fakeKind(intent);
    const dsl = (/login|sign in|password/i.test(intent) ? FAKE_DSL['forbidden'] : FAKE_DSL[kind]) ?? { from: ['members'] };
    tracer.called(intent, await tested(caller, MISTAKEN));
    // A model takes its time between drafts, and so does the stand-in.
    await new Promise((resolve) => setTimeout(resolve, FAKE_PACE_MS));
    tracer.called(intent, await tested(caller, dsl));
    tracer.written(intent, Date.now() - began);
    return dsl;
  },
  // The watched mapper, with a stand-in for the mapping agent: rows that fit
  // their shape get the identity; the timeline's never do, and get the one
  // mapping there is for them, at a model's pace.
  mapToShape: watchedShapeMapper({
    write: async () => {
      await new Promise((resolve) => setTimeout(resolve, FAKE_PACE_MS));
      return FAKE_MAPPING;
    },
    tracer,
  }),
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
