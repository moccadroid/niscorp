import type { NavigationEffect } from '../action';

export const navigatedChannel = (canvasId: string): string => `nova:navigated:${canvasId}`;

export type NavigatedMessage = {
  canvas: string;
  action?: string;
  instance?: string;
};

export type ShellNavOps = {
  push: (canvasId: string, actionId: string, input?: Record<string, unknown>, fragments?: string[]) => string;
  pop: (canvasId: string) => void;
  replace: (canvasId: string, actionId: string, input?: Record<string, unknown>, fragments?: string[]) => string;
  clear: (canvasId: string) => void;
  // Its own op, not `clear` then `push`: the journal has to record one
  // navigation, or `back` walks through a blank canvas.
  resetTo: (canvasId: string, actionId: string, input?: Record<string, unknown>, fragments?: string[]) => void;
  popTo: (canvasId: string, instanceId: string) => void;
  removeInstance: (canvasId: string, instanceId: string) => void;
  reconcile: (
    canvasId: string,
    desired: readonly { actionId: string; input?: Record<string, unknown>; row?: Record<string, unknown> }[],
    options: { origin: string; own?: 'pushed' | 'canvas'; with?: string[] },
  ) => void;
};

export type NavigationHandler = (currentCanvasId: string, effect: NavigationEffect) => void;

export const createNavigationHandler = (ops: ShellNavOps): NavigationHandler => {
  return (currentCanvasId, effect): void => {
    if ('push' in effect) {
      const target = effect.push.canvas ?? currentCanvasId;
      ops.push(target, effect.push.action, effect.push.input, effect.push.with);
      return;
    }
    if ('pop' in effect) {
      ops.pop(currentCanvasId);
      return;
    }
    if ('replace' in effect) {
      const target = effect.replace.canvas ?? currentCanvasId;
      ops.replace(target, effect.replace.action, effect.replace.input, effect.replace.with);
      return;
    }
    if ('popTo' in effect) {
      ops.popTo(effect.popTo.canvas ?? currentCanvasId, effect.popTo.instance);
      return;
    }
    if ('resetTo' in effect) {
      const target = effect.resetTo.canvas ?? currentCanvasId;
      ops.resetTo(target, effect.resetTo.action, effect.resetTo.input, effect.resetTo.with);
      return;
    }
    if ('removeInstance' in effect) {
      ops.removeInstance(effect.removeInstance.canvas ?? currentCanvasId, effect.removeInstance.instance);
      return;
    }
    if ('reconcile' in effect) {
      const { canvas, desired, origin, own, with: fragments } = effect.reconcile;
      ops.reconcile(canvas ?? currentCanvasId, desired, {
        origin: origin ?? 'reconcile',
        ...(own === undefined ? {} : { own }),
        ...(fragments === undefined ? {} : { with: fragments }),
      });
    }
  };
};
