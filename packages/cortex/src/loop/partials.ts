import { createStream, type Stream } from '@niscorp/solid';
import type { ZodType } from 'zod';

export type PartialTracker = {
  write: (text: string) => void;
  reset: () => void;
};

export type PartialTrackerConfig = {
  wireSchema: ZodType;
  emit: (partial: unknown) => void;
};

export const createPartialTracker = (config: PartialTrackerConfig): PartialTracker => {
  let stream: Stream<unknown> | undefined;
  let dead = false;

  const open = (): void => {
    if (stream !== undefined || dead) return;
    try {
      const created: Stream<unknown> = createStream({ schema: config.wireSchema, mode: 'recover' });
      created.on((value) => config.emit(value));
      created.onError(() => {
        dead = true;
      });
      // destroy() rejects the stream's final() promise, which nothing awaits:
      // without this catch a reset is an unhandled rejection.
      created.final().catch(() => {});
      stream = created;
    } catch {
      dead = true;
    }
  };

  const dispose = (): void => {
    if (stream !== undefined) {
      try {
        stream.destroy();
      } catch {
        // already closed
      }
      stream = undefined;
    }
  };

  return {
    write: (text: string): void => {
      if (dead) return;
      open();
      if (stream === undefined) return;
      try {
        stream.write(text);
      } catch {
        dead = true;
        dispose();
      }
    },
    reset: (): void => {
      dispose();
      dead = false;
    },
  };
};
