import OpenAI from 'openai';
import { createSignal } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import { lsGet, lsSet } from '../storage';

// ═══════════════════════════════════════════════════════════
// The Groq LLM seam — shared, neutral infra.
//
// Both Vex's query/mapping agents (vex/agent.ts) and Ray (the assistant) build a
// client from the same browser-local key. It lives here, owned by neither, so the
// data layer and the assistant don't depend on each other for it.
//
// Groq via the OpenAI-compatible adapter — `openai/gpt-oss-120b`. We build the
// OpenAI SDK client statically and inject it (Vite can't resolve Signal's dynamic
// `import('openai')` from the workspace dist; the showroom does the same).
// ═══════════════════════════════════════════════════════════

export const GROQ_MODEL = 'openai/gpt-oss-120b';

export const createGroqClient = (apiKey: string): SignalClient => {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
    dangerouslyAllowBrowser: true,
  });
  return createSignal('groq', { client, model: GROQ_MODEL, apiKey });
};

// The Groq API key — held in localStorage (browser-only, as agreed for v1). Plain
// text, visible to anyone with the browser. Sent only to Groq's API via the
// OpenAI-compatible SDK. We host this properly later.
const STORAGE_KEY = 'relay.ray.groq-key';

export const getKey = (): string | undefined => {
  const k = lsGet(STORAGE_KEY);
  return k === null || k === '' ? undefined : k;
};

export const setKey = (key: string): void => lsSet(STORAGE_KEY, key);
