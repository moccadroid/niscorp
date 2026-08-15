import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { RenderNode } from '@layout';
import type { Phrasebook } from '../../../i18n/phrases';
import { useShell } from './use-shell';

type Cache = {
  data: Record<string, unknown> | undefined;
  // WHAT ELSE A TREE DEPENDS ON. Data is not the only input to a render: the
  // renderer also reads the shell's book, and `setPhrases` changes it without
  // touching a single instance's data. Cached on data alone, an instance that
  // was already mounted when the language changed would go on showing the old
  // words until something unrelated happened to it — which is precisely the
  // failure `setPhrases` exists to prevent.
  phrases: Phrasebook | undefined;
  tree: RenderNode[];
};

const EMPTY: RenderNode[] = [];

export const useRenderTree = (instanceId: string): RenderNode[] => {
  const shell = useShell();
  const cacheRef = useRef<Cache | undefined>(undefined);

  const subscribe = useCallback(
    (cb: () => void) => {
      // Two sources, because a tree has two inputs. Data changes come from the
      // runtime; a language change is shell-wide and arrives as a state change,
      // the same signal the canvas and shell trees already listen to.
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

  return useSyncExternalStore(subscribe, getSnapshot);
};
