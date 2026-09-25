import type { EndpointCapabilities, ModelCapabilities, ReasoningEffort } from './types';

// ═══════════════════════════════════════════════════════════
// Registry — two records, two owners
// ═══════════════════════════════════════════════════════════
//
// `providerRegistry` says what an ENDPOINT is and does, for every model behind
// it: where it lives, which key opens it, which adapter speaks to it, and the
// endpoint-level capabilities (types.ts EndpointCapabilities).
//
// `modelRegistry` says what one MODEL does on one provider, as measured by
// scripts/probe-model.ts: the model-level capabilities (ModelCapabilities),
// the reasoning efforts the endpoint accepts for it, and the day that was
// measured. Keyed `provider/model id` — the same model behind two providers is
// two rows, because what it does depends on who serves it.
//
// The rules that keep this from rotting:
//   - a row is PASTED from the probe's output, never typed; `verified` is the
//     day the probe ran;
//   - every field is stated — no row inherits from another, and the two record
//     types share no field, so a client's capabilities are a join, not a merge
//     where something silently wins;
//   - a model with no row is not guessed at: it gets UNMEASURED_MODEL, the
//     least a model can do, and describe() says it was not measured;
//   - apps do not keep capability tables of their own. A fact about a model is
//     a row here.
// test/registry.test.ts holds the invariants.

type ProviderEntryBase = {
  id: string;
  baseUrl: string;
  envKey: string;
  defaultModel: string;
};

export type ChatProviderEntry = ProviderEntryBase & {
  adapter: 'openai-compatible' | 'anthropic' | 'google';
  endpoint: EndpointCapabilities;
  // Wire strategies (src/wire/strategies.ts) — provider-specific
  // recovery/normalization, selected by id. The default repair ladder
  // runs everywhere; this list is only what is true of THIS provider.
  wire?: string[];
  // EXTRA REQUEST PARAMS THAT ASK THIS PROVIDER TO STREAM ITS REASONING.
  // Merged into a STREAMING request, and only when the caller set
  // `reasoningEffort` — so a plain call, or a call to a non-reasoning model on
  // this provider, is untouched. That opt-in is load-bearing: Groq's
  // `reasoning_format` 400s on its non-reasoning models, so it must not ride
  // every request. First-party, like `baseUrl` and `wire`: maintainer-authored
  // constants reviewed in code, not an untrusted declaration.
  reasoningRequest?: Record<string, unknown>;
};

// A decision provider has no chat, so it has none of chat's capabilities, wire
// strategies or reasoning params to declare. The adapter it names IS what it
// can do.
export type DecisionProviderEntry = ProviderEntryBase & {
  adapter: 'systemone';
};

export type ProviderEntry = ChatProviderEntry | DecisionProviderEntry;

export type ModelEntry = {
  capabilities: ModelCapabilities;
  // The `reasoning_effort` values the endpoint ACCEPTS for this model. Empty =
  // it takes none; a client that sets one is refused at construction.
  reasoningEfforts: readonly ReasoningEffort[];
  // YYYY-MM-DD — the day scripts/probe-model.ts measured this row.
  verified: string;
};

export const providerRegistry: Record<string, ProviderEntry> = {
  groq: {
    id: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    defaultModel: 'qwen/qwen3.8-27b',
    endpoint: {
      nativeTools: true,
      nativeJsonMode: true,
      // Groq validates tool args server-side (tool_use_failed 400s).
      validatesToolArgs: true,
      supportsEmbedding: false,
    },
    adapter: 'openai-compatible',
    // tool_use_failed / json_validate_failed 400s carry the model's
    // attempt in failed_generation — recover and route it.
    wire: ['failed-generation'],
    // Reasoning models stream their trace only when asked to parse it out;
    // `reasoning_format` is rejected on the non-reasoning ones, which is why
    // this is opt-in (see reasoningRequest above).
    reasoningRequest: { reasoning_format: 'parsed' },
  },
  openai: {
    id: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    endpoint: {
      nativeTools: true,
      nativeJsonMode: true,
      validatesToolArgs: false,
      supportsEmbedding: true,
    },
    adapter: 'openai-compatible',
    // 4o-era models occasionally emit JSONL where one value was asked
    // for; the acceptance gate decides, so this can never misfire.
    wire: ['jsonl-lines'],
  },
  openrouter: {
    id: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'openai/gpt-4o',
    endpoint: {
      nativeTools: true,
      nativeJsonMode: true,
      validatesToolArgs: false,
      supportsEmbedding: false,
    },
    adapter: 'openai-compatible',
    // OpenRouter unifies reasoning across the models it routes; `enabled` turns
    // the trace on for those that have one and is ignored by those that don't.
    reasoningRequest: { reasoning: { enabled: true } },
  },
  anthropic: {
    id: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-4-20250514',
    endpoint: {
      nativeTools: true,
      nativeJsonMode: true,
      validatesToolArgs: false,
      supportsEmbedding: false,
    },
    adapter: 'anthropic',
  },
  google: {
    id: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    envKey: 'GOOGLE_API_KEY',
    defaultModel: 'gemini-2.0-flash',
    endpoint: {
      nativeTools: true,
      nativeJsonMode: true,
      validatesToolArgs: false,
      supportsEmbedding: false,
    },
    adapter: 'google',
  },
  typesafe: {
    id: 'typesafe',
    baseUrl: 'https://api.typesafe.ai/v1',
    envKey: 'TYPESAFE_API_KEY',
    // The moving alias. A caller that records calibration against a model pins
    // a version (`jev-1.13.0`) with `.model()`.
    defaultModel: 'jev-latest',
    adapter: 'systemone',
  },
};

