import OpenAI from 'openai';
import { createSignal } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';

// Groq via the OpenAI-compatible adapter — `openai/gpt-oss-120b`. We build the
// OpenAI SDK client statically and inject it (Vite can't resolve Signal's
// dynamic `import('openai')` from the workspace dist; the showroom does the same).
export const GROQ_MODEL = 'openai/gpt-oss-120b';

export const createRayLlm = (apiKey: string): SignalClient => {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
    dangerouslyAllowBrowser: true,
  });
  return createSignal('groq', { client, model: GROQ_MODEL, apiKey }) as unknown as SignalClient;
};
