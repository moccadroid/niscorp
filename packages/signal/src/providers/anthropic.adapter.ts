import type { ProviderAdapter } from '../types';
import { SignalError, ErrorCode } from '../errors';

export type AnthropicConfig = {
  apiKey: string;
  client?: unknown;
};

export const createAnthropicAdapter = async (
  _config: AnthropicConfig,
): Promise<ProviderAdapter> => {
  // Stub — Anthropic adapter to be implemented
  throw new SignalError(
    'Anthropic adapter is not yet implemented. Use openai-compatible with OpenRouter for Anthropic models.',
    ErrorCode.PROVIDER_ERROR,
  );
};
