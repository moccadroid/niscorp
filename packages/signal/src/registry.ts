import type { EndpointCapabilities, ModelCapabilities, ReasoningEffort } from './types';

type ProviderEntryBase = {
  id: string;
  baseUrl: string;
  envKey: string;
  defaultModel: string;
};

export type ChatProviderEntry = ProviderEntryBase & {
  adapter: 'openai-compatible' | 'anthropic' | 'google';
  endpoint: EndpointCapabilities;
  wire?: string[];
  reasoningRequest?: Record<string, unknown>;
};

export type DecisionProviderEntry = ProviderEntryBase & {
  adapter: 'systemone';
};

export type ProviderEntry = ChatProviderEntry | DecisionProviderEntry;

export type ModelEntry = {
  capabilities: ModelCapabilities;
  reasoningEfforts: readonly ReasoningEffort[];
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
      validatesToolArgs: true,
      supportsEmbedding: false,
    },
    adapter: 'openai-compatible',
    wire: ['failed-generation'],
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
    defaultModel: 'jev-latest',
    adapter: 'systemone',
  },
};

// A row is the output of scripts/probe-model.ts, not typed by hand.
// On OpenRouter, reasoningEfforts is what the proxy accepts, not what the routed model
// honours: it passes `reasoning_effort` through even to non-reasoning models.
export const modelRegistry: Record<string, ModelEntry> = {
  'groq/qwen/qwen3.8-27b': {
    capabilities: { nativeJsonSchema: false, toolsWithStructuredOutput: false, manglesNestedToolArgs: true, multimodal: true },
    reasoningEfforts: ['none', 'default', 'low', 'medium', 'high'],
    verified: '2026-09-24',
  },
  'groq/openai/gpt-oss-120b': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: false, manglesNestedToolArgs: true, multimodal: false },
    reasoningEfforts: ['low', 'medium', 'high'],
    verified: '2026-09-24',
  },
  'groq/openai/gpt-oss-20b': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: false, manglesNestedToolArgs: true, multimodal: false },
    reasoningEfforts: ['low', 'medium', 'high'],
    verified: '2026-09-24',
  },
  'openai/gpt-4o': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: true },
    reasoningEfforts: [],
    verified: '2026-09-24',
  },
  'openai/gpt-4o-mini': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: true },
    reasoningEfforts: [],
    verified: '2026-09-24',
  },
  'openai/gpt-4.1-mini': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: true },
    reasoningEfforts: [],
    verified: '2026-09-24',
  },
  'openrouter/qwen/qwen3.8-27b': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: true },
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    verified: '2026-09-24',
  },
  'openrouter/openai/gpt-4o': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: true },
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    verified: '2026-09-24',
  },
  'openrouter/openai/gpt-4o-mini': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: true },
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    verified: '2026-09-24',
  },
  'openrouter/openai/gpt-oss-120b': {
    capabilities: { nativeJsonSchema: false, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: false },
    reasoningEfforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    verified: '2026-09-24',
  },
  'openrouter/z-ai/glm-5.2': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: true, multimodal: false },
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    verified: '2026-09-24',
  },
  'openrouter/openai/gpt-5.6-luna': {
    capabilities: { nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: true },
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    verified: '2026-09-24',
  },
  'openrouter/openai/gpt-oss-20b': {
    capabilities: { nativeJsonSchema: false, toolsWithStructuredOutput: true, manglesNestedToolArgs: false, multimodal: false },
    reasoningEfforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    verified: '2026-09-24',
  },
  'openrouter/meta-llama/llama-3.3-70b-instruct': {
    capabilities: { nativeJsonSchema: false, toolsWithStructuredOutput: true, manglesNestedToolArgs: true, multimodal: false },
    reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    verified: '2026-09-24',
  },
};

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

export const chatProviderEntry = (id: string): ChatProviderEntry | undefined => {
  const entry = providerRegistry[id];
  return entry === undefined || entry.adapter === 'systemone' ? undefined : entry;
};
