import type { z } from 'zod';
import type { StreamError, ValidationMode, ConstraintsMode } from './validator';

// ═══════════════════════════════════════════════════════════
// Public types
// ═══════════════════════════════════════════════════════════

export type Stream<T> = {
  write: (chunk: string) => void;
  close: () => void;
  destroy: () => void;
  current: () => T;
  final: () => Promise<T>;
  on: (listener: (value: T) => void) => () => void;
  onFinal: (listener: (value: T) => void) => () => void;
  onError: (listener: (error: StreamError) => void) => () => void;
  select: <P = unknown>(path: string) => Stream<P>;
};

export type CreateStreamOptions<T> = {
  schema: z.ZodType<T>;
  initial?: T;
  // 'trust'   — no validation (debug only)
  // 'recover' — kind-check; on violation, fall back to prior value, keep streaming
  // 'strict'  — kind-check; on violation, halt the stream
  // Default: 'recover'
  mode?: ValidationMode;
  // 'kind'     — only kind-check at value-open (default)
  // 'finalize' — also run sub-schema safeParse when each path closes
  // Default: 'kind'
  constraints?: ConstraintsMode;
};

export type { StreamError, StreamErrorPhase, ValidationMode, ConstraintsMode } from './validator';

// ═══════════════════════════════════════════════════════════
// Internal types
// ═══════════════════════════════════════════════════════════

export type Listener<T> = (value: T) => void;

export type ParserEvent =
  | { type: 'enterObject'; path: string }
  | { type: 'leaveObject'; path: string }
  | { type: 'enterArray'; path: string }
  | { type: 'leaveArray'; path: string }
  | { type: 'enterKey'; path: string; key: string }
  | { type: 'enterIndex'; path: string; index: number }
  | { type: 'valueComplete'; path: string };

// ───────────────────────────────────────────────────────────
// FinalState — deferred value resolution
// ───────────────────────────────────────────────────────────

export type PendingFinal<T> = {
  resolved: false;
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

export type ResolvedFinal<T> = {
  resolved: true;
  value: T;
};

export type FinalState<T> = PendingFinal<T> | ResolvedFinal<T>;

// Promise executor runs synchronously — resolve/reject are assigned
// before the constructor returns. No-op defaults satisfy the compiler
// without non-null assertions.
export const createPendingFinal = <T>(): PendingFinal<T> => {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { resolved: false, promise, resolve, reject };
};

// ───────────────────────────────────────────────────────────
// SelectedStream dependency bag
// ───────────────────────────────────────────────────────────

export type SelectedStreamDeps = {
  path: string;
  getRootValue: () => unknown;
  isTerminal: () => boolean;
  isPathFinal: () => boolean;
  onRootChange: (listener: () => void) => () => void;
  onRootFinalize: (listener: () => void) => () => void;
  onRootError: (listener: (error: StreamError) => void) => () => void;
  resolveSubSelect: (fullPath: string) => Stream<unknown>;
};
