import { performance } from 'node:perf_hooks';
import type { Limits } from './schema.js';
// Node timer representation, independent of task/resource policy.
export const MAX_NATIVE_TIMEOUT_MS = 2 ** 31 - 1;
export class OperationFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OperationFailure';
  }
}
export class RunControl extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RunControl';
  }
}
export interface Control {
  readonly signal: AbortSignal;
  check(): void;
  step(): void;
  items(count: number): void;
  depth(depth: number): void;
  wait<T>(work: () => T | Promise<T>): Promise<T>;
  close(): void;
}
export const createControl = (limits: Limits, external?: AbortSignal): Control => {
  const controller = new AbortController(),
    deadline = performance.now() + limits.maxActiveMs;
  const cancel = (): void => {
    controller.abort(new RunControl('CANCELLED', 'Run cancelled'));
  };
  external?.addEventListener('abort', cancel, { once: true });
  if (external?.aborted) cancel();
  const expire = (): void => {
    controller.abort(new RunControl('DEADLINE', 'Run deadline exceeded'));
  };
  const timer = setTimeout(expire, limits.maxActiveMs);
  let steps = 0,
    items = 0;
  const check = (): void => {
    if (performance.now() >= deadline) expire();
    controller.signal.throwIfAborted();
  };
  return {
    signal: controller.signal,
    check,
    step(): void {
      check();
      if (++steps > limits.maxSteps) throw new RunControl('STEPS', 'Step limit exceeded');
    },
    items(count: number): void {
      check();
      items += count;
      if (items > limits.maxItems) throw new RunControl('ITEMS', 'Item limit exceeded');
    },
    depth(depth: number): void {
      check();
      if (depth > limits.maxDepth) throw new RunControl('DEPTH', 'Flow depth exceeded');
    },
    async wait<T>(work: () => T | Promise<T>): Promise<T> {
      check();
      let abort = (): void => {};
      const stopped = new Promise<never>((_, reject) => {
        abort = (): void => {
          reject(controller.signal.reason);
        };
        controller.signal.addEventListener('abort', abort, { once: true });
        if (controller.signal.aborted) abort();
      });
      try {
        const value = await Promise.race([Promise.resolve(work()), stopped]);
        check();
        return value;
      } finally {
        controller.signal.removeEventListener('abort', abort);
      }
    },
    close(): void {
      clearTimeout(timer);
      external?.removeEventListener('abort', cancel);
    },
  };
};
