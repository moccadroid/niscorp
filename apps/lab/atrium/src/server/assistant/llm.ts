import OpenAI from 'openai';
import { createSignal } from '@niscorp/signal';
import type { Signal } from '@niscorp/signal';
import { tuningFor } from './profiles';

// The LLM provider seam. A persona row names its provider + model; this file
// turns that pair into a client. Keys are server configuration (.env) — nothing
// LLM-shaped reaches a browser.
//
// Everything model-SPECIFIC comes from `tuningFor`. This file knows how to reach
// a provider and nothing about which models are good at what; switching on the
// provider to answer a question about one model is how a per-model fact becomes
// a per-provider rule.
//
// The OpenAI SDK client is built statically and injected: vite's SSR runner
// cannot resolve signal's dynamic `import('openai')` from the workspace dist
// (relay hit the same wall).

type Provider = 'groq' | 'openrouter';

const BASE_URLS: Record<Provider, string> = {
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

const KEY_VARS: Record<Provider, string> = {
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

const isProvider = (value: string): value is Provider => value === 'groq' || value === 'openrouter';

// A fetch shim rather than a signal option: `SignalOptions` carries
// temperature/maxTokens/topP/seed and has no passthrough for a provider-specific
// body field, so this is atrium's own client shaping atrium's own request.
//
// `enabled: false` is the only setting that actually silences GLM — measured,
// `effort: 'minimal'` still produced 370 reasoning characters and
// `max_tokens: 1` produced 621.
//
// WHICH models get this is `tuningFor`'s call, not this file's.
const withoutReasoning = (base: typeof fetch): typeof fetch =>
  async (url, init) => {
    if (init === undefined || typeof init.body !== 'string') return base(url, init);
    try {
      const body: unknown = JSON.parse(init.body);
      if (typeof body !== 'object' || body === null || Array.isArray(body)) return base(url, init);
      return base(url, { ...init, body: JSON.stringify({ ...body, reasoning: { enabled: false } }) });
    } catch {
      return base(url, init);
    }
  };

// The client for a persona's provider + model, or undefined when the provider
// is unknown or its key is not configured — the caller says so in one plain
// sentence and the app carries on.
// Returns the full Signal builder: cortex's SignalClient is a structural
// slice of it, so agent runs and direct schema completions share one client.
export const createLlmClient = (provider: string, model: string): Signal | undefined => {
  if (!isProvider(provider)) return undefined;
  const apiKey = process.env[KEY_VARS[provider]];
  if (apiKey === undefined || apiKey === '') return undefined;
  const tuning = tuningFor(model);
  const client = new OpenAI({
    apiKey,
    baseURL: BASE_URLS[provider],
    dangerouslyAllowBrowser: true,
    ...(tuning.reasoning ? {} : { fetch: withoutReasoning(fetch) }),
  });
  const llm = createSignal(provider, { client, model, apiKey });
  // The registry row is the PROVIDER's floor; this is what we know about the
  // model being routed to. Signal resolves the transport from the merged answer,
  // so one client lands on `native` with tools still on the request while
  // another stays on `emit`, neither having been told which to use.
  return tuning.capabilities === undefined ? llm : llm.capabilities(tuning.capabilities);
};
