import { shellSettled } from '@niscorp/nova';
import type { RenderNode } from '@niscorp/nova';
import { shellNeedOf } from './liveness';
import { canvasesOf } from './live';
import type { Live } from './live';
import { treeOf } from './stream';
import type { ShellSnapshot } from './types';

// THE DOCUMENT'S READ: the screen a shell shows right now, taken without
// attaching anything, with whether it has settled and whether anything on it
// can still happen.

// A document should not wait on a slow integration: past this the page ships
// with whatever is still loading drawn as loading.
export const DEFAULT_SNAPSHOT_WAIT_MS = 300;

// SETTLED: the seeds are in and nothing is still mounting. nova marks an
// instance `active` only after its mount hook — the loads and their
// onSuccess chains — has been awaited, so no instance `initializing` is the
// shell saying its first screen is whole. A mount can push another action,
// which starts `initializing` in turn, so the question is asked again on
// every state change, and answered true only when it holds a macrotask later.
export const settle = async (live: Live, waitMs: number): Promise<boolean> => {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), waitMs);
  });
  // The seeds are moss's (the manifest's `seeds` hook); the rest of the
  // question — is anything still mounting — is nova's, asked with what is left
  // of the wait.
  const whole = live.seeded.then(() => shellSettled(live.shell, { waitMs: Math.max(0, waitMs - (Date.now() - started)), stopped: () => live.ended }));
  const settled = await Promise.race([whole, deadline]);
  clearTimeout(timer);
  return settled;
};

// Read-only: `sent` is not touched, so the connections already attached keep
// their baseline and a snapshot can never make a flush skip a frame.
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

// Asked of the instances ON SCREEN, not of the catalog: what a screen needs is
// a fact about what mounted for this principal.
//
// The definition an instance runs is the one its principal's composition
// holds (the same object), unless the instance was pushed `with` fragments:
// then it is that definition with the fragments laid around it, which nova
// composed when it mounted, and which fragments those were is known to the
// shell alone. A fragment adds what can be pressed (a sheet's close), so the
// definition is read where the composed one is: off the instance.
//
// `kept`: the host keeps a principal's shell. The entries are the ones the
// shell's composition answered (`live.entries`), or undefined when it named
// none: then the host was given no way to ask.
export const needOf = (live: Live, principal: string | null, kept: boolean): Pick<ShellSnapshot, 'live' | 'why' | 'drawnWith'> => {
  const why: string[] = [];
  const drawnWith: string[] = [];
  const { entries } = live;
  if (entries === undefined) return { live: true, why: ['this host was given no way to ask what its actions need'], drawnWith };
  // The app's shell IS the thing that stays: whoever is signed in has one.
  if (kept && principal !== null) why.push('the app’s shell is kept for whoever is signed in');
  for (const canvas of Object.values(live.shell.getState().canvases)) {
    for (const instance of canvas.stack) {
      const definition = live.shell.getRuntime(instance.id)?.definition;
      if (definition === undefined) continue;
      const need = shellNeedOf(definition, entries);
      for (const reason of need.why) why.push(`${definition.id}: ${reason}`);
      for (const read of need.drawnWith) drawnWith.push(read);
    }
  }
  return { live: why.length > 0, why, drawnWith };
};
