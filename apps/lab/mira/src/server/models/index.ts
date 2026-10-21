import { z } from 'zod';
import { createSignal, ErrorCode, SignalError } from '@niscorp/signal';
import type { Compose, Decide, Model, Models } from '../compose';

type Env = Readonly<Record<string, string | undefined>>;

const JEV = { provider: 'typesafe', model: 'jev-latest' };
const CHAT = { provider: 'groq', model: 'openai/gpt-oss-120b' };

// Jev answers in about 200 ms and the chat model in about one second, its slowest measured near 4 s. A Jev pass given up
// is answered by the chat model alone; a chat call given up is a line saying the model could not be reached.
const JEV_MS = 2_000;
const CHAT_MS = 8_000;
const SCHEMA_RETRIES = 2;

// signal's complete() takes no abort, so the chat call is raced against the clock: its request runs on, unwaited for.
const within = <T>(ms: number, work: Promise<T>): Promise<T> =>
  Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms).unref())]);

const DecisionsSchema = z.record(z.string(), z.looseObject({ answer: z.boolean(), noul: z.number().optional() }));

// Without a TypeSafe key there is no Jev pass: the chat model could answer its questions too, but far slower than its
// budget allows.
export const modelsFromEnv = (env: Env): Models & { summary: string } => {
  const has = (name: string): boolean => (env[name] ?? '').trim() !== '';
  const chat = has('GROQ_API_KEY') ? createSignal('groq').model(CHAT.model) : undefined;
  const jev = has('TYPESAFE_API_KEY') ? createSignal('typesafe').model(JEV.model) : undefined;

  const decide: Model<Decide> | undefined = jev && {
    ...JEV,
    call: async (state, questions) => {
      const result = await jev.decide({ state, questions, options: { signal: AbortSignal.timeout(JEV_MS) } });
      const picked = Object.fromEntries(Object.entries(DecisionsSchema.parse(result.decisions)).map(([name, decision]) => [name, { yes: decision.answer, ...(decision.noul !== undefined ? { probability: decision.noul } : {}) }]));
      return { picked, usage: { ...result.meta.usage, calls: 1 } };
    },
  };
  // complete() adds the usage the provider reported to what it estimated, and does not say which. A reply that still
  // fails the schema after signal's retries is unfit, and its tokens are not told.
  const compose: Model<Compose> | undefined = chat && {
    ...CHAT,
    call: async (system, user, schema) => {
      try {
        const result = await within(CHAT_MS, chat.systemPrompt(system).schema(schema).retries(SCHEMA_RETRIES).options({ reasoningEffort: 'low' }).complete(user));
        return { reply: result.response, usage: { ...result.meta.usage, reported: false, calls: 1 + result.meta.retries } };
      } catch (error) {
        if (!(error instanceof SignalError) || error.code !== ErrorCode.VALIDATION_FAILED) throw error;
        return { unfit: error.message, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false, calls: 1 + SCHEMA_RETRIES } };
      }
    },
  };

  const summary = [jev !== undefined ? 'Jev picks' : 'no Jev pass (no TYPESAFE_API_KEY)', chat !== undefined ? 'gpt-oss-120b composes' : 'nothing composes (no GROQ_API_KEY)'].join(' · ');
  return { ...(decide !== undefined ? { decide } : {}), ...(compose !== undefined ? { compose } : {}), missing: has('GROQ_API_KEY') ? [] : ['GROQ_API_KEY'], summary };
};
