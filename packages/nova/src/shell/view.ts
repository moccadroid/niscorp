import type { RenderNode } from '../layout';
import type { RenderApi, Shell } from './types';
import { isHeadNode } from './head';
import { ACTION_SLOT_NAME } from './slot-names';

// ═══════════════════════════════════════════════════════════
// A shell, as something an adapter draws.
//
// Every adapter that draws a SERVED screen draws it through `RenderApi` — the
// frame, a tree per canvas, events up, messages across — and has always been
// handed one by a transport (moss's socket wire). A shell that lives in the
// same process as its adapter is the other case that type was written for, and
// this is it: the shell's own trees, read as they stand, and its own dispatch.
// The DOM and TTY adapters draw a local shell through this exactly as they draw
// a remote one; nothing about them knows the difference.
//
// It is also what makes a shell DRAWABLE AHEAD OF TIME. A build runs the app's
// own boot, waits for the screen to be whole (`shellSettled`), and has an
// adapter draw this view to markup; the browser runs the same boot and draws
// the same view over that markup. Where the shell lives was never the
// adapter's business.
// ═══════════════════════════════════════════════════════════

export type ShellView = {
  api: RenderApi;
  // Called after the shell changed — coalesced, so a burst of changes (a press
  // that sets three keys) is one call. Returns the unsubscribe.
  subscribe: (listener: () => void) => () => void;
};

// NO VISIBLE CONTENT IS AN EMPTY TREE. A canvas whose layout renders nothing but
// empty text and empty wrappers is handed to an adapter as `[]`, so an adapter
// collapses the chrome around it on `length` alone, knowing nothing about node
// shapes. An ActionSlot marker is a boundary, not content — what is inside it
// decides — and a head is something the screen says, not something it shows.
// One rule for a canvas that is served and one that is local, so a frame looks
// the same over both.
export const hasVisibleContent = (nodes: readonly RenderNode[]): boolean =>
  nodes.some((node) => {
    if (node.type === 'text') return node.value !== '';
    if (node.type === 'fragment') return hasVisibleContent(node.children);
    if (node.type === 'component' && node.name === ACTION_SLOT_NAME) return hasVisibleContent(node.children);
    if (isHeadNode(node)) return false;
    return true;
  });

// One canvas, as an adapter is handed it.
export const canvasTreeOf = (shell: Shell, canvasId: string): RenderNode[] => {
  const tree = shell.flattenRenderTree(shell.getCanvasRenderTree(canvasId));
  return hasVisibleContent(tree) ? tree : [];
};

export const shellView = (shell: Shell): ShellView => ({
  api: {
    frame: () => shell.getShellRenderTree(),
    canvasTree: (canvasId) => canvasTreeOf(shell, canvasId),
    // An event that names no origin belongs to the canvas's ACTIVE instance — on
    // a card deck that is the only one drawn. One that names its own (an
    // adapter stamps it at the instance boundary, `scopeDispatch`) keeps it. A
    // canvas with nothing mounted dispatches unstamped.
    dispatch: (canvasId, event) => {
      const active = shell.getState().canvases[canvasId]?.active;
      shell.dispatch(event.origin === undefined && active !== undefined ? { ...event, origin: active.id } : event);
    },
    publish: (channel, payload) => shell.publish(channel, payload),
  },
  subscribe: (listener) => {
    let pending = false;
    let stopped = false;
    const changed = (): void => {
      if (pending || stopped) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        if (!stopped) listener();
      });
    };
    const offState = shell.onStateChange(changed);
    const offData = shell.onDataChange(changed);
    return () => {
      stopped = true;
      offState();
      offData();
    };
  },
});

// THE FIRST SCREEN IS WHOLE. An instance is `initializing` until its mount hook
// — the loads, and whatever they chain to — has been awaited, so "nothing is
// initializing" is the shell saying its opening screen is complete. A mount can
// open another action, which starts initializing in turn, so the question is
// asked again on every change and answered true only when it still holds a
// macrotask later.
//
// Resolves `false` when `waitMs` runs out first: the screen is then drawn as it
// stands, with whatever is still loading drawn as loading. Default 300ms — a
// page should not hang on one slow endpoint.
export const DEFAULT_SETTLE_WAIT_MS = 300;

export const shellSettled = async (shell: Shell, options: { waitMs?: number; stopped?: () => boolean } = {}): Promise<boolean> => {
  const waitMs = options.waitMs ?? DEFAULT_SETTLE_WAIT_MS;
  const mounting = (): boolean =>
    Object.values(shell.getState().canvases).some((canvas) => canvas.stack.some((instance) => instance.status === 'initializing'));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), waitMs);
  });
  const quiet = (async (): Promise<boolean> => {
    for (;;) {
      if (options.stopped?.() === true) return false;
      if (!mounting()) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (!mounting()) return true;
      }
      await new Promise<void>((resolve) => {
        const off = shell.onStateChange(() => {
          off();
          resolve();
        });
        // a change that lands with no notification must not leave this waiting
        setTimeout(() => {
          off();
          resolve();
        }, 10);
      });
    }
  })();
  const settled = await Promise.race([quiet, deadline]);
  clearTimeout(timer);
  return settled;
};
