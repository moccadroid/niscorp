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
};

export const providerRegistry: Record<string, ProviderEntry> = {
  groq: {
    id: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    defaultModel: 'openai/gpt-oss-120b',
    capabilities: {
      nativeTools: false,
      nativeJsonSchema: false,  // model-dependent — llama models don't support it
      nativeJsonMode: true,
      multimodal: false,
    },
    adapter: 'openai-compatible',
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
      multimodal: true,
    },
    adapter: 'openai-compatible',
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
      multimodal: true,
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
      multimodal: true,
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
      multimodal: true,
    },
    adapter: 'google',
  },
};

export const resolveApiKey = (envKey: string, explicitKey?: string): string | undefined =>
  explicitKey ?? (typeof process !== 'undefined' ? process.env?.[envKey] : undefined);
