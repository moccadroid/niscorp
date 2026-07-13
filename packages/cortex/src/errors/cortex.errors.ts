// ═══════════════════════════════════════════════════════════
// Cortex error model
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §9:
//   - Programmer errors throw (caller called the API wrong; bug)
//   - Runtime conditions return RunResult / Result with a CortexError
//   - Tool failures are observations, not exceptions
//
// Per STYLE_GUIDE.md: no classes. CortexError is a typed object,
// not an Error subclass. The throw helper wraps it in a real Error
// for stack-trace purposes.

import type { CortexError, ErrorCode, Result, StopReason } from '../types';

export type { CortexError, ErrorCode };

export type ErrorContext = {
  runId: string;
  agentPath: ReadonlyArray<string>;
  stop?: StopReason;
  lastOutput?: unknown;
  cause?: unknown;
};

export const makeError = (code: ErrorCode, message: string, context: ErrorContext): CortexError => ({
  code,
  message,
  runId: context.runId,
  agentPath: context.agentPath,
  ...(context.stop !== undefined && { stop: context.stop }),
  ...(context.lastOutput !== undefined && { lastOutput: context.lastOutput }),
  ...(context.cause !== undefined && { cause: context.cause }),
});

// ───────────────────────────────────────────────────────────
// Programmer-error helper — throws a real Error
// ───────────────────────────────────────────────────────────

export const throwConfig: (message: string) => never = (message) => {
  throw new Error(`[cortex:config] ${message}`);
};

// ───────────────────────────────────────────────────────────
// Result helpers
// ───────────────────────────────────────────────────────────

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = <T = never>(error: CortexError): Result<T> => ({ ok: false, error });
