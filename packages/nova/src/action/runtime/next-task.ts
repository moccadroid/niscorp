// Not `setTimeout(…, 0)`: timers are clamped (about 1ms in node, 4ms once
// nested in a browser, up to the 15ms system tick on Windows). `setImmediate`
// is tried first because an open MessageChannel keeps a node process alive.

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
  // Read off the global rather than named: nova carries no node types.
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
