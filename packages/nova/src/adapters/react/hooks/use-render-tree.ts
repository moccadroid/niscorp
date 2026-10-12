import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { RenderNode } from '@layout';
import type { Phrasebook } from '../../../i18n/phrases';
import { useShell } from './use-shell';

type Cache = {
  data: Record<string, unknown> | undefined;
  // The renderer also reads the shell's phrases, and `setPhrases` changes them
  // without touching any instance's data.
  phrases: Phrasebook | undefined;
  tree: RenderNode[];
};

const EMPTY: RenderNode[] = [];

export const useRenderTree = (instanceId: string): RenderNode[] => {
  const shell = useShell();
  const cacheRef = useRef<Cache | undefined>(undefined);

  const subscribe = useCallback(
    (cb: () => void) => {
      // A language change is shell-wide and arrives as a state change.
      const offState = shell.onStateChange(() => cb());
      const runtime = shell.getRuntime(instanceId);
      if (runtime === undefined) return offState;
      const offData = runtime.onDataChange(() => cb());
      return (): void => {
        offData();
        offState();
      };
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
    const phrases = shell.getPhrases();
    const cached = cacheRef.current;
    if (cached !== undefined && cached.data === data && cached.phrases === phrases) return cached.tree;
    const tree = runtime.render();
    cacheRef.current = { data, phrases, tree };
    return tree;
  }, [shell, instanceId]);

  // The third argument is what a server reads: without it React refuses to draw
  // this to markup ("Missing getServerSnapshot").
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