// Every row below is pasted from scripts/probe-model.ts, trailing comment and
// all. "nested: k of n" is the evidence behind manglesNestedToolArgs — one
// failing trial is enough to mark it.
//
// On OpenRouter, reasoningEfforts is what the proxy ACCEPTS, which is not what
// the routed model honours: it passes `reasoning_effort` through even to
// non-reasoning models (gpt-4o takes all seven). The check still prevents a
// 400; it cannot promise the effort does anything.
export const modelRegistry: Record<string, ModelEntry> = {
  // ── groq ──
  'groq/qwen/qwen3.8-27b': {
    capabilities: { nativeJsonSchema: false, toolsWithStructuredOutput: false, manglesNestedToolArgs: true, multimodal: true }, // nested: 3 of 20 trials failed
    reasoningEfforts: ['none', 'default', 'low', 'medium', 'high'],
    verified: '2026-09-24',
  },
  'groq/openai/gpt-oss-120b': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: false, manglesNestedToolArgs: true, multimodal: false }, // nested: 1 of 20 trials failed
    reasoningEfforts: ['low', 'medium', 'high'],
    verified: '2026-09-24',
  },
  'groq/openai/gpt-oss-20b': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: false, manglesNestedToolArgs: true, multimodal: false }, // nested: 6 of 20 trials failed
    reasoningEfforts: ['low', 'medium', 'high'],
    verified: '2026-09-24',
  },
  // ── openai ──
  'openai/gpt-4o': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: true }, // nested: 0 of 20 trials failed
    reasoningEfforts: [],
    verified: '2026-09-24',
  },
  'openai/gpt-4o-mini': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: true }, // nested: 0 of 20 trials failed
    reasoningEfforts: [],
    verified: '2026-09-24',
  },
  'openai/gpt-4.1-mini': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: true }, // nested: 0 of 20 trials failed
    reasoningEfforts: [],
    verified: '2026-09-24',
  },
  // ── openrouter ──
  'openrouter/qwen/qwen3.8-27b': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: true }, // nested: 0 of 20 trials failed
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    verified: '2026-09-24',
  },
  'openrouter/openai/gpt-4o': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: true }, // nested: 0 of 20 trials failed
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    verified: '2026-09-24',
  },
  'openrouter/openai/gpt-4o-mini': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: true }, // nested: 0 of 20 trials failed
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    verified: '2026-09-24',
  },
  'openrouter/openai/gpt-oss-120b': {
    capabilities: { nativeJsonSchema: false, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: false }, // nested: 0 of 20 trials failed
    reasoningEfforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    verified: '2026-09-24',
  },
  'openrouter/z-ai/glm-5.2': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: true, multimodal: false }, // nested: 1 of 20 trials failed
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    verified: '2026-09-24',
  },
  'openrouter/openai/gpt-5.6-luna': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: true }, // nested: 0 of 20 trials failed
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    verified: '2026-09-24',
  },
  'openrouter/openai/gpt-oss-20b': {
    capabilities: { nativeJsonSchema: false, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: false }, // nested: 0 of 20 trials failed
    reasoningEfforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    verified: '2026-09-24',
  },
  'openrouter/meta-llama/llama-3.3-70b-instruct': {
    capabilities: { nativeJsonSchema: false, toolsWithStructuredOutput: true, manglesNestedToolArgs: true, multimodal: false }, // nested: 9 of 20 trials failed
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    verified: '2026-09-24',
  },
};

// WHAT AN UNMEASURED MODEL IS ASSUMED TO DO: the least. No grammar, no
// structured output beside tools, and a tool channel it is not trusted with —
// so its output rides the content channel (`emit`), which every model can do.
export const UNMEASURED_MODEL: ModelCapabilities = {
  nativeJsonSchema: false,
  toolsWithStructuredOutput: false,
  manglesNestedToolArgs: true,
  multimodal: false,
};

export const modelKey = (provider: string, model: string): string => `${provider}/${model}`;

export const modelEntry = (provider: string, model: string): ModelEntry | undefined => modelRegistry[modelKey(provider, model)];

export const resolveApiKey = (envKey: string, explicitKey?: string): string | undefined =>
  explicitKey ?? (typeof process !== 'undefined' ? process.env?.[envKey] : undefined);

// The row for a provider that generates text — the one a capability-aware
// consumer means when it reads `endpoint`, `wire` or `reasoningRequest`.
// Undefined for an unknown id and for a decision provider, which has none.
export const chatProviderEntry = (id: string): ChatProviderEntry | undefined => {
  const entry = providerRegistry[id];
  return entry === undefined || entry.adapter === 'systemone' ? undefined : entry;
};
