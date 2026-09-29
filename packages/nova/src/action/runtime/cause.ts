// ═══════════════════════════════════════════════════════════
// THE CAUSE OF A STEP — how far a chain has run from the gesture that started
// it. Whether a chain of triggers ends cannot be decided from the definitions
// in general (it can depend on data), but a budget can always be enforced, so
// every hop a chain takes is counted and a chain past its budget stops.
//
// A ROOT is something from outside the action graph: a UI event, a message
// published by the host, a mount nothing in a chain caused. A HOP is one
// step of a chain handing off to more steps:
//
//   · an `emit` reaching a `message` trigger,
//   · a `reload` re-running the mount hook,
//   · a navigation (`push`, `replace`, …) mounting the action it opens.
//
// Two limits, because a runaway chain comes in two shapes. A LOOP is deep:
// `x` emits `x`, one hop after another. A FAN-OUT is wide: a trigger that
// emits twice doubles every turn, and 64 doublings is more work than any
// depth limit alone would stop in time. So depth is counted per branch and
// hops are counted per root, across every branch the root grew.
//
// Tide parks a fact whose cause chain runs away (its maxChainDepth); this is
// the same idea for actions.
// ═══════════════════════════════════════════════════════════

export const CAUSE_DEPTH_LIMIT = 64;
export const CAUSE_HOPS_LIMIT = 1024;

export type Cause = {
  // Hops between this step and its root.
  depth: number;
  // Shared by every branch of one root.
  root: { hops: number };
};

// Every cause minted here, so one read back off the bus (which carries it
// opaquely — shared code knows nothing of actions) is the same object, root
// counter and all, and anything else a publisher passed is no cause at all.
const minted = new WeakSet<object>();
const mint = (cause: Cause): Cause => {
  minted.add(cause);
  return cause;
};
const isMinted = (value: object): value is Cause => minted.has(value);

export const rootCause = (): Cause => mint({ depth: 0, root: { hops: 0 } });

export const asCause = (value: unknown): Cause | undefined =>
  typeof value === 'object' && value !== null && isMinted(value) ? value : undefined;

// The cause one hop on from `parent` — a fresh root when there is no parent.
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

// THE CAUSE A NAVIGATION HANDS TO THE MOUNT IT STARTS. Navigation runs
// synchronously from a step (step → shell → spawn → mount), and the mount
// reads its cause before its first await, so the cause rides along for
// exactly that synchronous stretch instead of being threaded through every
// shell operation. Restored in `finally`, so a throw cannot leak it.
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
