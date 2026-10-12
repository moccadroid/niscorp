import OpenAI from 'openai';
import { createSignal } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import type { ReasoningEffort } from './effort';

export const OPENROUTER_ENV_KEY = 'OPENROUTER_API_KEY';

export const GLM_MODEL = 'z-ai/glm-5.2';

// Not in OpenRouter's /models: a run on it fails at the provider.
export const OX_ALPHA_MODEL = 'stealth/ox-alpha';

export const LUNA_MODEL = 'openai/gpt-5.6-luna';



const openRouter = (apiKey: string): OpenAI =>
  new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    dangerouslyAllowBrowser: true,
    defaultHeaders: { 'HTTP-Referer': 'https://relay.local', 'X-Title': 'Relay' },
  });

export const createOpenRouterClient = (apiKey: string, reasoningEffort?: ReasoningEffort): SignalClient =>
  createSignal('openrouter', {
    client: openRouter(apiKey),
    model: GLM_MODEL,
    apiKey,
    ...(reasoningEffort !== undefined && { options: { reasoningEffort } }),
  });

export const createOxAlphaClient = (apiKey: string, reasoningEffort?: ReasoningEffort): SignalClient =>
  createSignal('openrouter', {
    client: openRouter(apiKey),
    model: OX_ALPHA_MODEL,
    apiKey,
    ...(reasoningEffort !== undefined && { options: { reasoningEffort } }),
  });

export const getKey = (): string | undefined => {
  const k = process.env[OPENROUTER_ENV_KEY];
  return k === undefined || k === '' ? undefined : k;
};

export const createLunaClient = (apiKey: string, reasoningEffort?: ReasoningEffort): SignalClient =>
  createSignal('openrouter', {
    client: openRouter(apiKey),
    model: LUNA_MODEL,
    apiKey,
    ...(reasoningEffort !== undefined && { options: { reasoningEffort } }),
  });
