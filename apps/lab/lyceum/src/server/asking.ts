import { createMemoryCache, createPostgresAdapter, createQueryEngine } from '@niscorp/vex';
import type { GenerateDsl, MapToShape, Query, QueryEngine } from '@niscorp/vex';
import { createQueryDsl, createShapeMapper } from '@niscorp/vex/agent';
import type { SignalClient } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import type { ChoiceQuestion } from '@niscorp/signal';
import type { NiscRuntime } from '@niscorp/moss';
import { ASK_SHAPES } from '@lyceum/app/actions/ask/ask.shapes';
import type { AskShape } from '@lyceum/app/actions/ask/ask.shapes';

// WHO ANSWERS A QUESTION PUT TO THE RECORDS — the two model seams of the ask.
//
//   ROUTING   — a CHOICE, never writing: has an earlier question already asked
//               for the same thing (then its query is replayed), and which of
//               the authored shapes (../app/actions/ask/ask.shapes.ts) does the
//               answer take. Jev (TypeSafe, `decide()`) with TYPESAFE_API_KEY;
//               without it, gpt-oss-120b answers the same questions by
//               emulation (uncalibrated picks).
//   GENERATION — a new question's query, written by vex's query agent and
//               mapped by prism's mapping agent, on gpt-oss-120b at `low`
//               (PLAN.md, "Measured"). It runs under the ASKER's policy: the
//               model is handed only the tables they may read, and whatever it
//               writes is compiled under the same policy.
//
//   LYCEUM_ASK=live   the above; needs GROQ_API_KEY
//   LYCEUM_ASK=fake   deterministic stand-ins for both — what the checks use,
//                     and a talk with no network. The fake generator writes
//                     real DSL, so the engine, the cache, the policy and the
//                     replay path are the real ones.
//
// Unset, it is `live` when there is a Groq key and `fake` when there is not.

export type Known = { question: string; fingerprint: string; shape: string };
export type Route = { replay: Known } | { generate: AskShape };

export type Asker = {
  kind: 'live' | 'fake';
  route: (question: string, known: readonly Known[]) => Promise<Route>;
  generateDsl: GenerateDsl;
  mapToShape: MapToShape;
};

const DEFAULT_SHAPE: AskShape = ASK_SHAPES[0] ?? { kind: 'list', means: '', shape: [], figure: false, columns: [] };
const shapeOf = (kind: string): AskShape => ASK_SHAPES.find((shape) => shape.kind === kind) ?? DEFAULT_SHAPE;

// The router is handed at most this many earlier questions — a choice has at
// most 255 options, and the newest are the likeliest to be asked again.
const KNOWN_LIMIT = 200;

// ── live ──

const liveAsker = (env: Record<string, string | undefined>): Asker => {
  const llm = createSignal('groq', { options: { reasoningEffort: 'low' } }).model('openai/gpt-oss-120b');
  const decider = (env['TYPESAFE_API_KEY'] ?? '') !== '' ? createSignal('typesafe') : llm;
  const dslSchema = createQueryEngine({ adapter: createPostgresAdapter({ pool: { query: () => Promise.reject(new Error('unused')) } }) }).getDslSchema();

  return {
    kind: 'live',
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
        criteria: Object.fromEntries(ASK_SHAPES.map((entry) => [entry.kind, entry.means])),
      };
      const earlier = Object.fromEntries(candidates.map((entry, index) => [`q${index}`, entry.question]));
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
    generateDsl: createQueryDsl({ llm, queryJsonSchema: dslSchema }),
    mapToShape: createShapeMapper(llm),
  };
};

// ── fake ──

const normalise = (text: string): string => text.trim().toLowerCase().replace(/[?.!]+$/, '');

const fakeKind = (question: string): string => {
  const q = normalise(question);
  if (/\b(each|per|by)\b/.test(q)) return 'counts';
  if (/^how (many|much)\b/.test(q)) return 'number';
  if (/^who\b/.test(q)) return 'people';
  return 'list';
};

// A query per shape, aliased to the shape's keys so the rows already fit — and
// one that reaches for a table no member may read, to be refused the way a
// real generation would be: by the engine, under the asker's policy.
const FAKE_DSL: Record<string, Query> = {
  number: { from: ['members'], aggregate: { value: { count: '*' } } },
  counts: { from: ['members', 'departments'], fields: [{ field: 'departments.name', as: 'group' }], aggregate: { count: { count: '*' } }, groupBy: ['departments.name'], sort: [{ field: 'departments.name', dir: 'asc' }] },
  people: {
    from: ['members', 'departments'],
    fields: ['members.name', 'members.title', { field: 'departments.name', as: 'department' }],
    sort: [{ field: 'members.joined_at', dir: 'asc' }],
  },
  list: { from: ['departments'], fields: [{ field: 'departments.name', as: 'label' }, { field: 'departments.remit', as: 'detail' }], sort: [{ field: 'departments.position', dir: 'asc' }] },
  forbidden: { from: ['login_links'], fields: ['login_links.principal'] },
};

const refuse = (): never => {
  throw new Error('lyceum: the fake asker calls no model');
};
const NO_MODEL: SignalClient = { step: refuse, stepStream: refuse, count: refuse, describe: refuse };

const fakeAsker = (): Asker => ({
  kind: 'fake',
  route: async (question, known) => {
    const earlier = known.find((entry) => normalise(entry.question) === normalise(question));
    return earlier !== undefined ? { replay: earlier } : { generate: shapeOf(fakeKind(question)) };
  },
  generateDsl: async (request) => {
    const intent = request.intent ?? '';
    if (/login|sign in|password/i.test(intent)) return FAKE_DSL['forbidden'] ?? FAKE_DSL['list'] ?? { from: ['departments'] };
    return FAKE_DSL[fakeKind(intent)] ?? { from: ['departments'] };
  },
  // Vex's own mapper, with a model that is never there: rows that fit their
  // shape get the identity, anything else fails — which the fake's queries,
  // aliased to their shapes, never do.
  mapToShape: createShapeMapper(NO_MODEL),
});

export const createAsker = (env: Record<string, string | undefined>): Asker => {
  const asked = env['LYCEUM_ASK'];
  const hasKey = (env['GROQ_API_KEY'] ?? '') !== '';
  if (asked === 'fake' || (asked !== 'live' && !hasKey)) return fakeAsker();
  if (!hasKey) throw new Error('lyceum: LYCEUM_ASK=live needs GROQ_API_KEY in apps/lab/lyceum/.env.');
  return liveAsker(env);
};

// THE GENERATIVE ENGINE: the same database and the same CACHE as moss's own
// engine — so a fingerprint minted here is one moss's locked /api/vex replays
// — with the asker's hooks. No policy of its own: every execute is handed the
// asker's. One per runtime.
const engines = new WeakMap<object, Promise<QueryEngine>>();

export const askEngine = (runtime: NiscRuntime, asker: Asker): Promise<QueryEngine> => {
  const hit = engines.get(runtime.pool);
  if (hit !== undefined) return hit;
  const booted = (async () => {
    const engine = createQueryEngine({
      adapter: createPostgresAdapter({ pool: runtime.pool }),
      cache: runtime.cache ?? createMemoryCache(),
      generateDsl: asker.generateDsl,
      mapToShape: asker.mapToShape,
    });
    await engine.introspect();
    return engine;
  })();
  engines.set(runtime.pool, booted);
  return booted;
};
