import { shellSettled } from '@niscorp/nova';
import type { RenderNode } from '@niscorp/nova';
import { shellNeedOf } from './liveness';
import { canvasesOf } from './host-state';
import type { Live } from './host-state';
import { treeOf } from './stream';
import type { ShellSnapshot } from './types';

export const DEFAULT_SNAPSHOT_WAIT_MS = 300;

export const settle = async (live: Live, waitMs: number): Promise<boolean> => {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), waitMs);
  });
  const whole = live.seeded.then(() => shellSettled(live.shell, { waitMs: Math.max(0, waitMs - (Date.now() - started)), stopped: () => live.ended }));
  const settled = await Promise.race([whole, deadline]);
  clearTimeout(timer);
  return settled;
};

export const read = (live: Live): Pick<ShellSnapshot, 'frame' | 'trees'> => {
  let frameTree: RenderNode[] = [];
  try {
    frameTree = live.shell.getShellRenderTree();
  } catch (error) {
    console.error('[moss/shells] the shell frame failed to render for a snapshot — serving an empty arrangement:', error);
  }
  const trees: Record<string, RenderNode[]> = {};
  for (const canvasId of canvasesOf(live)) {
    try {
      trees[canvasId] = treeOf(live, canvasId);
    } catch (error) {
      console.error(`[moss/shells] canvas "${canvasId}" failed to render for a snapshot — leaving it out:`, error);
    }
  }
  return { frame: frameTree, trees };
};

export const needOf = (live: Live, principal: string | null, kept: boolean): Pick<ShellSnapshot, 'live' | 'why' | 'drawnWith'> => {
  const why: string[] = [];
  const drawnWith: string[] = [];
  const { entries } = live;
  if (entries === undefined) return { live: true, why: ['this host was given no way to ask what its actions need'], drawnWith };
  if (kept && principal !== null) why.push('the app’s shell is kept for whoever is signed in');
  for (const canvas of Object.values(live.shell.getState().canvases)) {
    for (const instance of canvas.stack) {
      // Read off the instance, not the composition: one pushed `with` fragments
      // runs the composed definition, and a fragment adds what can be pressed.
      const definition = live.shell.getRuntime(instance.id)?.definition;
      if (definition === undefined) continue;
      const need = shellNeedOf(definition, entries);
      for (const reason of need.why) why.push(`${definition.id}: ${reason}`);
      for (const read of need.drawnWith) drawnWith.push(read);
    }
  }
  return { live: why.length > 0, why, drawnWith };
};
