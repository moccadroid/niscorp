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

export const throwConfig: (message: string) => never = (message) => {
  throw new Error(`[cortex:config] ${message}`);
};

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = <T = never>(error: CortexError): Result<T> => ({ ok: false, error });
