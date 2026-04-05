import type { z } from 'zod';
import type { Message, ProviderAdapter, ProviderRequest, ProviderResponse } from '../types';
import { SignalError, ErrorCode } from '../errors';

// ═══════════════════════════════════════════════════════════
// Validate + Retry Loop
// ═══════════════════════════════════════════════════════════

export type ValidateAndRetryConfig = {
  adapter: ProviderAdapter;
  request: ProviderRequest;
  schema: z.ZodType;
  retries: number;
  onRetry?: (error: Error, attempt: number) => void;
};

export type ValidateResult<T> = {
  parsed: T;
  content: string;
  responses: ProviderResponse[];
  retryCount: number;
};

export const validateAndRetry = async <T>(
  config: ValidateAndRetryConfig,
): Promise<ValidateResult<T>> => {
  const responses: ProviderResponse[] = [];
  const messages: Message[] = [...config.request.messages];

  for (let attempt = 0; attempt <= config.retries; attempt++) {
    const response = await config.adapter.chat({ ...config.request, messages });
    responses.push(response);

    // Try to parse JSON
    let json: unknown;
    try {
      json = JSON.parse(response.content);
    } catch {
      if (attempt >= config.retries) {
        throw new SignalError(
          `Response is not valid JSON after ${attempt + 1} attempts`,
          ErrorCode.VALIDATION_FAILED,
          { lastContent: response.content },
        );
      }
      config.onRetry?.(new Error('Response is not valid JSON'), attempt + 1);
      messages.push(
        { role: 'assistant', content: response.content },
        { role: 'user', content: 'Your response was not valid JSON. Please respond with valid JSON only.' },
      );
      continue;
    }

    // Validate with Zod
    const result = config.schema.safeParse(json);
    if (result.success) {
      return { parsed: result.data as T, content: response.content, responses, retryCount: attempt };
    }

    if (attempt >= config.retries) {
      throw new SignalError(
        `Response failed validation after ${attempt + 1} attempts`,
        ErrorCode.VALIDATION_FAILED,
        {
          issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          lastContent: response.content,
        },
      );
    }

    // Send validation errors back to model
    const errorDetails = result.error.issues
      .map((i) => `  ${i.path.join('.') || 'root'}: ${i.message}`)
      .join('\n');

    config.onRetry?.(new Error(`Validation failed: ${errorDetails}`), attempt + 1);
    messages.push(
      { role: 'assistant', content: response.content },
      { role: 'user', content: `Your response was valid JSON but failed validation:\n${errorDetails}\n\nPlease fix these issues and try again.` },
    );
  }

  // Should never reach here
  throw new SignalError('Validation retry loop exhausted', ErrorCode.MAX_RETRIES);
};
