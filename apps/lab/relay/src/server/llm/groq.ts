import OpenAI from 'openai';
import { createSignal } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import type { ReasoningEffort } from './effort';

// ═══════════════════════════════════════════════════════════
// The Groq LLM adapter.
//
// One concrete provider adapter. The ACTIVE provider is selected in llm/index.ts,
// so call sites depend on that neutral seam and never name a provider here.
//
// Groq via the OpenAI-compatible adapter — `openai/gpt-oss-120b`. We build the
// OpenAI SDK client statically and inject it (Vite can't resolve Signal's dynamic
// `import('openai')` from the workspace dist; the showroom does the same).
// ═══════════════════════════════════════════════════════════

export const GROQ_MODEL = 'openai/gpt-oss-120b';
export const GROQ_ENV_KEY = 'GROQ_API_KEY';

export const createGroqClient = (apiKey: string, reasoningEffort?: ReasoningEffort): SignalClient => {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
    dangerouslyAllowBrowser: true,
  });
  return createSignal('groq', {
    client,
    model: GROQ_MODEL,
    apiKey,
    // temperature 0: build work is mechanical, and the provider default (~1.0)
    // made the SAME prompt draw a 3-tool run or a 20-step wander by luck —
    // measured across a day of suite logs. Determinism over creativity here.
    options: { temperature: 0, ...(reasoningEffort !== undefined && { reasoningEffort }) },
  });
};

// The Groq API key — server configuration (.env), never browser data. All
// LLM calls run server-side since agents moved into moss.
export const getKey = (): string | undefined => {
  const k = process.env[GROQ_ENV_KEY];
  return k === undefined || k === '' ? undefined : k;
};
