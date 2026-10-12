import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME, scopeDispatch } from '@niscorp/nova';
import type { ComponentRegistry, NovaEvent, RenderNode } from '@niscorp/nova';
import type { TerminalApi } from './index';

type SlotSinks = {
  dispatch: (event: NovaEvent) => void;
  publish: (channel: string, payload?: unknown) => void;
};

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

export const registerSlots = <TComponent>(registry: ComponentRegistry<TComponent>, slots: { canvas: NoInfer<TComponent>; action: NoInfer<TComponent> }): void => {
  registry.register(CANVAS_SLOT_NAME, slots.canvas, { description: 'A canvas, live from the server.' });
  registry.register(ACTION_SLOT_NAME, slots.action, { description: 'An action instance boundary from the server; the app slotWrapper wraps it.' });
};
