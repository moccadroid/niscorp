import { createSignal } from '@niscorp/signal';
import type { Decide, Embed, Fill, Models, Picked } from '../compose';

type Env = Readonly<Record<string, string | undefined>>;

const EMBEDDERS: Record<string, { provider: 'openai' | 'openrouter'; key: string; model: string; named: string }> = {
  openai: { provider: 'openai', key: 'OPENAI_API_KEY', model: 'text-embedding-3-small', named: 'OpenAI text-embedding-3-small' },
  openrouter: { provider: 'openrouter', key: 'OPENROUTER_API_KEY', model: 'qwen/qwen3-embedding-8b', named: 'OpenRouter qwen3-embedding-8b' },
};

// The models the keys in .env allow, and a line saying what they are. Without a TypeSafe key the chat model makes the
// decisions too: the same questions, answered one to two orders of magnitude slower and with no probabilities.
export const modelsFromEnv = (env: Env): Models & { said: string } => {
  const has = (name: string): boolean => (env[name] ?? '').trim() !== '';
  const chat = has('GROQ_API_KEY') ? createSignal('groq').model('openai/gpt-oss-120b') : undefined;
  const jev = has('TYPESAFE_API_KEY') ? createSignal('typesafe') : chat;
  const embedder = EMBEDDERS[env['EMBEDDINGS'] ?? ''];
  const embeds = embedder !== undefined && has(embedder.key) ? createSignal(embedder.provider).model(embedder.model) : undefined;

  const decide: Decide | undefined =
    jev &&
    (async (state, questions) => {
      const result = await jev.decide({ state, questions });
      return Object.fromEntries(
        Object.entries(result.decisions as Record<string, Record<string, unknown>>).map(([name, decision]): [string, Picked] => [
          name,
          {
            ...(typeof decision['answer'] === 'boolean' ? { yes: decision['answer'] } : {}),
            ...(typeof decision['choice'] === 'string' ? { choice: decision['choice'] } : {}),
            ...(typeof decision['noul'] === 'number' ? { p: decision['noul'] } : typeof decision['confidence'] === 'number' ? { p: decision['confidence'] } : {}),
          },
        ]),
      );
    });
  const fill: Fill | undefined = chat && (async (system, user, schema) => (await chat.systemPrompt(system).schema(schema).options({ reasoningEffort: 'low' }).complete(user)).response);
  const embed: Embed | undefined = embeds && ((texts) => embeds.embed(texts));

  const missing = has('GROQ_API_KEY') ? [] : ['GROQ_API_KEY'];
  const said = [
    has('TYPESAFE_API_KEY') ? 'Jev picks' : chat !== undefined ? 'gpt-oss-120b picks (no TYPESAFE_API_KEY: slower)' : 'nothing picks',
    chat !== undefined ? 'gpt-oss-120b fills in' : 'nothing fills in (no GROQ_API_KEY)',
    embeds !== undefined && embedder !== undefined ? `embeddings: ${embedder.named}` : 'no embeddings',
  ].join(' · ');
  return { ...(decide !== undefined ? { decide } : {}), ...(fill !== undefined ? { fill } : {}), ...(embed !== undefined ? { embed } : {}), missing, said };
};
