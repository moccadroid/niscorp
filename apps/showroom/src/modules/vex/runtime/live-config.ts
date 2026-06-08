import { getKey } from '@showroom/modules/signal/settings/api-key-storage';
import type { RecipeProvider } from '@showroom/modules/signal/openai-client';

// ═══════════════════════════════════════════════════════════
// Live-mode model selection — which provider + model the Vex query
// and mapping agents use when running live. Persisted to localStorage
// so a choice sticks across reloads, and read fresh by live.ts on
// each call so changing it takes effect without a reboot.
// ═══════════════════════════════════════════════════════════

export type LiveConfig = { provider: RecipeProvider; model: string };

// A few sensible presets per provider; the first is the default. Any
// model id the provider accepts works — these are just quick picks.
export const PROVIDER_MODELS: Record<RecipeProvider, string[]> = {
  groq: [
    'llama-3.3-70b-versatile',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'moonshotai/kimi-k2-instruct',
    'llama-3.1-8b-instant',
  ],
  openrouter: [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'anthropic/claude-3.5-sonnet',
    'meta-llama/llama-3.3-70b-instruct',
    'google/gemini-2.0-flash-001',
  ],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
};

const PROVIDERS: readonly RecipeProvider[] = ['groq', 'openrouter', 'openai'];

const STORAGE_KEY = 'showroom-vex-live';

// Providers the user actually has a key for (Signal settings).
export const availableProviders = (): RecipeProvider[] => PROVIDERS.filter((p) => getKey(p) !== undefined);

export const hasGenerationKey = (): boolean => availableProviders().length > 0;

const defaultConfig = (): LiveConfig => {
  const provider = availableProviders()[0] ?? 'openrouter';
  return { provider, model: PROVIDER_MODELS[provider][0]! };
};

// Always returns a usable config: the stored provider must still have a
// key (else fall back to an available one) and the model must be one of
// that provider's presets. This is the single source of truth read by
// both the UI and live.ts, so they can't diverge.
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
