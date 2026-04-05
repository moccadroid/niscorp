import type { ZodType } from 'zod';
import type { Message, Tool, SignalOptions, Capabilities } from './types';

// ═══════════════════════════════════════════════════════════
// Signal Configuration (immutable)
// ═══════════════════════════════════════════════════════════

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
  readonly capabilities?: Partial<Capabilities>;
  readonly onRetry?: (error: Error, attempt: number) => void;
  readonly onToolCall?: (name: string, args: unknown) => void;
};

export type CustomProviderConfig = {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  adapter?: 'openai-compatible' | 'anthropic' | 'google';
  capabilities?: Partial<Capabilities>;
};
