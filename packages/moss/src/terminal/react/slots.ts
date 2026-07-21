import { createContext, createElement, Fragment, useContext, type ComponentType, type FC, type ReactNode } from 'react';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { ComponentRegistry, NovaEvent } from '@niscorp/nova';
import type { TerminalApi } from '../index';

// ═══════════════════════════════════════════════════════════
// The wire-backed structural slots, shared by every react-shaped render
// target (terminal/react in the browser, terminal/ink in a TTY) — same seam,
// different renderer. Split from the react target so the ink bundle never
// drags react-dom.
// ═══════════════════════════════════════════════════════════

export const TerminalApiContext = createContext<TerminalApi | undefined>(undefined);

// An app-supplied component wrapping each action instance at the ActionSlot
// boundary — the terminal twin of nova's client-shell SlotWrapper (same seam,
// same job: animation, gating, logging, chips). Served trees carry IDENTITY
// only (ids, not the definition — wire weight), so the props diverge from the
// client-shell wrapper in exactly that one way: `definitionId`, not `action`.
export type TerminalSlotWrapperProps = {
  canvasId?: string;
  instanceId?: string;
  definitionId?: string;
  children?: ReactNode;
};
export type TerminalSlotWrapper = FC<TerminalSlotWrapperProps>;

// The host-specific leaf renderers a react-shaped target may thread through
// to nova's provider (ink needs all three; the browser needs none).
export type WireSlotOptions = {
  slotWrapper?: TerminalSlotWrapper;
  fallback?: NovaComponent;
  textWrapper?: ComponentType<{ children?: ReactNode }>;
  errorMarker?: ComponentType<{ code: string; message: string }>;
  // wraps each canvas's rendered tree with a host context (ink provides the
  // per-canvas marker resolver here); the browser omits it
  canvasProvider?: ComponentType<{ canvasId: string; children?: ReactNode }>;
};

// Register the wire-backed structural slots on a registry:
//
// - CanvasSlot: a served CanvasSlot marker in the frame resolves to that
//   canvas's live tree, dispatching events tagged with the canvas (the
//   server stamps origin). It overrides nova's shell-backed CanvasSlot,
//   which the terminal has no shell for.
// - ActionSlot: the per-instance boundary a served tree carries (identity in
//   props, rendered content as children). With no wrapper it's transparent;
//   with one, the wrapper decides everything. Keyed by instanceId so an
//   instance swap REMOUNTS: no stale view state crossing instances.
export const registerWireSlots = (registry: ComponentRegistry<NovaComponent>, options: WireSlotOptions = {}): void => {
  const { slotWrapper, fallback, textWrapper, errorMarker, canvasProvider } = options;

  const CanvasSlot: NovaComponent<{ canvasId?: string }> = ({ canvasId }: { canvasId?: string }) => {
    const api = useContext(TerminalApiContext);
    if (api === undefined || canvasId === undefined || canvasId === '') return null;
    const tree = api.canvasTree(canvasId);
    if (tree.length === 0) return null;
    const body = createElement(RenderTree, { nodes: tree });
    return createElement(
      NovaRenderProvider,
      {
        registry,
        dispatch: (event: NovaEvent) => api.dispatch(canvasId, event),
        publish: (channel: string, payload?: unknown) => api.publish(channel, payload),
        fallback,
        textWrapper,
        errorMarker,
      },
      canvasProvider === undefined ? body : createElement(canvasProvider, { canvasId }, body),
    );
  };
  registry.register('CanvasSlot', CanvasSlot, { description: 'A canvas, live from the server.' });

  const ActionSlot: NovaComponent<{ instanceId?: string; canvasId?: string; definitionId?: string }> = ({
    instanceId,
    canvasId,
    definitionId,
    children,
  }: TerminalSlotWrapperProps) => {
    if (slotWrapper === undefined) return createElement(Fragment, { key: instanceId }, children);
    return createElement(slotWrapper, { key: instanceId, instanceId, canvasId, definitionId }, children);
  };
  registry.register('ActionSlot', ActionSlot, { description: 'An action instance boundary from the server; the app slotWrapper wraps it.' });
};
