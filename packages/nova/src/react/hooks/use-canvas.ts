import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { CanvasState } from '@shell';
import { useShell } from './use-shell';

const sameActive = (a: CanvasState, b: CanvasState): boolean => {
  if (a.stack.length !== b.stack.length) return false;
  if (a.active?.id !== b.active?.id) return false;
  for (let i = 0; i < a.stack.length; i += 1) {
    const aItem = a.stack[i];
    const bItem = b.stack[i];
    if (aItem === undefined || bItem === undefined) return false;
    if (aItem.id !== bItem.id || aItem.status !== bItem.status) return false;
  }
  return true;
};

export const useCanvas = (canvasId: string): CanvasState => {
  const shell = useShell();
  const cacheRef = useRef<CanvasState | undefined>(undefined);

  const subscribe = useCallback(
    (cb: () => void) =>
      shell.onStateChange(() => {
        const next = shell.getCanvasState(canvasId);
        const prev = cacheRef.current;
        if (prev !== undefined && sameActive(prev, next)) return;
        cacheRef.current = next;
        cb();
      }),
    [shell, canvasId],
  );

  const getSnapshot = useCallback((): CanvasState => {
    if (cacheRef.current === undefined) {
      cacheRef.current = shell.getCanvasState(canvasId);
    }
    return cacheRef.current;
  }, [shell, canvasId]);

  return useSyncExternalStore(subscribe, getSnapshot);
};
