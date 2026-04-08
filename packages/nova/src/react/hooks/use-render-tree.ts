import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { RenderNode } from '@layout';
import { useShell } from './use-shell';

type Cache = {
  data: Record<string, unknown> | undefined;
  tree: RenderNode[];
};

const EMPTY: RenderNode[] = [];

export const useRenderTree = (instanceId: string): RenderNode[] => {
  const shell = useShell();
  const cacheRef = useRef<Cache | undefined>(undefined);

  const subscribe = useCallback(
    (cb: () => void) => {
      const runtime = shell.getRuntime(instanceId);
      if (runtime === undefined) return () => {};
      return runtime.onDataChange(() => cb());
    },
    [shell, instanceId],
  );

  const getSnapshot = useCallback((): RenderNode[] => {
    const runtime = shell.getRuntime(instanceId);
    if (runtime === undefined) {
      cacheRef.current = undefined;
      return EMPTY;
    }
    const data = runtime.getData();
    const cached = cacheRef.current;
    if (cached !== undefined && cached.data === data) return cached.tree;
    const tree = runtime.render();
    cacheRef.current = { data, tree };
    return tree;
  }, [shell, instanceId]);

  return useSyncExternalStore(subscribe, getSnapshot);
};
