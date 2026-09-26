// Every refusal strata makes, by name. The message is a sentence for a person;
// the code is for the program that has to decide what to do about it.
export type StrataErrorCode =
  // A sequence failed its schema, or two sequences share an id.
  | 'INVALID_SEQUENCE'
  // An applied migration's steps no longer match what the code says it ran.
  | 'EDITED'
  // The database has migrations of a sequence this code does not know yet —
  // it was migrated by newer code.
  | 'TOO_NEW'
  // A `dependsOn` names a migration nobody provides and the ledger lacks.
  | 'UNKNOWN_DEPENDENCY'
  // Pending migrations wait on each other.
  | 'CYCLE'
  // Verify mode found work to do.
  | 'PENDING'
  // A step threw; the whole run was rolled back.
  | 'STEP_FAILED'
  // The pool cannot hold one connection for a transaction.
  | 'NO_TRANSACTION';

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
