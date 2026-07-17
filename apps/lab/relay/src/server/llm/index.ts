import type { SignalClient } from '@niscorp/cortex';
import { createGroqClient, getKey as groqGetKey } from './groq';
import { createOpenRouterClient, getKey as orGetKey } from './openrouter';

// ═══════════════════════════════════════════════════════════
// The LLM provider seam.
//
// Every call site (Ray, Vex's query/mapping agents, the action builder) imports
// the client + key helpers from HERE and never names a concrete provider — so
// switching the whole app's model is flipping the one PROVIDER variable below.
// Each adapter (./groq, ./openrouter) owns its own client factory and reads its
// own .env variable, so the two keys never collide. Keys are server
// configuration: agents run inside moss, nothing LLM-shaped reaches a browser.
// ═══════════════════════════════════════════════════════════

type Provider = 'groq' | 'openrouter';

type ProviderAdapter = {
  create: (apiKey: string) => SignalClient;
  getKey: () => string | undefined;
};

const ADAPTERS: Record<Provider, ProviderAdapter> = {
  groq: { create: createGroqClient, getKey: groqGetKey },
  openrouter: { create: createOpenRouterClient, getKey: orGetKey },
};

// Temporarily on groq: isolating whether the mangled tool-call args are
// GLM-specific (channel experiment, 2026-07-10). Flip back to compare.
const PROVIDER: Provider = 'groq';

export const createLlmClient: (apiKey: string) => SignalClient = ADAPTERS[PROVIDER].create;
export const getKey: () => string | undefined = ADAPTERS[PROVIDER].getKey;
