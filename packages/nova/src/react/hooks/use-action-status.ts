import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { ActionStatus } from '@action';
import { useShell } from './use-shell';

export const useActionStatus = (instanceId: string): ActionStatus | undefined => {
  const shell = useShell();
  const cacheRef = useRef<ActionStatus | undefined>(undefined);

  const subscribe = useCallback(
    (cb: () => void) => {
      const runtime = shell.getRuntime(instanceId);
      if (runtime === undefined) return () => {};
      return runtime.onStatusChange((next) => {
        cacheRef.current = next;
        cb();
      });
    },
    [shell, instanceId],
  );

  const getSnapshot = useCallback((): ActionStatus | undefined => {
    const runtime = shell.getRuntime(instanceId);
    if (runtime === undefined) {
      cacheRef.current = undefined;
      return undefined;
    }
    const current = runtime.instance.status;
    if (cacheRef.current !== current) cacheRef.current = current;
    return cacheRef.current;
  }, [shell, instanceId]);

  return useSyncExternalStore(subscribe, getSnapshot);
};
