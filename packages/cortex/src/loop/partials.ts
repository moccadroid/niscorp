// ═══════════════════════════════════════════════════════════
// Partial-output tracker — solid-powered progressive envelopes
// ═══════════════════════════════════════════════════════════
//
// Feeds envelope JSON fragments (respond args, or raw text under
// native/text) into a solid stream and emits `output-partial`
// events with the progressively parsed value. Strictly
// best-effort: if solid can't track the schema (exotic unions,
// prose around JSON in text strategy), partials silently stop —
// the final Zod validation is authoritative either way. `reset()`
// on retry, per the retry-event contract.

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
      // destroy() rejects the stream's final() promise; cortex never
      // awaits it, so mark it handled or a reset becomes an unhandled
      // rejection.
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
