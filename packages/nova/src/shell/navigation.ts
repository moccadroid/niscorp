import type { NavigationEffect } from '../action';

export type ShellNavOps = {
  push: (canvasId: string, actionId: string, input?: Record<string, unknown>) => string;
  pop: (canvasId: string) => void;
  replace: (canvasId: string, actionId: string, input?: Record<string, unknown>) => string;
};

export type NavigationHandler = (currentCanvasId: string, effect: NavigationEffect) => void;

export const createNavigationHandler = (ops: ShellNavOps): NavigationHandler => {
  return (currentCanvasId, effect): void => {
    if ('push' in effect) {
      const target = effect.push.canvas ?? currentCanvasId;
      ops.push(target, effect.push.action, effect.push.input);
      return;
    }
    if ('pop' in effect) {
      ops.pop(currentCanvasId);
      return;
    }
    if ('replace' in effect) {
      const target = effect.replace.canvas ?? currentCanvasId;
      ops.replace(target, effect.replace.action, effect.replace.input);
    }
  };
};
