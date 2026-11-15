import type { Unsubscribe } from '../types';
import type { CortexEvent, CortexEventBody } from './types';

export type EventChannel = {
  emit: (body: CortexEventBody) => void;
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
  const waiting: Array<() => void> = [];
  const wakeAll = (): void => {
    for (const resolve of waiting.splice(0)) resolve();
  };

  const push = (event: CortexEvent): void => {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // A listener that throws does not end the run.
      }
    }
    buffer.push(event);
    wakeAll();
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
    wakeAll();
  };

  const events: AsyncIterable<CortexEvent> = {
    [Symbol.asyncIterator]: (): AsyncIterator<CortexEvent> => {
      let cursor = 0;
      return {
        next: async (): Promise<IteratorResult<CortexEvent>> => {
          while (cursor >= buffer.length) {
            if (closed) return { done: true, value: undefined };
            await new Promise<void>((resolve) => {
              waiting.push(resolve);
            });
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
