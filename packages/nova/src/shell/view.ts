import type { RenderNode } from '../layout';
import type { RenderApi, Shell } from './types';
import { isHeadNode } from './head';
import { chainsInFlight } from './chains';
import { ACTION_SLOT_NAME } from './slot-names';

export type ShellView = {
  api: RenderApi;
  subscribe: (listener: () => void) => () => void;
};

export const hasVisibleContent = (nodes: readonly RenderNode[]): boolean =>
  nodes.some((node) => {
    if (node.type === 'text') return node.value !== '';
    if (node.type === 'fragment') return hasVisibleContent(node.children);
    if (node.type === 'component' && node.name === ACTION_SLOT_NAME) return hasVisibleContent(node.children);
    if (isHeadNode(node)) return false;
    return true;
  });

export const canvasTreeOf = (shell: Shell, canvasId: string): RenderNode[] => {
  const tree = shell.flattenRenderTree(shell.getCanvasRenderTree(canvasId));
  return hasVisibleContent(tree) ? tree : [];
};

export const shellView = (shell: Shell): ShellView => ({
  api: {
    frame: () => shell.getShellRenderTree(),
    canvasTree: (canvasId) => canvasTreeOf(shell, canvasId),
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

// Resolves `true` once `isBusy` answers no and still answers no a macrotask
// later: a mount can open another action, which starts initializing in turn.
type ShellWaitOptions = { waitMs?: number; stopped?: () => boolean };

const shellQuietWithin = async (shell: Shell, isBusy: () => boolean, options: ShellWaitOptions): Promise<boolean> => {
  const waitMs = options.waitMs ?? DEFAULT_SETTLE_WAIT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), waitMs);
  });
  const quiet = (async (): Promise<boolean> => {
    for (;;) {
      if (options.stopped?.() === true) return false;
      if (!isBusy()) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (!isBusy()) return true;
      }
      await new Promise<void>((resolve) => {
        const off = shell.onStateChange(() => {
          off();
          resolve();
        });
        // A change that lands with no notification must not leave this waiting.
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

const isMounting = (shell: Shell): boolean =>
  Object.values(shell.getState().canvases).some((canvas) => canvas.stack.some((instance) => instance.status === 'initializing'));

// `shellSettled` asks about mounts and nothing else: a page is read whenever
// it is asked for, also while a call pressed minutes ago is still out, and
// that read must not wait on it.
export const DEFAULT_SETTLE_WAIT_MS = 300;

export const shellSettled = (shell: Shell, options: { waitMs?: number; stopped?: () => boolean } = {}): Promise<boolean> =>
  shellQuietWithin(shell, () => isMounting(shell), options);

export const shellIdle = (shell: Shell, options: { waitMs?: number; stopped?: () => boolean } = {}): Promise<boolean> =>
  shellQuietWithin(shell, () => isMounting(shell) || chainsInFlight(shell) > 0, options);
