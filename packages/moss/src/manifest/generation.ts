// ═══════════════════════════════════════════════════════════════
// THE GENERATION POINTER — how a second process finds out.
//
// Every per-principal resolution in this server is derived from rows: which
// integrations a tenant has installed, what rung somebody stands on, what a
// studio's theme is. A write changes those rows and the writing process drops
// its memos. Every OTHER process goes on serving the old answer until it is
// restarted, which at two processes is a correctness bug rather than a scaling
// concern: an integration installed via A leaves B refusing that integration's keyed calls,
// and nothing says so.
//
// This is a counter and a clock, deliberately, and NOT `LISTEN/NOTIFY`:
//
//   - `NiscRuntime` takes a pool and a mutation client, both abstract. LISTEN
//     needs a raw dedicated connection held outside the pool for the life of
//     the process — a new capability at the environment boundary, for one
//     feature.
//   - A dropped listener stops invalidating and says nothing. That is a SILENT
//     correctness failure, which is the failure mode this whole design refuses
//     ("breaks rather than degrades"). A counter that cannot be read raises.
//   - It converges on where the plan is going instead of being thrown away by
//     it: "a new generation is a new manifest, and other processes observe a
//     pointer move" (moss DESIGN.md) IS this counter, and Move 4 replaces what
//     the pointer points AT rather than the mechanism.
//
// The cost is that staleness is bounded by a poll rather than instant. It is
// bounded by `sessionRevalidateMs`, a knob already being tuned for exactly this
// class of question. Today it is bounded by nothing.
//
// THIS FILE HOLDS THE CLOCK AND NO SQL. The counter is one row of a table the
// data module owns, read and moved there, through vex (../data, pointer.ts).
// This module sits beneath that one and cannot import it, so the two things it
// asks of the row are handed to it as functions.
// ═══════════════════════════════════════════════════════════════

// THE ROW, as far as this module may know it: where the counter is, and one
// step on from where it was read.
export type Pointer = {
  // The number the counter is at.
  read: () => Promise<number>;
  // Move it from `from` to the next number, if it is still at `from`. Answers
  // whether it was: `false` is somebody else having moved it first.
  move: (from: number) => Promise<boolean>;
};

export type Generation = {
  /** This process changed something every process should forget. */
  bump: () => void;
  /** The generation last observed — for checks and operator surfaces. */
  current: () => number;
  stop: () => void;
};

export const DEFAULT_GENERATION_POLL_MS = 60 * 1000;

// How often a move is tried again when the counter moved between reading it
// and writing the next number. Each failure is another process's move landing
// in that instant, so more than a few in a row is not contention any more.
const MOVE_ATTEMPTS = 5;

export const createGeneration = (pointer: Pointer, ctx: { onMoved: () => void | Promise<void>; everyMs?: number }): Generation => {
  const everyMs = ctx.everyMs ?? DEFAULT_GENERATION_POLL_MS;
  // Starts at -1 rather than 0 so the first read establishes a baseline instead
  // of reporting a move that never happened.
  let seen = -1;
  let checking = false;

  const read = async (): Promise<void> => {
    // Never two reads at once: a poll that outlives its interval would otherwise
    // stack, and a stacked poll on a slow database is how a timer becomes a
    // load generator.
    if (checking) return;
    checking = true;
    try {
      const n = await reading();
      if (n === undefined || n === seen) return;
      // SEEN ONLY ONCE IT IS FOLLOWED. A move is news that the rows changed,
      // and it has been heard when what was derived from them has been read
      // again. Counted as seen before that, a reload that threw was never
      // tried again: the next look found nothing new, and this process went on
      // serving what it had. So a move that could not be followed is left
      // unseen, said to be what it is, and found again at the next look.
      if (seen !== -1 && !(await followed(n))) return;
      seen = n;
    } finally {
      checking = false;
    }
  };

  // Where the counter is, or `undefined` when it could not be read.
  const reading = async (): Promise<number | undefined> => {
    try {
      return await pointer.read();
    } catch (err) {
      // LOUD. A counter nobody can read means this process has stopped hearing
      // about other processes' writes, which is precisely the condition the
      // whole mechanism exists to prevent. Silence here would reproduce the bug
      // in the shape of its own fix.
      console.error('[moss:generation] could not read the generation pointer — this process may be serving stale resolutions', err);
      return undefined;
    }
  };

  // What was last said of a move this process cannot follow, and how often it
  // has been tried. Undefined: nothing is waiting to be followed.
  let unfollowed: { said: string; tries: number } | undefined;

  // Do what a move asks for. `false`: it could not be done.
  //
  // TRIED AT EVERY LOOK, SAID WHEN IT IS NEWS. A move that cannot be followed
  // (a set in the rows that this process refuses, a database out of reach) is
  // tried again at each look for as long as that lasts, and a line for each
  // try was one a poll with nothing new in it. So it is said when it first
  // fails, again when what it says changes (the pointer moved on, or the
  // reload fails another way), and once when it is followed at last.
  const followed = async (n: number): Promise<boolean> => {
    try {
      await ctx.onMoved();
    } catch (err) {
      const what = `the generation pointer moved (${seen} → ${n}) and this process could not follow it: ${err instanceof Error ? err.message : String(err)}`;
      if (unfollowed?.said !== what) {
        console.error(`[moss:generation] ${what} — it is serving what it had, and tries again at every look; this is said again only when it changes`, err);
      }
      unfollowed = { said: what, tries: (unfollowed?.tries ?? 0) + 1 };
      return false;
    }
    if (unfollowed !== undefined) {
      console.log(
        `[moss:generation] followed the generation pointer to ${n}, after ${unfollowed.tries} ${unfollowed.tries === 1 ? 'look' : 'looks'} that failed` +
          ' — this process serves what the rows say again',
      );
      unfollowed = undefined;
    }
    return true;
  };

  // ONE STEP ON, FROM WHERE IT IS. The counter cannot be told to add one: the
  // write grammar sets a column to a value and reads none. So it is read, and
  // the next number is written where the counter is still what was read. Where
  // it is not, another process moved it in that instant, and it is read again.
  const move = async (): Promise<void> => {
    for (let attempt = 0; attempt < MOVE_ATTEMPTS; attempt += 1) {
      const n = await pointer.read();
      if (await pointer.move(n)) {
        // OUR OWN MOVE IS SEEN AT ONCE, so `seen` cannot lag behind a value
        // this process itself wrote and then "discover" it a minute later.
        //
        // BUT ONLY WHERE NOTHING ELSE IS WAITING TO BE FOLLOWED. If the counter
        // was already past what this process had seen, another process moved
        // it first, and what that one changed has not been read here. Counting
        // our own number as seen would pass over it for good. So `seen` stays
        // where it was, and the next look finds the counter ahead and follows:
        // one reload for the two moves.
        if (seen === n || seen === -1) seen = n + 1;
        return;
      }
    }
    throw new Error(`the pointer moved under this process ${MOVE_ATTEMPTS} times in a row`);
  };

  void read();
  const timer = everyMs > 0 ? setInterval(() => void read(), everyMs) : undefined;
  timer?.unref?.();

  return {
    bump: () => {
      void move().catch((err: unknown) => console.error('[moss:generation] could not move the pointer', err));
    },
    current: () => seen,
    stop: () => {
      if (timer !== undefined) clearInterval(timer);
    },
  };
};
