// ═══════════════════════════════════════════════════════════
// Event channel — per-run emitter + AsyncIterable view
// ═══════════════════════════════════════════════════════════
//
// Listener callbacks fan out synchronously (multi-consumer);
// the AsyncIterable view buffers so a slow consumer never loses
// events (single-consumer, which is the typical UI case).
// Listener errors are swallowed per handler — an observer must
// never break the run.

import type { Unsubscribe } from '../types';
import type { CortexEvent, CortexEventBody } from './types';

export type EventChannel = {
  emit: (body: CortexEventBody) => void;
  // Re-push a child run's event verbatim (its own runId/agentPath/seq),
  // so one subscription on the parent sees the whole tree. Used by asTool.
  forward: (event: CortexEvent) => void;
  onEvent: (listener: (event: CortexEvent) => void) => Unsubscribe;
  events: AsyncIterable<CortexEvent>;
  close: () => void;
};

export const createEventChannel = (
  runId: string,
  agentPath: ReadonlyArray<string>,
): EventChannel => {
  const listeners: Array<(event: CortexEvent) => void> = [];
  const buffer: CortexEvent[] = [];
  let closed = false;
  let seq = 0;
  let wake: (() => void) | undefined;

  const push = (event: CortexEvent): void => {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // Observer errors never break the run.
      }
    }
    buffer.push(event);
    wake?.();
  };

  const emit = (body: CortexEventBody): void => {
    if (closed) return;
    seq += 1;
    push({ runId, agentPath, seq, ts: Date.now(), ...body });
  };

  const forward = (event: CortexEvent): void => {
    if (closed) return;
    push(event);
  };

  const onEvent = (listener: (event: CortexEvent) => void): Unsubscribe => {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    };
  };

  const close = (): void => {
    closed = true;
    wake?.();
  };

  const events: AsyncIterable<CortexEvent> = {
    [Symbol.asyncIterator]: (): AsyncIterator<CortexEvent> => {
      let cursor = 0;
      return {
        next: async (): Promise<IteratorResult<CortexEvent>> => {
          while (cursor >= buffer.length) {
            if (closed) return { done: true, value: undefined };
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
            wake = undefined;
          }
          const value = buffer[cursor];
          cursor += 1;
          if (value === undefined) return { done: true, value: undefined };
          return { done: false, value };
        },
      };
    },
  };

  return { emit, forward, onEvent, events, close };
};
