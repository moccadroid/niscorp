import OpenAI from 'openai';
import { createSignal } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';

// ═══════════════════════════════════════════════════════════
// The OpenRouter LLM adapter — GLM 5.2 (`z-ai/glm-5.2`).
//
// A sibling of the Groq adapter (llm/groq.ts): same shape, its own key slot, a
// different provider. Used to run the whole pipeline (Ray, Vex's query/mapping
// agents, the action builder) on a stronger model. OpenAI-compatible, so we
// inject a statically-built OpenAI SDK client (Vite can't resolve Signal's
// dynamic `import('openai')` from the workspace dist).
// ═══════════════════════════════════════════════════════════

export const GLM_MODEL = 'z-ai/glm-5.2';

export const createOpenRouterClient = (apiKey: string): SignalClient => {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    dangerouslyAllowBrowser: true,
    // OpenRouter attribution headers (optional, for its dashboard/rankings).
    defaultHeaders: { 'HTTP-Referer': 'https://relay.local', 'X-Title': 'Relay' },
  });
  return createSignal('openrouter', { client, model: GLM_MODEL, apiKey });
};

// The OpenRouter API key — server configuration (.env), its own variable
// (distinct from the Groq key).
export const getKey = (): string | undefined => {
  const k = process.env['OPENROUTER_API_KEY'];
  return k === undefined || k === '' ? undefined : k;
};
