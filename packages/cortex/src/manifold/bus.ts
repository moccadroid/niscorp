// ═══════════════════════════════════════════════════════════
// Bus — wildcard pub/sub with waitFor
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §3.2. The bus is the substrate. Every state change
// emits. Sync APIs ride on top via waitFor.
//
// Implementation notes:
//   - Handlers are called in registration order (DESIGN.md §8.1).
//   - Errors in handlers do not crash the bus — they are caught,
//     logged, and re-emitted on cortex.error (DESIGN.md §11.5).
//   - Slow handlers do not block the dispatcher: handler invocation
//     is fire-and-forget. Async handlers are awaited only inside
//     their own scope; their rejections are caught and surfaced.
//   - waitFor takes O(matching subscriptions) per emit, same as on().
//
// We do NOT use a class. Factory + closed-over state per STYLE_GUIDE.

import type { Bus, BusEvent, BusHandler, EventMeta, Unsubscribe, WaitForOptions } from '../types';
import { compileTopicPattern } from '../utils/wildcard';
import { newCorrelationId, newEventId } from '../utils/id';
import { CortexTopics } from '../topics';

type Subscription = {
  id: string;
  pattern: string;
  regex: RegExp;
  handler: BusHandler;
};

export type CreateBusOptions = {
  /**
   * Called when a handler throws or rejects. Defaults to a no-op
   * (the bus also re-emits cortex.error so subscribers can react).
   */
  onHandlerError?: (error: unknown, event: BusEvent) => void;
};

export const createBus = (options: CreateBusOptions = {}): Bus => {
  const subscriptions: Subscription[] = [];
  const onHandlerError = options.onHandlerError ?? (() => {});

  // Suppresses recursive error emission when a cortex.error handler
  // itself throws. Without this, a buggy handler causes an infinite loop.
  let emittingError = false;

  const dispatchToHandlers = (event: BusEvent): void => {
    // Snapshot the subscriber list at emit time so a handler that
    // unsubscribes (or registers a new one) does not affect this emit.
    const snapshot = subscriptions.slice();
    for (const sub of snapshot) {
      if (!sub.regex.test(event.topic)) continue;
      try {
        const result = sub.handler(event);
        if (result instanceof Promise) {
          result.catch((error: unknown) => handleHandlerError(error, event));
        }
      } catch (error) {
        handleHandlerError(error, event);
      }
    }
  };

  const emit = (topic: string, payload: unknown, metaPartial?: Partial<EventMeta>): string => {
    const correlationId = metaPartial?.correlationId ?? newCorrelationId();
    const meta: EventMeta = {
      timestamp: metaPartial?.timestamp ?? Date.now(),
      correlationId,
      ...(metaPartial?.causationId !== undefined && { causationId: metaPartial.causationId }),
      ...(metaPartial?.workflowId !== undefined && { workflowId: metaPartial.workflowId }),
    };
    dispatchToHandlers({ topic, payload, meta });
    return correlationId;
  };

  const handleHandlerError = (error: unknown, event: BusEvent): void => {
    onHandlerError(error, event);
    if (emittingError) return;
    if (event.topic === CortexTopics.error) return;
    emittingError = true;
    try {
      emit(CortexTopics.error, {
        code: 'unknown',
        message: error instanceof Error ? error.message : String(error),
        source: { topic: event.topic },
      }, {
        correlationId: event.meta.correlationId,
        causationId: event.meta.correlationId,
        ...(event.meta.workflowId !== undefined && { workflowId: event.meta.workflowId }),
      });
    } finally {
      emittingError = false;
    }
  };

  const on = (pattern: string, handler: BusHandler): Unsubscribe => {
    const sub: Subscription = {
      id: newEventId(),
      pattern,
      regex: compileTopicPattern(pattern),
      handler,
    };
    subscriptions.push(sub);
    return () => {
      const idx = subscriptions.findIndex((s) => s.id === sub.id);
      if (idx >= 0) subscriptions.splice(idx, 1);
    };
  };

  const waitFor = (pattern: string, opts: WaitForOptions = {}): Promise<BusEvent> =>
    new Promise<BusEvent>((resolve, reject) => {
      let settled = false;
      let unsubscribe: Unsubscribe = () => {};
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      let abortListener: (() => void) | undefined;

      const cleanup = (): void => {
        unsubscribe();
        if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
        if (abortListener && opts.signal) opts.signal.removeEventListener('abort', abortListener);
      };

      unsubscribe = on(pattern, (event) => {
        if (settled) return;
        if (opts.filter && !opts.filter(event)) return;
        settled = true;
        cleanup();
        resolve(event);
      });

      if (opts.timeoutMs !== undefined) {
        timeoutHandle = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(`waitFor(${pattern}) timed out after ${opts.timeoutMs}ms`));
        }, opts.timeoutMs);
      }

      if (opts.signal) {
        if (opts.signal.aborted) {
          settled = true;
          cleanup();
          reject(new Error(`waitFor(${pattern}) aborted`));
          return;
        }
        abortListener = (): void => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(`waitFor(${pattern}) aborted`));
        };
        opts.signal.addEventListener('abort', abortListener);
      }
    });

  return { emit, on, waitFor };
};
