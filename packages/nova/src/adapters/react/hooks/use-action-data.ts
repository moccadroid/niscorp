import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useShell } from './use-shell';

type DataSnapshot = Record<string, unknown> | undefined;

export const useActionData = (instanceId: string): DataSnapshot => {
  const shell = useShell();
  const cacheRef = useRef<DataSnapshot>(undefined);

  const subscribe = useCallback(
    (cb: () => void) => {
      const runtime = shell.getRuntime(instanceId);
      if (runtime === undefined) return () => {};
      return runtime.onDataChange((next) => {
        cacheRef.current = next;
        cb();
      });
    },
    [shell, instanceId],
  );

  const getSnapshot = useCallback((): DataSnapshot => {
    const runtime = shell.getRuntime(instanceId);
    if (runtime === undefined) {
      cacheRef.current = undefined;
      return undefined;
    }
    const current = runtime.getData();
    if (cacheRef.current !== current) cacheRef.current = current;
    return cacheRef.current;
  }, [shell, instanceId]);

  return useSyncExternalStore(subscribe, getSnapshot);
};
