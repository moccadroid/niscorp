import type { ProviderAdapter } from '../types';
import { SignalError, ErrorCode } from '../errors';

export type GoogleConfig = {
  apiKey: string;
  client?: unknown;
};

export const createGoogleAdapter = async (
  _config: GoogleConfig,
): Promise<ProviderAdapter> => {
  // Stub — Google adapter to be implemented
  throw new SignalError(
    'Google adapter is not yet implemented. Use openai-compatible with OpenRouter for Google models.',
    ErrorCode.PROVIDER_ERROR,
  );
};
