import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { RenderNode } from '@layout';
import type { Shell } from '@shell';
import { useShell } from './use-shell';

type Cache = {
  shell: Shell;
  tree: RenderNode[];
};

export const useShellRenderTree = (): RenderNode[] => {
  const shell = useShell();
  const cacheRef = useRef<Cache | undefined>(undefined);

  const subscribe = useCallback(
    (cb: () => void) =>
      shell.onStateChange(() => {
        cacheRef.current = { shell, tree: shell.getShellRenderTree() };
        cb();
      }),
    [shell],
  );

  const getSnapshot = useCallback((): RenderNode[] => {
    const cached = cacheRef.current;
    if (cached === undefined || cached.shell !== shell) {
      const tree = shell.getShellRenderTree();
      cacheRef.current = { shell, tree };
      return tree;
    }
    return cached.tree;
  }, [shell]);

  return useSyncExternalStore(subscribe, getSnapshot);
};
