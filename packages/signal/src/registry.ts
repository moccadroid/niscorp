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
