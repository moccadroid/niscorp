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

  // The shell owns canvas-change equality — onCanvasChange only fires on
  // meaningful change, so no comparator lives here.
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

  // The third argument is what a SERVER reads. The shell exists there too, with
  // a real state, so it is the same read — and without it React refuses to draw
  // this to markup at all ("Missing getServerSnapshot").
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
