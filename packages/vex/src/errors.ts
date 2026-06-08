import type { QueryErrorCode } from './schemas/request.schema.js';

export class VexError extends Error {
  readonly code: QueryErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: QueryErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'VexError';
    this.code = code;
    this.details = details;
  }
}
