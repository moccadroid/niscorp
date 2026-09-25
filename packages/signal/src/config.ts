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
  // A provider outside the registry states what it does itself — the only
  // place capabilities are declared rather than looked up. Unstated fields are
  // the all-false floor.
  capabilities?: Partial<Capabilities>;
  // Wire strategy ids (see src/wire/strategies.ts), like a registry entry's.
  wire?: string[];
};

// A decision provider by base URL — a self-hosted one, or the fake a check runs.
// It names its protocol and nothing else: it has no chat capabilities to declare.
export type CustomDecisionProviderConfig = CustomProviderBase & {
  adapter: 'systemone';
};

export type CustomProviderConfig = CustomChatProviderConfig | CustomDecisionProviderConfig;
