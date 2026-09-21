// A CEILING ON EVENT PASSES PER SECOND — one, shared by every session.
//
// Coalescing bounds what ONE watcher asks; this bounds what the process asks of
// the decision provider on the festival's behalf, however many people are
// watching and however hard the feeds are firing. A sliding window: a pass that
// would be the (n+1)th inside one second waits until the oldest of the n is a
// second old. It is said in the trace when it bites, because a room that has
// quietly fallen behind its feeds is worse than one that says so.
//
// ONLY event passes take from it. A sentence never does: the operator is not
// rate-limited by the weather.

export type Ceiling = { take: () => Promise<number>; perSecond: number };

export const EVENT_PASSES_PER_SECOND = 8;

const WINDOW_MS = 1_000;

export const createCeiling = (perSecond: number = EVENT_PASSES_PER_SECOND): Ceiling => {
  const taken: number[] = [];
  // Waiters are served in order: the promise chain is the queue.
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
