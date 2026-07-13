import { createSignal } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import { getKey } from '@showroom/modules/signal/settings/api-key-storage';
import { createOpenAIClient, type RecipeProvider } from '@showroom/modules/signal/openai-client';

// ═══════════════════════════════════════════════════════════
// LLM for the cortex demos — first provider with a stored key
// (Signal → Settings), Groq preferred for speed. The static
// OpenAI client bypasses signal's dynamic import (Vite).
// ═══════════════════════════════════════════════════════════

const PREFERENCE: readonly RecipeProvider[] = ['groq', 'openrouter', 'openai'];

const DEFAULT_MODELS: Record<RecipeProvider, string> = {
  groq: 'openai/gpt-oss-120b',
  openrouter: 'openai/gpt-oss-120b',
  openai: 'gpt-4o-mini',
};

export const KEY_HINT =
  'These demos need an API key. Add a Groq (preferred), OpenRouter, or OpenAI key in Signal → Settings, then run again.';

export const buildLlm = (): SignalClient | undefined => {
  for (const provider of PREFERENCE) {
    const key = getKey(provider);
    if (key === undefined) continue;
    const client = createOpenAIClient(provider, key);
    return createSignal(provider, { client }).apiKey(key).model(DEFAULT_MODELS[provider]);
  }
  return undefined;
};
