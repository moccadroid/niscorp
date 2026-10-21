import { z } from 'zod';
import { createSignal } from '@niscorp/signal';
import type { Compose, Decide, Embed, Models } from '../compose';

type Env = Readonly<Record<string, string | undefined>>;

// Jev answers in about 200 ms and the chat model in about one second, its slowest measured near 4 s. A Jev pass given up
// is answered by the chat model alone; a chat call given up is a line saying the model could not be reached.
const JEV_MS = 2_000;
const CHAT_MS = 8_000;

// signal's complete() takes no abort, so the chat call is raced against the clock: its request runs on, unwaited for.
const within = <T>(ms: number, work: Promise<T>): Promise<T> =>
  Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms).unref())]);

const DecisionsSchema = z.record(z.string(), z.looseObject({ answer: z.boolean(), noul: z.number().optional() }));

const EMBEDDERS: Record<string, { provider: 'openai' | 'openrouter'; key: string; model: string; name: string }> = {
  openai: { provider: 'openai', key: 'OPENAI_API_KEY', model: 'text-embedding-3-small', name: 'OpenAI text-embedding-3-small' },
  openrouter: { provider: 'openrouter', key: 'OPENROUTER_API_KEY', model: 'qwen/qwen3-embedding-8b', name: 'OpenRouter qwen3-embedding-8b' },
};

// Without a TypeSafe key there is no Jev pass: the chat model could answer its questions too, but far slower than its
// budget allows.
export const modelsFromEnv = (env: Env): Models & { summary: string } => {
  const has = (name: string): boolean => (env[name] ?? '').trim() !== '';
  const chat = has('GROQ_API_KEY') ? createSignal('groq').model('openai/gpt-oss-120b') : undefined;
  const jev = has('TYPESAFE_API_KEY') ? createSignal('typesafe') : undefined;
  const embedder = EMBEDDERS[env['EMBEDDINGS'] ?? ''];
  const embeds = embedder !== undefined && has(embedder.key) ? createSignal(embedder.provider).model(embedder.model) : undefined;

  const decide: Decide | undefined =
    jev &&
    (async (state, questions) => {
      const result = await jev.decide({ state, questions, options: { signal: AbortSignal.timeout(JEV_MS) } });
      return Object.fromEntries(Object.entries(DecisionsSchema.parse(result.decisions)).map(([name, decision]) => [name, { yes: decision.answer, ...(decision.noul !== undefined ? { probability: decision.noul } : {}) }]));
    });
  const compose: Compose | undefined = chat && (async (system, user, schema) => (await within(CHAT_MS, chat.systemPrompt(system).schema(schema).options({ reasoningEffort: 'low' }).complete(user))).response);
  const embed: Embed | undefined = embeds && ((texts) => embeds.embed(texts));

  const summary = [
    jev !== undefined ? 'Jev picks' : 'no Jev pass (no TYPESAFE_API_KEY)',
    chat !== undefined ? 'gpt-oss-120b composes' : 'nothing composes (no GROQ_API_KEY)',
    embeds !== undefined && embedder !== undefined ? `embeddings: ${embedder.name}` : 'no embeddings',
  ].join(' · ');
  return { ...(decide !== undefined ? { decide } : {}), ...(compose !== undefined ? { compose } : {}), ...(embed !== undefined ? { embed } : {}), missing: has('GROQ_API_KEY') ? [] : ['GROQ_API_KEY'], summary };
};
