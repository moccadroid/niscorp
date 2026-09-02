import type { Capabilities } from './types';

// ═══════════════════════════════════════════════════════════
// Provider Registry
// ═══════════════════════════════════════════════════════════

export type ProviderEntry = {
  id: string;
  baseUrl: string;
  envKey: string;
  defaultModel: string;
  capabilities: Capabilities;
  adapter: 'openai-compatible' | 'anthropic' | 'google';
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

export const providerRegistry: Record<string, ProviderEntry> = {
  groq: {
    id: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    defaultModel: 'openai/gpt-oss-120b',
    capabilities: {
      // Groq does native tool calling (gpt-oss et al.) — but rejects
      // response_format combined with tools in one request, and
      // validates tool args server-side (tool_use_failed 400s).
      nativeTools: true,
      nativeJsonSchema: false,
      nativeJsonMode: true,
      toolsWithStructuredOutput: false,
      validatesToolArgs: true,
      // Observed 2026-07: gpt-oss-120b stringifies nested arrays inside
      // tool-call args ("children": "[{\"component\":...") while emitting
      // the same JSON cleanly as content. Structured payloads must ride
      // the content channel on this provider.
      manglesNestedToolArgs: true,
      multimodal: false,
      supportsEmbedding: false,
    },
    adapter: 'openai-compatible',
    // tool_use_failed / json_validate_failed 400s carry the model's
    // attempt in failed_generation — recover and route it.
    wire: ['failed-generation'],
    // gpt-oss and the other reasoning models stream their trace only when asked
    // to parse it out; `reasoning_format` is rejected on the non-reasoning ones,
    // which is why this is opt-in (see reasoningRequest above).
    reasoningRequest: { reasoning_format: 'parsed' },
  },
  openai: {
    id: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    capabilities: {
      nativeTools: true,
      nativeJsonSchema: true,
      nativeJsonMode: true,
      toolsWithStructuredOutput: true,
      validatesToolArgs: false,
      manglesNestedToolArgs: false,
      multimodal: true,
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
    capabilities: {
      nativeTools: true,
      nativeJsonSchema: true,
      nativeJsonMode: true,
      // Model-dependent through the proxy; default pessimistic. Override
      // via .capabilities() when the routed model supports the combo.
      toolsWithStructuredOutput: false,
      validatesToolArgs: false,
      manglesNestedToolArgs: false,
      multimodal: true,
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
    capabilities: {
      nativeTools: true,
      nativeJsonSchema: false,
      nativeJsonMode: true,
      toolsWithStructuredOutput: false,
      validatesToolArgs: false,
      manglesNestedToolArgs: false,
      multimodal: true,
      supportsEmbedding: false,
    },
    adapter: 'anthropic',
  },
  google: {
    id: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    envKey: 'GOOGLE_API_KEY',
    defaultModel: 'gemini-2.0-flash',
    capabilities: {
      nativeTools: true,
      nativeJsonSchema: false,
      nativeJsonMode: true,
      toolsWithStructuredOutput: false,
      validatesToolArgs: false,
      manglesNestedToolArgs: false,
      multimodal: true,
      supportsEmbedding: false,
    },
    adapter: 'google',
  },
};

export const resolveApiKey = (envKey: string, explicitKey?: string): string | undefined =>
  explicitKey ?? (typeof process !== 'undefined' ? process.env?.[envKey] : undefined);
