import OpenAI from 'openai';
import { createSignal } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import { lsGet, lsSet } from '../storage';

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

// The OpenRouter API key — browser-local, its OWN slot (distinct from the Groq
// key), plain text. Sent only to OpenRouter via the OpenAI-compatible SDK.
const STORAGE_KEY = 'relay.ray.openrouter-key';

export const getKey = (): string | undefined => {
  const k = lsGet(STORAGE_KEY);
  return k === null || k === '' ? undefined : k;
};

export const setKey = (key: string): void => lsSet(STORAGE_KEY, key);
