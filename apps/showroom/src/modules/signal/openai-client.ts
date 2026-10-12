import OpenAI from 'openai';
import { scriptedFetch } from '@showroom/lib/scripted-model/scripted-fetch';
import { getKey } from '@showroom/modules/signal/settings/api-key-storage';

export type RecipeProvider = 'openai' | 'openrouter' | 'groq';

// Vite cannot resolve signal's dynamic `await import('openai')` from inside the
// workspace-linked signal/dist bundle. A client passed to signal in the `client`
// config option makes its adapter skip that import.

const PROVIDER_BASE_URLS: Record<RecipeProvider, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
};

export const createOpenAIClient = (provider: RecipeProvider, apiKey: string): OpenAI => {
  return new OpenAI({
    apiKey,
    baseURL: PROVIDER_BASE_URLS[provider],
    dangerouslyAllowBrowser: true,
  });
};

export type ResolvedModel = { apiKey: string; client: OpenAI; scripted: boolean };

export const createScriptedClient = (): OpenAI =>
  new OpenAI({ apiKey: 'scripted', baseURL: 'https://scripted.model/v1', dangerouslyAllowBrowser: true, fetch: scriptedFetch, maxRetries: 0 });

export const resolveModel = (provider: RecipeProvider): ResolvedModel => {
  const key = getKey(provider);
  return key === undefined
    ? { apiKey: 'scripted', client: createScriptedClient(), scripted: true }
    : { apiKey: key, client: createOpenAIClient(provider, key), scripted: false };
};
