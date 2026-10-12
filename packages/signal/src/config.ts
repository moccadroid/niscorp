import type { ZodType } from 'zod';
import type { Message, Tool, SignalOptions, Capabilities } from './types';

export type SignalConfig = {
  readonly provider: string | CustomProviderConfig;
  readonly apiKey?: string;
  readonly model?: string;
  readonly client?: unknown;
  readonly systemPrompt?: string;
  readonly history?: Message[];
  readonly schema?: ZodType;
  readonly tools?: Tool[];
  readonly retries?: number;
  readonly options?: SignalOptions;
  readonly onRetry?: (error: Error, attempt: number) => void;
  readonly onToolCall?: (name: string, args: unknown) => void;
};

type CustomProviderBase = {
  baseUrl: string;
  apiKey?: string;
  model?: string;
};

export type CustomChatProviderConfig = CustomProviderBase & {
  adapter?: 'openai-compatible' | 'anthropic' | 'google';
  capabilities?: Partial<Capabilities>;
  wire?: string[];
};

export type CustomDecisionProviderConfig = CustomProviderBase & {
  adapter: 'systemone';
};

export type CustomProviderConfig = CustomChatProviderConfig | CustomDecisionProviderConfig;
