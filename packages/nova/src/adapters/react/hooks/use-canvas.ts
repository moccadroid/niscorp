import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { CanvasState, Shell } from '@shell';
import { useShell } from './use-shell';

type Cache = {
  shell: Shell;
  canvasId: string;
  state: CanvasState;
};

export const useCanvas = (canvasId: string): CanvasState => {
  const shell = useShell();
  const cacheRef = useRef<Cache | undefined>(undefined);

  const subscribe = useCallback(
    (cb: () => void) =>
      shell.onCanvasChange(canvasId, (next) => {
        cacheRef.current = { shell, canvasId, state: next };
        cb();
      }),
    [shell, canvasId],
  );

  const getSnapshot = useCallback((): CanvasState => {
    const cached = cacheRef.current;
    if (cached !== undefined && cached.shell === shell && cached.canvasId === canvasId) {
      return cached.state;
    }
    const state = shell.getCanvasState(canvasId);
    cacheRef.current = { shell, canvasId, state };
    return state;
  }, [shell, canvasId]);

  // The third argument is what a server reads: without it React refuses to draw
  // this to markup ("Missing getServerSnapshot").
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
