import type { QueryErrorCode } from './schemas/request.schema.js';

// ONE CLASS, SEVERAL COPIES. The CommonJS build gives each entry point
// (`@niscorp/vex`, `/hono`, `/express`, `/agent`) its own copy of this class,
// and an app can load the ESM and CommonJS builds side by side — so an error
// thrown by an engine from one entry is not an `instanceof` the VexError
// another entry holds. Every copy puts the same mark on its prototype, under a
// key the whole process shares, and `isVexError` reads the mark. Wherever vex
// itself asks "is this one of ours", it asks that, never `instanceof`.
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

// On the prototype, not the instance: a subclass inherits it, and nothing an
// app prints, serializes or enumerates on an error changes.
Object.defineProperty(VexError.prototype, VEX_ERROR, { value: true });

export const isVexError = (err: unknown): err is VexError =>
  err instanceof VexError || (err instanceof Error && Reflect.get(err, VEX_ERROR) === true);
