export type StrataErrorCode =
  | 'INVALID_SEQUENCE'
  | 'EDITED'
  | 'TOO_NEW'
  | 'UNKNOWN_DEPENDENCY'
  | 'CYCLE'
  | 'PENDING'
  | 'STEP_FAILED'
  | 'DOES_NOT_FIT'
  | 'NO_TRANSACTION'
  | 'UNKNOWN_KIND'
  | 'WRONG_OWNER';

export class StrataError extends Error {
  readonly code: StrataErrorCode;
  readonly details: readonly string[];

  constructor(code: StrataErrorCode, message: string, details: readonly string[] = [], options?: { cause?: unknown }) {
    super(details.length > 0 ? `${message}\n${details.map((d) => `  ${d}`).join('\n')}` : message, options);
    this.name = 'StrataError';
    this.code = code;
    this.details = details;
  }
}
