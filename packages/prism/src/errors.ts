// ═══════════════════════════════════════════════════════════
// Error Codes
// ═══════════════════════════════════════════════════════════

export const ErrorCode = {
  SCHEMA: 'E_SCHEMA',
  MISSING_PATH: 'E_MISSING_PATH',
  TYPE: 'E_TYPE',
  DIVISION_BY_ZERO: 'E_DIVISION_BY_ZERO',
  DATE_INVALID: 'E_DATE_INVALID',
  VAR_NOT_FOUND: 'E_VAR_NOT_FOUND',
  NODE_SHAPE: 'E_NODE_SHAPE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ═══════════════════════════════════════════════════════════
// Error Context
// ═══════════════════════════════════════════════════════════

export type PrismErrorContext = {
  op?: string;
  path?: string;
  details?: Record<string, unknown>;
};

// ═══════════════════════════════════════════════════════════
// Error Class
// ═══════════════════════════════════════════════════════════

export class PrismError extends Error {
  readonly code: ErrorCode;
  readonly context: PrismErrorContext | undefined;

  constructor(message: string, code: ErrorCode, context?: PrismErrorContext) {
    super(message);
    this.name = 'PrismError';
    this.code = code;
    this.context = context;
  }
}
