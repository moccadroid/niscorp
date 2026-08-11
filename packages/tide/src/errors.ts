export type TideErrorCode =
  | 'invalid_reflex'
  | 'invalid_fact'
  | 'duplicate_reflex'
  | 'unknown_reflex'
  | 'unknown_effect'
  | 'unguarded_cycle'
  | 'duplicate_unit'
  | 'no_transform'
  | 'store';

export class TideError extends Error {
  readonly code: TideErrorCode;
  readonly details?: unknown;

  constructor(code: TideErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'TideError';
    this.code = code;
    this.details = details;
  }
}

export const isTideError = (value: unknown): value is TideError => value instanceof TideError;
