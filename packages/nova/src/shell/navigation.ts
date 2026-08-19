import type { NavigationEffect } from '../action';

// ═══════════════════════════════════════════════════════════
// WHERE A CANVAS IS, ANNOUNCED.
//
// A canvas knows what is standing on it; nothing else did. Chrome around a
// canvas — a sidebar highlight, a tab strip, a breadcrumb — used to learn where
// somebody went from the CLICK that sent them, which is a copy of the fact
// rather than the fact. It agreed with the canvas right up until something
// moved the canvas without a click: `back`, an agent opening a screen, a
// delivered card, a deep link later. Then the sidebar lit one screen while the
// canvas showed another.
//
// So the canvas says where it is. One message per canvas whenever its ACTIVE
// screen changes, whatever caused the change, on a channel named for the
// canvas — triggers carry no guard clause, so a listener that wants `main`
// should not have to hear about `sheet` to ignore it. The payload names the
// canvas anyway, so nothing has to parse a channel to know what it was told.
// ═══════════════════════════════════════════════════════════

export const navigatedChannel = (canvasId: string): string => `nova:navigated:${canvasId}`;

// What lands on that channel. `action`/`instance` are absent when the canvas
// went empty — which is a position too, and a listener that renders chrome for
// "nothing is open" needs to hear it.
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
  // Clear and push in one movement. Its own op rather than the two calls it
  // used to decompose into, because the journal has to see ONE navigation here:
  // as `clear` then `push` it recorded two positions, and back walked somebody
  // through a blank canvas on the way to the screen they wanted.
  resetTo: (canvasId: string, actionId: string, input?: Record<string, unknown>, fragments?: string[]) => void;
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
      ops.resetTo(target, effect.resetTo.action, effect.resetTo.input, effect.resetTo.with);
      return;
    }
    if ('removeInstance' in effect) {
      ops.removeInstance(effect.removeInstance.canvas ?? currentCanvasId, effect.removeInstance.instance);
    }
  };
};
