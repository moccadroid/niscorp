// A pass in flight is never aborted on a keystroke: at typing speed no pass would ever land.
// The newest text waits in one slot behind it and starts the moment it lands.

// Above a fast typist's gap between letters (~100 ms), below human reaction to a pause (~200 ms).
export const PASS_QUIET_MS = 140;
export const PASS_CEILING_MS = 400;

export type PacerClock = {
  now: () => number;
  after: (ms: number, run: () => void) => () => void;
};

export type Pacer = {
  submit: (text: string, options?: { now?: boolean }) => number;
  cancel: () => number;
  idle: () => Promise<void>;
  generation: () => number;
};

export type PacerConfig = {
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
    config
      .run(next.text, next.generation, clock.now() - next.since)
      .catch(config.onError)
      .finally(() => {
        running = false;
        if (unsent === undefined) settle();
        else send();
      });
  };

  return {
    submit: (text, options) => {
      generation += 1;
      // The ceiling counts from the first keystroke nobody has sent yet.
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
