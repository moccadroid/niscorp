import { createPostgresAdapter, createQueryEngine } from '@niscorp/vex';
import type { GenerateDsl, MapToShape, Query } from '@niscorp/vex';
import { createQueryDsl, createShapeMapper } from '@niscorp/vex/agent';
import type { SignalClient } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import type { ChoiceQuestion } from '@niscorp/signal';
import { QUERY_SHAPES } from '@lyceum/app/vex/query.shapes';
import { createDecider } from './decider';
import type { QueryShape } from '@lyceum/app/vex/query.shapes';

export type Known = { request: string; fingerprint: string; shape: string };
export type Route = { replay: Known } | { generate: QueryShape };

export type Querier = {
  kind: 'live' | 'fake';
  route: (request: string, known: readonly Known[]) => Promise<Route>;
  generateDsl: GenerateDsl;
  mapToShape: MapToShape;
};

const DEFAULT_SHAPE: QueryShape = QUERY_SHAPES[0] ?? { kind: 'list', description: '', shape: [] };
const shapeOf = (kind: string): QueryShape => QUERY_SHAPES.find((shape) => shape.kind === kind) ?? DEFAULT_SHAPE;

// A choice has at most 255 options, and the newest requests are the likeliest
// to be run again.
const KNOWN_LIMIT = 200;

const liveQuerier = (env: Record<string, string | undefined>): Querier => {
  const llm = createSignal('groq', { options: { reasoningEffort: 'low' } }).model('openai/gpt-oss-120b');
  const decider = createDecider(env);
  const dslSchema = createQueryEngine({ adapter: createPostgresAdapter({ pool: { query: () => Promise.reject(new Error('unused')) } }) }).getDslSchema();

  return {
    kind: 'live',
    // Jev's words below say "question": they are the measured contract, and
    // renaming them is a re-measurement.
    route: async (question, known) => {
      const candidates = known.slice(0, KNOWN_LIMIT);
      const byKey = new Map(candidates.map((entry, index) => [`q${index}`, entry]));
      // The earlier questions go in the state and the options only name them:
      // written into the options' own text, Jev reads them poorly.
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
      // A replay answers in the earlier question's shape, so it is the answer
      // only if this question wants that shape too.
      const match = byKey.get(pick('same'));
      const wanted = shapeOf(pick('shape'));
      return match !== undefined && match.shape === wanted.kind ? { replay: match } : { generate: wanted };
    },
    generateDsl: createQueryDsl({ llm, queryJsonSchema: dslSchema }),
    mapToShape: createShapeMapper(llm),
  };
};

const normalise = (text: string): string => text.trim().toLowerCase().replace(/[?.!]+$/, '');

const fakeKind = (request: string): string => {
  const q = normalise(request);
  if (/\b(each|per|by)\b/.test(q)) return 'counts';
  if (/^how (many|much)\b/.test(q)) return 'number';
  if (/^who\b/.test(q)) return 'people';
  return 'list';
};

const FAKE_DSL: Record<string, Query> = {
  number: { from: ['members'], aggregate: { value: { count: '*' } } },
  counts: { from: ['members'], fields: [{ field: 'members.name', as: 'group' }], aggregate: { count: { count: '*' } }, groupBy: ['members.name'], sort: [{ field: 'members.name', dir: 'asc' }] },
  people: { from: ['members'], fields: ['members.name'], sort: [{ field: 'members.joined_at', dir: 'asc' }] },
  list: { from: ['members'], fields: [{ field: 'members.name', as: 'label' }, { field: 'members.joined_at', as: 'detail' }], sort: [{ field: 'members.joined_at', dir: 'asc' }] },
  forbidden: { from: ['login_links'], fields: ['login_links.principal'] },
};

const refuse = (): never => {
  throw new Error('lyceum: the fake query router calls no model');
};
const NO_MODEL: SignalClient = { step: refuse, stepStream: refuse, count: refuse, describe: refuse };

const fakeQuerier = (): Querier => ({
  kind: 'fake',
  route: async (request, known) => {
    const earlier = known.find((entry) => normalise(entry.request) === normalise(request));
    return earlier !== undefined ? { replay: earlier } : { generate: shapeOf(fakeKind(request)) };
  },
  generateDsl: async (request) => {
    const intent = request.intent ?? '';
    if (/login|sign in|password/i.test(intent)) return FAKE_DSL['forbidden'] ?? FAKE_DSL['list'] ?? { from: ['members'] };
    return FAKE_DSL[fakeKind(intent)] ?? { from: ['members'] };
  },
  mapToShape: createShapeMapper(NO_MODEL),
});

export const createQuerier = (env: Record<string, string | undefined>): Querier => {
  const chosen = env['LYCEUM_QUERY'];
  const hasKey = (env['GROQ_API_KEY'] ?? '') !== '';
  if (chosen === 'fake' || (chosen !== 'live' && !hasKey)) return fakeQuerier();
  if (!hasKey) throw new Error('lyceum: LYCEUM_QUERY=live needs GROQ_API_KEY in apps/lab/lyceum/.env.');
  return liveQuerier(env);
};
