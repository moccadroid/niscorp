import OpenAI from 'openai';
import { createSignal } from '@niscorp/signal';
import type { Signal } from '@niscorp/signal';
import { tuningFor } from './profiles';

// The OpenAI SDK client is built statically and injected: vite's SSR runner
// cannot resolve signal's dynamic `import('openai')` from the workspace dist.

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

// A fetch shim, as `SignalOptions` has no passthrough for a provider-specific body field.
// `enabled: false` is the only setting that silences GLM: `effort: 'minimal'` and `max_tokens: 1` do not.
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
  return createSignal(provider, { client, model, apiKey });
};
