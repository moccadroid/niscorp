// ═══════════════════════════════════════════════════════════
// RUN ON THE NEXT TASK — after the current turn, with the event loop given a
// chance to run timers and I/O in between (see the `emit` step for why).
//
// Not `setTimeout(…, 0)`: that is a timer, and timers are clamped — to ~1ms
// in node, 4ms once nested in a browser, and up to the ~15ms system tick on
// Windows — so every hop of an ordinary chain (write → announce → re-read)
// would pay it. `setImmediate` (node) and a MessageChannel post (browsers)
// are tasks with no clamp. A shared channel would hold a node process open
// forever, which is why node takes `setImmediate` first.
// ═══════════════════════════════════════════════════════════

type Task = () => void;

const viaChannel = (): ((task: Task) => void) => {
  const queue: Task[] = [];
  const channel = new MessageChannel();
  channel.port1.onmessage = (): void => {
    queue.shift()?.();
  };
  return (task) => {
    queue.push(task);
    channel.port2.postMessage(null);
  };
};

const pick = (): ((task: Task) => void) => {
  // Read off the global rather than named: nova is surface-blind and carries
  // no node types.
  const host: object = globalThis;
  if ('setImmediate' in host && typeof host.setImmediate === 'function') {
    const immediate = host.setImmediate;
    return (task) => void immediate(task);
  }
  if (typeof MessageChannel === 'function') return viaChannel();
  return (task) => void setTimeout(task, 0);
};

let scheduler: ((task: Task) => void) | undefined;

export const nextTask = (task: Task): void => {
  scheduler ??= pick();
  scheduler(task);
};
