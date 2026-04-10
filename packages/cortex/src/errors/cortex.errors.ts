// ═══════════════════════════════════════════════════════════
// Cortex error model
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §11:
//   - Programmer errors throw (caller called the API wrong; bug)
//   - Runtime conditions return Result<T> with a CortexError (caller decides)
//   - Observations carry errors, not exceptions
//
// Per STYLE_GUIDE.md: no classes. CortexError is a typed object,
// not an Error subclass. The throw helper wraps it in a real Error
// for stack-trace purposes.

import type { CortexError, ErrorCode, Result } from '../types';

export type { CortexError, ErrorCode };

export const makeError = (
  code: ErrorCode,
  message: string,
  context?: { workflowId?: string; agentId?: string; cause?: unknown },
): CortexError => ({
  code,
  message,
  ...(context?.workflowId !== undefined && { workflowId: context.workflowId }),
  ...(context?.agentId !== undefined && { agentId: context.agentId }),
  ...(context?.cause !== undefined && { cause: context.cause }),
});

// ───────────────────────────────────────────────────────────
// Programmer-error helpers — these throw a real Error
// ───────────────────────────────────────────────────────────

const formatError = (error: CortexError): string => {
  const tags: string[] = [error.code];
  if (error.agentId) tags.push(`agent=${error.agentId}`);
  if (error.workflowId) tags.push(`workflow=${error.workflowId}`);
  return `[cortex:${tags.join(' ')}] ${error.message}`;
};

// Note: explicit `(error) => never` annotation form is required so
// TypeScript narrows correctly at call sites. The arrow-with-`: never`
// inline return type does not always propagate through const assignment.
export const throwCortex: (error: CortexError) => never = (error) => {
  const wrapped = new Error(formatError(error));
  Object.assign(wrapped, { cortex: error });
  throw wrapped;
};

// ───────────────────────────────────────────────────────────
// Result helpers
// ───────────────────────────────────────────────────────────

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = <T = never>(error: CortexError): Result<T> => ({ ok: false, error });

export const isOk = <T>(result: Result<T>): result is { ok: true; data: T } => result.ok;
export const isErr = <T>(result: Result<T>): result is { ok: false; error: CortexError } => !result.ok;
