import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME, scopeDispatch } from '@niscorp/nova';
import type { ComponentRegistry, NovaEvent, RenderNode } from '@niscorp/nova';
import type { TtyInteractive } from '@niscorp/nova/adapters/tty';
import type { WireStatus } from '../client';
import type { TerminalApi } from './index';

const STATUS_ATTRIBUTE = 'data-wire-status';
export const showStatus = (root: HTMLElement, status: WireStatus): void => root.setAttribute(STATUS_ATTRIBUTE, status);
export const hideStatus = (root: HTMLElement): void => root.removeAttribute(STATUS_ATTRIBUTE);

export const STATUS_WORDS = {
  connecting: '… connecting',
  connected: '✓ connected',
  lost: '× connection lost — retrying',
  incompatible: '× this terminal and the server speak different protocol versions — update one of them',
} as const;

export const tapEventOf = (interactive: TtyInteractive): NovaEvent | undefined => {
  if (interactive.kind === 'model') return undefined;
  if (interactive.kind === 'toggle') return { type: 'ui:model', ref: interactive.ref, payload: interactive.value !== true };
  return interactive.value === undefined ? { type: 'ui:click', ref: interactive.ref } : { type: 'ui:click', ref: interactive.ref, payload: interactive.value };
};

export const sendFrom = (api: TerminalApi, interactive: TtyInteractive, event: NovaEvent): boolean => {
  // Canvas '' is frame chrome, which dispatches nothing.
  if (interactive.canvas === '') return false;
  const dispatch = (stamped: NovaEvent): void => api.dispatch(interactive.canvas, stamped);
  (interactive.origin === undefined ? dispatch : scopeDispatch(dispatch, interactive.origin))(event);
  return true;
};

export type DrawnSnapshot = { frame: RenderNode[]; trees: Record<string, RenderNode[]>; live?: boolean };

const nothing = (): void => undefined;

export const drawnApi = (snapshot: DrawnSnapshot): TerminalApi => ({
  frame: () => snapshot.frame,
  canvasTree: (canvasId) => snapshot.trees[canvasId] ?? [],
  dispatch: nothing,
  publish: nothing,
  // The status the page's wire starts in, so a kit that draws it draws the same on both sides.
  status: () => (snapshot.live === false ? 'static' : 'connecting'),
});

// Adopted only with a frame to match: a wire that did not start from the page's snapshot has
// none, and the elements are replaced.
export const holdsDrawnScreen = (root: HTMLElement, api: TerminalApi): boolean => root.firstElementChild !== null && api.frame().length > 0;

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
