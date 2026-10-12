export type Pointer = {
  read: () => Promise<number>;
  move: (from: number) => Promise<boolean>;
};

export type Generation = {
  bump: () => void;
  current: () => number;
  stop: () => void;
};

export const DEFAULT_GENERATION_POLL_MS = 60 * 1000;

const MOVE_ATTEMPTS = 5;

export const createGeneration = (pointer: Pointer, ctx: { onMoved: () => void | Promise<void>; everyMs?: number }): Generation => {
  const everyMs = ctx.everyMs ?? DEFAULT_GENERATION_POLL_MS;
  // -1 until the first read, which sets a baseline and reports no move.
  let seen = -1;
  let checking = false;

  const poll = async (): Promise<void> => {
    if (checking) return;
    checking = true;
    try {
      const n = await readPointer();
      if (n === undefined || n === seen) return;
      if (seen !== -1 && !(await follow(n))) return;
      seen = n;
    } finally {
      checking = false;
    }
  };

  const readPointer = async (): Promise<number | undefined> => {
    try {
      return await pointer.read();
    } catch (err) {
      console.error('[moss:generation] could not read the generation pointer — this process may be serving stale resolutions', err);
      return undefined;
    }
  };

  let unfollowed: { said: string; tries: number } | undefined;

  const follow = async (n: number): Promise<boolean> => {
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

  const move = async (): Promise<void> => {
    for (let attempt = 0; attempt < MOVE_ATTEMPTS; attempt += 1) {
      const n = await pointer.read();
      if (await pointer.move(n)) {
        // Our own move counts as seen, so the next poll does not reload for
        // it. Not when the counter was already ahead of `seen`: another
        // process's move is still unread here, and counting ours would skip it.
        if (seen === n || seen === -1) seen = n + 1;
        return;
      }
    }
    throw new Error(`the pointer moved under this process ${MOVE_ATTEMPTS} times in a row`);
  };

  void poll();
  const timer = everyMs > 0 ? setInterval(() => void poll(), everyMs) : undefined;
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
