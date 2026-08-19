// ═══════════════════════════════════════════════════════════
// The navigation journal — what BACK undoes.
//
// A canvas stack remembers where you ARE; nothing remembered where you WERE.
// Every navigation destroys some of that: a push buries the top, a replace
// unmounts it, a resetTo takes the whole deck. So the journal writes the canvas
// down just BEFORE each of those. One entry is one position somebody can be
// returned to, and `shell.back()` is "put the newest one back".
//
// GLOBAL AND ORDERED — one list across every canvas, each entry naming the one
// canvas it describes. Global because back is a single gesture: somebody who
// opened a card on `aside` after a screen on `main` expects it to walk back
// through both, in the order they happened. One canvas per entry because back
// must undo THEIR last move and not revert a canvas that changed underneath
// them — a delivered notice, an agent's card — while they were elsewhere.
//
// A frame records the instance id it described AND the birth details behind it,
// because those answer two different questions on the way back: is this the
// very instance I recorded (keep it, with everything it holds), or is it gone
// (build a new one from what made it).
// ═══════════════════════════════════════════════════════════

// One position in a recorded stack.
export type HistoryFrame = {
  // The live instance this frame described when it was recorded. Meaningless
  // on its own — its whole job is to be compared against what is standing now.
  instance: string;
  action: string;
  input?: Record<string, unknown>;
  with?: string[];
};

// One restorable position: a canvas, and the stack it held before the
// navigation that displaced it.
export type HistoryEntry = {
  canvas: string;
  stack: readonly HistoryFrame[];
};

export type Journal = {
  record: (canvas: string, stack: readonly HistoryFrame[]) => void;
  // The person went back by hand — spend the entry that gesture satisfied.
  consume: (canvas: string) => void;
  // The newest entry, removed. The restore itself is the shell's business.
  take: () => HistoryEntry | undefined;
  // Drop every entry that would bring a revoked action back.
  forgetAction: (actionId: string) => void;
  // Drop every entry for a canvas that no longer exists.
  forgetCanvas: (canvas: string) => void;
  // Run `fn` with recording off — for the movements that are not navigation
  // (seeding a canvas, restoring one).
  mute: <T>(fn: () => T) => T;
  depth: () => number;
};

// Deep enough that nobody walks off the end of a session's worth of moving
// about, shallow enough to be a rounding error beside the instances themselves.
export const DEFAULT_HISTORY_DEPTH = 50;

export const createJournal = (limit: number): Journal => {
  const entries: HistoryEntry[] = [];
  // A counter, not a flag: seeding a canvas from inside a restore is one mute
  // nested in another, and the inner one must not un-mute the outer.
  let mutes = 0;

  const off = (): boolean => limit <= 0 || mutes > 0;

  return {
    record: (canvas, stack) => {
      if (off()) return;
      entries.push({ canvas, stack });
      // BOUNDED, because a durable shell can stand for hours. The oldest
      // position is the one nobody is walking back to.
      if (entries.length > limit) entries.shift();
    },

    // A pop somebody performed themselves IS a back. Without this the journal
    // would still hold the entry that pop just satisfied, and the next press of
    // the back button would spend itself restoring a position already on screen
    // — the double-tap that makes a back button feel broken.
    consume: (canvas) => {
      if (off()) return;
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        if (entries[i]?.canvas !== canvas) continue;
        entries.splice(i, 1);
        return;
      }
    },

    take: () => entries.pop(),

    // REVOCATION REACHES THE JOURNAL OR IT IS NOT REVOCATION. An entry naming
    // an action this shell no longer serves would hand it back on the way out —
    // a grant dropped at the front door and returned through the back one.
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
