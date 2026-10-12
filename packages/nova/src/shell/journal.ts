export type HistoryFrame = {
  instance: string;
  action: string;
  input?: Record<string, unknown>;
  with?: string[];
};

export type HistoryEntry = {
  canvas: string;
  stack: readonly HistoryFrame[];
};

export type Journal = {
  record: (canvas: string, stack: readonly HistoryFrame[]) => void;
  consume: (canvas: string) => void;
  take: () => HistoryEntry | undefined;
  forgetAction: (actionId: string) => void;
  forgetCanvas: (canvas: string) => void;
  mute: <T>(fn: () => T) => T;
  depth: () => number;
};

export const DEFAULT_HISTORY_DEPTH = 50;

export const createJournal = (limit: number): Journal => {
  const entries: HistoryEntry[] = [];
  // A counter, not a flag: mutes nest, and the inner one must not un-mute the outer.
  let mutes = 0;

  const off = (): boolean => limit <= 0 || mutes > 0;

  return {
    record: (canvas, stack) => {
      if (off()) return;
      entries.push({ canvas, stack });
      if (entries.length > limit) entries.shift();
    },

    // A pop somebody performed themselves is a back.
    consume: (canvas) => {
      if (off()) return;
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        if (entries[i]?.canvas !== canvas) continue;
        entries.splice(i, 1);
        return;
      }
    },

    take: () => entries.pop(),

    // An entry naming an action this shell no longer serves would hand a
    // revoked action back through `back`.
    forgetAction: (actionId) => {
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        if (entries[i]?.stack.some((frame) => frame.action === actionId) === true) entries.splice(i, 1);
      }
    },

    forgetCanvas: (canvas) => {
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        if (entries[i]?.canvas === canvas) entries.splice(i, 1);
      }
    },

    mute: (fn) => {
      mutes += 1;
      try {
        return fn();
      } finally {
        mutes -= 1;
      }
    },

    depth: () => entries.length,
  };
};
