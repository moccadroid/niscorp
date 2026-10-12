export type Ceiling = { take: () => Promise<number>; perSecond: number };

export const EVENT_PASSES_PER_SECOND = 8;

const WINDOW_MS = 1_000;

export const createCeiling = (perSecond: number = EVENT_PASSES_PER_SECOND): Ceiling => {
  const taken: number[] = [];
  let queue: Promise<void> = Promise.resolve();
  const next = async (): Promise<number> => {
    const asked = performance.now();
    while (taken.length > 0 && asked - (taken[0] ?? 0) >= WINDOW_MS) taken.shift();
    const oldest = taken.length >= perSecond ? taken[taken.length - perSecond] : undefined;
    const wait = oldest === undefined ? 0 : Math.max(0, oldest + WINDOW_MS - asked);
    if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
    taken.push(performance.now());
    return wait;
  };
  return {
    perSecond,
    take: () => {
      const mine = queue.then(next);
      queue = mine.then(() => undefined);
      return mine;
    },
  };
};
