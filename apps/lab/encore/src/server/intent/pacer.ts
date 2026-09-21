// THE PACER — a debounce with a ceiling in front, single-flight with a trailing
// slot behind. Pure and clock-injected: it paces a function of (text,
// generation, waited) and knows nothing about intent.
//
// WHILE A PASS IS OUT, nothing changed from Slice 1:
//
//   NEVER ABORT ON A KEYSTROKE. A person typing at speed produces a newer
//   sentence before any pass can return, so abort-on-input means no pass EVER
//   lands until they stop — the room stays empty exactly while it should be
//   assembling. And an answer for "move headl" is still right at "move
//   headliner": a slightly stale room beats no room.
//
//   TRAILING LATEST. The newest text waits in one slot behind the pass in
//   flight and starts THE MOMENT IT LANDS — no extra wait: the pass it queued
//   behind was its debounce.
//
// WHILE NOTHING IS OUT, a keystroke used to start a pass at once, which sent
// "s", "st", "sto" to a provider a round trip away (measured: ~300 ms on a warm
// connection, and the queue behind it then decided which prefixes got asked
// about — arbitrary ones). Now:
//
//   QUIET   a keystroke arms a short timer and each further keystroke re-arms
//           it, so a burst is one pass, on its last text.
//   CEILING but never later than a fixed time after the FIRST unsent
//           keystroke. A plain trailing debounce shows nothing at all to
//           somebody who types steadily for six seconds; this shows them a
//           room a few times a second.
//   WORDS   a keystroke that ends a word — a space — sends at once. A whole
//           word is the unit the models actually answer about, and the end of
//           one is the cheapest moment there is to ask.
//
// It is server-side on purpose. The same rules as an Input `debounce` prop
// would be invisible to the single-flight queue, could not see a pass in
// flight, and would hold back the instant `heard` tags along with the pass.

// THE constants. Below human reaction to a pause (~200 ms), above a fast
// typist's gap between letters (~100 ms).
export const PASS_QUIET_MS = 140;
export const PASS_CEILING_MS = 400;

// The clock is handed in, so the rules above are asserted against a fake one
// (lanes-check) rather than slept through. `after` returns its own cancel — a
// timer handle is a different type on every runtime, and nothing here needs to
// know which.
export type PacerClock = {
  now: () => number;
  after: (ms: number, run: () => void) => () => void;
};

export type Pacer = {
  // Returns at once with the generation this text was given. `now: true` skips
  // the quiet timer — for a pass nobody typed: a chip clicked, a run landing.
  submit: (text: string, options?: { now?: boolean }) => number;
  // Drop whatever is armed or queued, and take a generation: the line went
  // empty, or to something there is nothing to decide about.
  cancel: () => number;
  // Resolves when nothing is armed, running or waiting — what a check awaits
  // between keystrokes.
  idle: () => Promise<void>;
  generation: () => number;
};

export type PacerConfig = {
  // `waitedMs`: how long this text sat — behind the quiet timer, or behind a
  // pass in flight — between its first unsent keystroke and being sent.
  run: (text: string, generation: number, waitedMs: number) => Promise<void>;
  onError: (error: unknown) => void;
  clock: PacerClock;
  quietMs?: number;
  ceilingMs?: number;
};

export const systemClock: PacerClock = {
  now: () => performance.now(),
  after: (ms, run) => {
    const handle = setTimeout(run, ms);
    return () => clearTimeout(handle);
  },
};

const endsAWord = (text: string): boolean => /\s$/.test(text) && text.trim() !== '';

export const createPacer = (config: PacerConfig): Pacer => {
  const { clock } = config;
  const quietMs = config.quietMs ?? PASS_QUIET_MS;
  const ceilingMs = config.ceilingMs ?? PASS_CEILING_MS;

  let generation = 0;
  let running = false;
  // Unsent text: armed behind the quiet timer (nothing in flight) or waiting in
  // the trailing slot (a pass in flight). Never both — there is one slot.
  let unsent: { text: string; generation: number; since: number } | undefined;
  let cancelTimer: (() => void) | undefined;
  let idlers: (() => void)[] = [];

  const settle = (): void => {
    if (running || unsent !== undefined) return;
    const resolvers = idlers;
    idlers = [];
    for (const resolve of resolvers) resolve();
  };

  const disarm = (): void => {
    cancelTimer?.();
    cancelTimer = undefined;
  };

  const send = (): void => {
    const next = unsent;
    if (next === undefined || running) return;
    disarm();
    unsent = undefined;
    running = true;
    // A pass that throws must not wedge the queue: it is reported, and the
    // text waiting behind it runs exactly as if the pass had returned.
    config
      .run(next.text, next.generation, clock.now() - next.since)
      .catch(config.onError)
      .finally(() => {
        running = false;
        // What queued behind the pass goes NOW. It has already waited.
        if (unsent === undefined) settle();
        else send();
      });
  };

  return {
    submit: (text, options) => {
      generation += 1;
      // The ceiling counts from the FIRST keystroke nobody has sent yet.
      unsent = { text, generation, since: unsent?.since ?? clock.now() };
      if (running) return generation;

      disarm();
      const waited = clock.now() - unsent.since;
      const wait = options?.now === true || endsAWord(text) ? 0 : Math.min(quietMs, Math.max(0, ceilingMs - waited));
      if (wait === 0) send();
      else cancelTimer = clock.after(wait, send);
      return generation;
    },
    cancel: () => {
      generation += 1;
      disarm();
      unsent = undefined;
      settle();
      return generation;
    },
    idle: () => (running || unsent !== undefined ? new Promise<void>((resolve) => idlers.push(resolve)) : Promise.resolve()),
    generation: () => generation,
  };
};
