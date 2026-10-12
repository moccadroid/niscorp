import type { QueryErrorCode } from './schemas/request.schema.js';

// The CommonJS build gives each entry point its own copy of this class, and an
// app can load the ESM and CommonJS builds side by side, so `instanceof` fails
// across copies. Every copy marks its prototype under this process-wide key.
const VEX_ERROR = Symbol.for('@niscorp/vex:VexError');

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

Object.defineProperty(VexError.prototype, VEX_ERROR, { value: true });

export const isVexError = (err: unknown): err is VexError =>
  err instanceof VexError || (err instanceof Error && Reflect.get(err, VEX_ERROR) === true);
