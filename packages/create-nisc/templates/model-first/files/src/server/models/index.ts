import { z } from 'zod';
import { createSignal } from '@niscorp/signal';
import type { Chat, Jev, Models } from '../compose';

type Env = Readonly<Record<string, string | undefined>>;

const JEV = { provider: 'typesafe', model: 'jev-latest' };
const CHAT = { provider: 'groq', model: 'openai/gpt-oss-120b' };

// Jev answers in about 200 ms and the chat model in about one second, its slowest measured near 4 s. A Jev pass given up
// is answered by the chat model alone; a chat run given up is a line saying the model could not be reached.
const JEV_MS = 2_000;
const CHAT_MS = 8_000;

const DecisionsSchema = z.record(z.string(), z.looseObject({ answer: z.boolean(), noul: z.number().optional() }));

// Without a TypeSafe key there is no Jev pass: the chat model could answer its questions too, but far slower than its
// budget allows.
export const modelsFromEnv = (env: Env): Models & { summary: string } => {
  const has = (name: string): boolean => (env[name] ?? '').trim() !== '';
  const decider = has('TYPESAFE_API_KEY') ? createSignal('typesafe').model(JEV.model) : undefined;

  const jev: Jev | undefined = decider && {
    ...JEV,
    decide: async (state, questions) => {
      const result = await decider.decide({ state, questions, options: { signal: AbortSignal.timeout(JEV_MS) } });
      const picked = Object.fromEntries(Object.entries(DecisionsSchema.parse(result.decisions)).map(([name, decision]) => [name, { yes: decision.answer, ...(decision.noul !== undefined ? { probability: decision.noul } : {}) }]));
      return { picked, usage: result.meta.usage };
    },
  };
  const chat: Chat | undefined = has('GROQ_API_KEY') ? { ...CHAT, llm: createSignal('groq', { options: { reasoningEffort: 'low' } }).model(CHAT.model), timeoutMs: CHAT_MS } : undefined;

  const summary = [jev !== undefined ? 'Jev picks' : 'no Jev pass (no TYPESAFE_API_KEY)', chat !== undefined ? 'gpt-oss-120b composes' : 'nothing composes (no GROQ_API_KEY)'].join(' · ');
  return { ...(jev !== undefined ? { jev } : {}), ...(chat !== undefined ? { chat } : {}), missing: has('GROQ_API_KEY') ? [] : ['GROQ_API_KEY'], summary };
};
