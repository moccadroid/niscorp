import { createSignal } from '@niscorp/signal';
import type { Chat, Models } from '../compose';

type Env = Readonly<Record<string, string | undefined>>;

const CHAT = { provider: 'groq', model: 'openai/gpt-oss-120b' };

// The chat model answers in about one second, its slowest measured near 4 s; a run given up is a line saying the model
// could not be reached.
const CHAT_MS = 8_000;

export const modelsFromEnv = (env: Env): Models & { summary: string } => {
  const has = (name: string): boolean => (env[name] ?? '').trim() !== '';
  const chat: Chat | undefined = has('GROQ_API_KEY') ? { ...CHAT, llm: createSignal('groq', { options: { reasoningEffort: 'low' } }).model(CHAT.model), timeoutMs: CHAT_MS } : undefined;

  const summary = chat !== undefined ? 'gpt-oss-120b composes' : 'nothing composes (no GROQ_API_KEY)';
  return { ...(chat !== undefined ? { chat } : {}), missing: has('GROQ_API_KEY') ? [] : ['GROQ_API_KEY'], summary };
};
