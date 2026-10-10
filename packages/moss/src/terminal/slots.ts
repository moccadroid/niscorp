import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME, scopeDispatch } from '@niscorp/nova';
import type { ComponentRegistry, NovaEvent, RenderNode } from '@niscorp/nova';
import type { TerminalApi } from './index';

// ═══════════════════════════════════════════════════════════════
// The wire-backed structural slots: what each one IS, for every target that
// draws with a framework's components (react, ink, vue). A terminal has no
// shell, so these override nova's shell-backed pair:
//
// - CanvasSlot: a served CanvasSlot marker in the frame resolves to that
//   canvas's live tree, dispatching events tagged with the canvas.
// - ActionSlot: the per-instance boundary a served tree carries (identity in
//   props, rendered content as children). Origin is decided HERE, where
//   instance identity lives: a list canvas renders several live cards at once,
//   and a click inside THIS boundary must reach THIS instance's triggers — the
//   server's active-instance fallback only holds for card-deck canvases.
//   Events that already carry an origin keep it (nova's scopeDispatch).
//
// The framework's half — a component that draws what these answer — is each
// target's own (react/slots.ts, vue/slots.ts).
// ═══════════════════════════════════════════════════════════════

// Where what is drawn inside a slot sends its events and messages.
type SlotSinks = {
  dispatch: (event: NovaEvent) => void;
  publish: (channel: string, payload?: unknown) => void;
};

// What a CanvasSlot draws. Undefined is nothing: no api above it, no canvas
// named, or nothing on that canvas.
export const canvasSlotOf = (api: TerminalApi | undefined, canvasId: string | undefined): (SlotSinks & { canvasId: string; tree: RenderNode[] }) | undefined => {
  if (api === undefined || canvasId === undefined || canvasId === '') return undefined;
  const tree = api.canvasTree(canvasId);
  if (tree.length === 0) return undefined;
  return {
    canvasId,
    tree,
    dispatch: (event) => api.dispatch(canvasId, event),
    publish: (channel, payload) => api.publish(channel, payload),
  };
};

// Where one action instance's events go. Undefined: not a boundary this wire
// can route for (no api above it, or no identity on the marker), and what is
// inside it is drawn with the canvas's own sinks.
export const actionSlotOf = (
  api: TerminalApi | undefined,
  canvasId: string | undefined,
  instanceId: string | undefined,
): (SlotSinks & { canvasId: string; instanceId: string }) | undefined => {
  if (api === undefined || instanceId === undefined || canvasId === undefined) return undefined;
  return {
    canvasId,
    instanceId,
    dispatch: scopeDispatch((event) => api.dispatch(canvasId, event), instanceId),
    publish: (channel, payload) => api.publish(channel, payload),
  };
};

// A target's two slot components, registered under the names a served tree
// uses for them.
export const registerSlots = <TComponent>(registry: ComponentRegistry<TComponent>, slots: { canvas: NoInfer<TComponent>; action: NoInfer<TComponent> }): void => {
  registry.register(CANVAS_SLOT_NAME, slots.canvas, { description: 'A canvas, live from the server.' });
  registry.register(ACTION_SLOT_NAME, slots.action, { description: 'An action instance boundary from the server; the app slotWrapper wraps it.' });
};
