import { Fragment, createContext, createElement, useContext, type ComponentType, type FC, type ReactElement, type ReactNode } from 'react';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { ComponentRegistry } from '@niscorp/nova';
import type { TerminalApi } from '../index';
import { actionSlotOf, canvasSlotOf, registerSlots } from '../targets';

export const TerminalApiContext = createContext<TerminalApi | undefined>(undefined);

export type TerminalSlotWrapperProps = {
  canvasId?: string;
  instanceId?: string;
  definitionId?: string;
  children?: ReactNode;
};
export type TerminalSlotWrapper = FC<TerminalSlotWrapperProps>;

type LeafRenderers = {
  fallback?: NovaComponent;
  textWrapper?: ComponentType<{ children?: ReactNode }>;
  errorMarker?: ComponentType<{ code: string; message: string }>;
};

export type WireSlotOptions = LeafRenderers & {
  slotWrapper?: TerminalSlotWrapper;
  canvasProvider?: ComponentType<{ canvasId: string; children?: ReactNode }>;
  instanceProvider?: ComponentType<{ canvasId: string; instanceId: string; children?: ReactNode }>;
};

export const registerWireSlots = (registry: ComponentRegistry<NovaComponent>, options: WireSlotOptions = {}): void => {
  const { slotWrapper, fallback, textWrapper, errorMarker, canvasProvider, instanceProvider } = options;

  const CanvasSlot: NovaComponent<{ canvasId?: string }> = ({ canvasId }: { canvasId?: string }) => {
    const slot = canvasSlotOf(useContext(TerminalApiContext), canvasId);
    if (slot === undefined) return null;
    const body = createElement(RenderTree, { nodes: slot.tree });
    return createElement(
      NovaRenderProvider,
      { registry, dispatch: slot.dispatch, publish: slot.publish, fallback, textWrapper, errorMarker },
      canvasProvider === undefined ? body : createElement(canvasProvider, { canvasId: slot.canvasId }, body),
    );
  };

  const ActionSlot: NovaComponent<{ instanceId?: string; canvasId?: string; definitionId?: string }> = ({
    instanceId,
    canvasId,
    definitionId,
    children,
  }: TerminalSlotWrapperProps) => {
    const slot = actionSlotOf(useContext(TerminalApiContext), canvasId, instanceId);
    // Keyed by instance, so a swap of instances remounts and no view state crosses over.
    const wrapped = slotWrapper === undefined ? createElement(Fragment, { key: instanceId }, children) : createElement(slotWrapper, { key: instanceId, instanceId, canvasId, definitionId }, children);
    if (slot === undefined) return wrapped;
    return createElement(
      NovaRenderProvider,
      { registry, dispatch: slot.dispatch, publish: slot.publish, fallback, textWrapper, errorMarker },
      instanceProvider === undefined ? wrapped : createElement(instanceProvider, { canvasId: slot.canvasId, instanceId: slot.instanceId }, wrapped),
    );
  };

  registerSlots(registry, { canvas: CanvasSlot, action: ActionSlot });
};

export const terminalFrame = (api: TerminalApi, registry: ComponentRegistry<NovaComponent>, leaves: LeafRenderers = {}): ReactElement =>
  createElement(
    TerminalApiContext.Provider,
    { value: api },
    createElement(
      NovaRenderProvider,
      {
        registry,
        // The frame is chrome: events come only from inside a canvas.
        dispatch: () => undefined,
        publish: (channel: string, payload?: unknown) => api.publish(channel, payload),
        ...leaves,
      },
      createElement(RenderTree, { nodes: api.frame() }),
    ),
  );
