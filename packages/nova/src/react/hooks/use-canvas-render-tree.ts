import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { RenderNode } from '@layout';
import type { Shell } from '@shell';
import { useShell } from './use-shell';

type Cache = {
  shell: Shell;
  canvasId: string | undefined;
  tree: RenderNode[];
};

const EMPTY: RenderNode[] = [];

export const useCanvasRenderTree = (canvasId: string | undefined): RenderNode[] => {
  const shell = useShell();
  const cacheRef = useRef<Cache | undefined>(undefined);

  const subscribe = useCallback(
    (cb: () => void) =>
      shell.onStateChange(() => {
        const tree = canvasId === undefined ? EMPTY : shell.getCanvasRenderTree(canvasId);
        cacheRef.current = { shell, canvasId, tree };
        cb();
      }),
    [shell, canvasId],
  );

  const getSnapshot = useCallback((): RenderNode[] => {
    const cached = cacheRef.current;
    if (cached !== undefined && cached.shell === shell && cached.canvasId === canvasId) {
      return cached.tree;
    }
    const tree = canvasId === undefined ? EMPTY : shell.getCanvasRenderTree(canvasId);
    cacheRef.current = { shell, canvasId, tree };
    return tree;
  }, [shell, canvasId]);

  return useSyncExternalStore(subscribe, getSnapshot);
};
