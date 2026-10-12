// Depth is counted per branch and hops per root, across every branch: a trigger
// that emits twice doubles every turn, which a depth limit alone does not stop in time.
export const CAUSE_DEPTH_LIMIT = 64;
export const CAUSE_HOPS_LIMIT = 1024;

export type Cause = {
  depth: number;
  root: { hops: number };
};

const minted = new WeakSet<object>();
const mint = (cause: Cause): Cause => {
  minted.add(cause);
  return cause;
};
const isMinted = (value: object): value is Cause => minted.has(value);

export const rootCause = (): Cause => mint({ depth: 0, root: { hops: 0 } });

export const asCause = (value: unknown): Cause | undefined =>
  typeof value === 'object' && value !== null && isMinted(value) ? value : undefined;

export const nextCause = (parent: Cause | undefined): Cause => {
  if (parent === undefined) return rootCause();
  parent.root.hops += 1;
  return mint({ depth: parent.depth + 1, root: parent.root });
};

export const isRunaway = (cause: Cause): boolean =>
  cause.depth > CAUSE_DEPTH_LIMIT || cause.root.hops > CAUSE_HOPS_LIMIT;

export const runawayMessage = (cause: Cause, what: string): string =>
  `${what} stopped: its chain ran ${cause.depth} hops deep and ${cause.root.hops} hops in total from the gesture that started it ` +
  `(limits ${CAUSE_DEPTH_LIMIT} and ${CAUSE_HOPS_LIMIT}). A trigger that re-emits its own channel, or a mount that reloads itself, never ends.`;

// Set only for the synchronous stretch from a step to the mount its navigation
// starts: the mount reads it before its first await.
let ambient: Cause | undefined;

export const withCause = <T>(cause: Cause | undefined, run: () => T): T => {
  const before = ambient;
  ambient = cause;
  try {
    return run();
  } finally {
    ambient = before;
  }
};

export const ambientCause = (): Cause | undefined => ambient;
