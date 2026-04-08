import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { Shell, StateSnapshot } from '@shell';
import { useShell } from './use-shell';

export const useShellState = (): StateSnapshot => {
  const shell = useShell();
  const cacheRef = useRef<{ shell: Shell; snapshot: StateSnapshot } | undefined>(undefined);
  if (cacheRef.current === undefined || cacheRef.current.shell !== shell) {
    cacheRef.current = { shell, snapshot: shell.getState() };
  }

  const subscribe = useCallback(
    (cb: () => void) =>
      shell.onStateChange((snapshot) => {
        cacheRef.current = { shell, snapshot };
        cb();
      }),
    [shell],
  );

  const getSnapshot = useCallback((): StateSnapshot => {
    const cached = cacheRef.current;
    if (cached === undefined || cached.shell !== shell) {
      const snapshot = shell.getState();
      cacheRef.current = { shell, snapshot };
      return snapshot;
    }
    return cached.snapshot;
  }, [shell]);

  return useSyncExternalStore(subscribe, getSnapshot);
};
