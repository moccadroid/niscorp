import { useSyncExternalStore } from 'react';
import { lsGet, lsSet } from '../../storage';

// The devtools master switch — browser-local, like `relay.ray.debug`. A tiny
// external store (not bare localStorage reads) so every chip/panel flips
// reactively when the flag changes, without a reload.
const KEY = 'relay.devtools';

let enabled = lsGet(KEY) === '1';
const subscribers = new Set<() => void>();

export const isDevtoolsEnabled = (): boolean => enabled;

export const setDevtoolsEnabled = (on: boolean): void => {
  if (on === enabled) return;
  enabled = on;
  lsSet(KEY, on ? '1' : '0');
  subscribers.forEach((fn) => fn());
};

export const toggleDevtools = (): void => setDevtoolsEnabled(!enabled);

export const subscribeDevtools = (fn: () => void): (() => void) => {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
};

export const useDevtoolsEnabled = (): boolean => useSyncExternalStore(subscribeDevtools, isDevtoolsEnabled);

// Cmd/Ctrl+Shift+D toggles the flag. Installed once by <NovaDevtools>; returns
// the uninstaller so StrictMode double-mount stays clean.
export const installDevtoolsHotkey = (): (() => void) => {
  const onKey = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      toggleDevtools();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
};
