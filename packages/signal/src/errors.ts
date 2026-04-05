export const ErrorCode = {
  PROVIDER_NOT_FOUND: 'E_PROVIDER_NOT_FOUND',
  MISSING_API_KEY: 'E_MISSING_API_KEY',
  MISSING_MODEL: 'E_MISSING_MODEL',
  MISSING_SDK: 'E_MISSING_SDK',
  VALIDATION_FAILED: 'E_VALIDATION_FAILED',
  MAX_RETRIES: 'E_MAX_RETRIES',
  MAX_ITERATIONS: 'E_MAX_ITERATIONS',
  PROVIDER_ERROR: 'E_PROVIDER_ERROR',
  TOOL_NOT_FOUND: 'E_TOOL_NOT_FOUND',
  TOOL_EXECUTION: 'E_TOOL_EXECUTION',
  TOOL_VALIDATION: 'E_TOOL_VALIDATION',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class SignalError extends Error {
  readonly code: ErrorCode;
  readonly context?: Record<string, unknown>;

  constructor(message: string, code: ErrorCode, context?: Record<string, unknown>) {
    super(message);
    this.name = 'SignalError';
    this.code = code;
    this.context = context;
  }
}
