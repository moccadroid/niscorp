import { getKey } from '@showroom/modules/signal/settings/api-key-storage';
import type { RecipeProvider } from '@showroom/modules/signal/openai-client';

export type LiveConfig = { provider: RecipeProvider; model: string };

export const PROVIDER_MODELS: Record<RecipeProvider, string[]> = {
  groq: ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
  openrouter: [
    'qwen/qwen3.8-27b',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'meta-llama/llama-3.3-70b-instruct',
  ],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
};

const PROVIDERS: readonly RecipeProvider[] = ['groq', 'openrouter', 'openai'];

const STORAGE_KEY = 'showroom-vex-live';

export const availableProviders = (): RecipeProvider[] => PROVIDERS.filter((p) => getKey(p) !== undefined);

export const hasGenerationKey = (): boolean => availableProviders().length > 0;

const defaultConfig = (): LiveConfig => {
  const provider = availableProviders()[0] ?? 'openrouter';
  return { provider, model: PROVIDER_MODELS[provider][0]! };
};

export const getLiveConfig = (): LiveConfig => {
  const fallback = defaultConfig();
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as Partial<LiveConfig>;
    if (typeof parsed.provider !== 'string' || !(parsed.provider in PROVIDER_MODELS)) return fallback;
    const provider = parsed.provider as RecipeProvider;
    if (!availableProviders().includes(provider)) return fallback;
    const models = PROVIDER_MODELS[provider];
    const model = typeof parsed.model === 'string' && models.includes(parsed.model) ? parsed.model : models[0]!;
    return { provider, model };
  } catch {
    return fallback;
  }
};

export const setLiveConfig = (config: LiveConfig): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
};
