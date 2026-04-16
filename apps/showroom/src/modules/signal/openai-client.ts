import OpenAI from 'openai';

export type RecipeProvider = 'openai' | 'openrouter' | 'groq';

// ═══════════════════════════════════════════════════════════
// Static OpenAI SDK adapter — bypasses signal's dynamic
// `await import('openai')` which Vite can't resolve at runtime
// from inside the workspace-linked signal/dist bundle.
//
// We import the SDK statically (Vite handles this fine), build
// a real client per provider, and pass it to signal via the
// `client` config option. Signal's openai-compatible adapter
// then skips its own dynamic loadSdk call and uses our client
// directly.
//
// This is also how a real consumer would inject their own
// pre-configured OpenAI client (e.g. with custom fetch, logging,
// or middleware) — the showroom just happens to need it for
// dev-server bundler reasons too.
// ═══════════════════════════════════════════════════════════

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
