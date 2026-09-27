import { createSignal } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import { getKey } from '@showroom/modules/signal/settings/api-key-storage';
import { createOpenAIClient, createScriptedClient, type RecipeProvider } from '@showroom/modules/signal/openai-client';

// ═══════════════════════════════════════════════════════════
// LLM for the cortex demos — first provider with a stored key
// (Signal → Settings), Groq preferred for speed. The static
// OpenAI client bypasses signal's dynamic import (Vite).
// ═══════════════════════════════════════════════════════════

const PREFERENCE: readonly RecipeProvider[] = ['groq', 'openrouter', 'openai'];

const DEFAULT_MODELS: Record<RecipeProvider, string> = {
  groq: 'qwen/qwen3.8-27b',
  openrouter: 'qwen/qwen3.8-27b',
  openai: 'gpt-4o-mini',
};

export const buildLlm = (): SignalClient | undefined => {
  for (const provider of PREFERENCE) {
    const key = getKey(provider);
    if (key === undefined) continue;
    const client = createOpenAIClient(provider, key);
    return createSignal(provider, { client }).apiKey(key).model(DEFAULT_MODELS[provider]);
  }
  return undefined;
};

// The model every cortex page runs: the visitor's own when they stored a key,
// otherwise the scripted provider — the real signal client and the real cortex
// loop, with only the network replaced (see lib/scripted-model). Pages say
// which one answered.
export const resolveLlm = (): { llm: SignalClient; scripted: boolean } => {
  const live = buildLlm();
  if (live !== undefined) return { llm: live, scripted: false };
  return { llm: createSignal('groq', { client: createScriptedClient() }).apiKey('scripted').model(DEFAULT_MODELS.groq), scripted: true };
};
