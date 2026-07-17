// The devtools master switch — in-memory, a tiny external store so the
// install (and future panels) flip reactively. (The client-shell hotkey +
// localStorage flag died with the shell; a served preference arrives with
// devtools-in-the-terminal, SERVER.md step 4.)
let enabled = false;
const subscribers = new Set<() => void>();

export const isDevtoolsEnabled = (): boolean => enabled;

export const setDevtoolsEnabled = (on: boolean): void => {
  if (on === enabled) return;
  enabled = on;
  subscribers.forEach((fn) => fn());
};

export const toggleDevtools = (): void => setDevtoolsEnabled(!enabled);

export const subscribeDevtools = (fn: () => void): (() => void) => {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
};
