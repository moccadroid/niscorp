import OpenAI from 'openai';
import { createSignal, type Capabilities } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import type { ReasoningEffort } from './effort';

// ═══════════════════════════════════════════════════════════
// The OpenRouter LLM adapter.
//
// A sibling of the Groq adapter (llm/groq.ts): same shape, its own key slot, a
// different provider. Used to run the whole pipeline (Ray, Vex's query/mapping
// agents, the action builder) on a stronger model. OpenAI-compatible, so we
// inject a statically-built OpenAI SDK client (Vite can't resolve Signal's
// dynamic `import('openai')` from the workspace dist).
//
// One endpoint, many models — so the MODELS live here, each with a factory that
// names it and states what is true of it. Signal's `openrouter` registry entry
// is pessimistic on purpose (capabilities are a property of the routed model,
// not of the proxy); a model that does better says so at its own factory.
// ═══════════════════════════════════════════════════════════

export const OPENROUTER_ENV_KEY = 'OPENROUTER_API_KEY';

export const GLM_MODEL = 'z-ai/glm-5.2';

// Ox Alpha — a reasoning model built for long-horizon agentic work: 1M context,
// 131k completion, free while it sits behind the `stealth/` namespace (checked
// against /api/v1/models on 2026-08-21 — pricing 0/0). Reasoning is mandatory
// and defaults to MAX effort, so it thinks before every step by construction.
export const OX_ALPHA_MODEL = 'stealth/ox-alpha';

// GPT-5.6 Luna — a mid-price frontier model: 1M context, six reasoning rungs,
// $0.20/$1.20 per Mtok. Probed 2026-08-22 like the others: `tools` +
// `response_format` in one request, nested arrays in tool args arrive clean.
export const LUNA_MODEL = 'openai/gpt-5.6-luna';


// Measured against the live endpoint, not assumed: it accepts `tools` and
// `response_format` in ONE request, and emits nested arrays inside tool-call
// arguments as real JSON — the GLM mangling that sent the builder back to Groq
// is absent here, so a structured payload may ride the tool channel.
const OX_ALPHA_CAPABILITIES: Partial<Capabilities> = {
  toolsWithStructuredOutput: true,
  manglesNestedToolArgs: false,
};

const LUNA_CAPABILITIES: Partial<Capabilities> = {
  toolsWithStructuredOutput: true,
  manglesNestedToolArgs: false,
};


const openRouter = (apiKey: string): OpenAI =>
  new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    dangerouslyAllowBrowser: true,
    // OpenRouter attribution headers (optional, for its dashboard/rankings).
    defaultHeaders: { 'HTTP-Referer': 'https://relay.local', 'X-Title': 'Relay' },
  });

export const createOpenRouterClient = (apiKey: string, reasoningEffort?: ReasoningEffort): SignalClient =>
  createSignal('openrouter', {
    client: openRouter(apiKey),
    model: GLM_MODEL,
    apiKey,
    ...(reasoningEffort !== undefined && { options: { reasoningEffort } }),
  });

// Effort is a BUDGET, not a quality dial you always max. Reasoning is mandatory
// on this model and it defaults to `max` — measured on one representative
// prompt: low 7.9s, high 16.5s, max 18.7s, and the extra is nearly all thinking
// tokens. Against the architect's knowledge base `max` cost ~33s per agent step
// and overran the 6m stop before the agent was done; `high` finished the same
// build in 3m55s, `low` in 2m42s. Which rung an agent runs at is now the seam's
// business (server/llm/index.ts), set per agent in Settings.
export const createOxAlphaClient = (apiKey: string, reasoningEffort?: ReasoningEffort): SignalClient =>
  createSignal('openrouter', {
    client: openRouter(apiKey),
    model: OX_ALPHA_MODEL,
    apiKey,
    capabilities: OX_ALPHA_CAPABILITIES,
    ...(reasoningEffort !== undefined && { options: { reasoningEffort } }),
  });

// The OpenRouter API key — server configuration (.env), its own variable
// (distinct from the Groq key).
export const getKey = (): string | undefined => {
  const k = process.env[OPENROUTER_ENV_KEY];
  return k === undefined || k === '' ? undefined : k;
};

export const createLunaClient = (apiKey: string, reasoningEffort?: ReasoningEffort): SignalClient =>
  createSignal('openrouter', {
    client: openRouter(apiKey),
    model: LUNA_MODEL,
    apiKey,
    capabilities: LUNA_CAPABILITIES,
    ...(reasoningEffort !== undefined && { options: { reasoningEffort } }),
  });
