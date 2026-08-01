import type { NavigationEffect } from '../action';

export type ShellNavOps = {
  push: (canvasId: string, actionId: string, input?: Record<string, unknown>, fragments?: string[]) => string;
  pop: (canvasId: string) => void;
  replace: (canvasId: string, actionId: string, input?: Record<string, unknown>, fragments?: string[]) => string;
  clear: (canvasId: string) => void;
  popTo: (canvasId: string, instanceId: string) => void;
  removeInstance: (canvasId: string, instanceId: string) => void;
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
      ops.clear(target);
      ops.push(target, effect.resetTo.action, effect.resetTo.input, effect.resetTo.with);
      return;
    }
    if ('removeInstance' in effect) {
      ops.removeInstance(effect.removeInstance.canvas ?? currentCanvasId, effect.removeInstance.instance);
    }
  };
};
