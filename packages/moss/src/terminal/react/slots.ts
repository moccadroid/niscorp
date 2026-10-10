import { createContext, createElement, Fragment, useContext, type ComponentType, type FC, type ReactNode } from 'react';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { ComponentRegistry } from '@niscorp/nova';
import type { TerminalApi } from '../index';
import { actionSlotOf, canvasSlotOf, registerSlots } from '../slots';

// ═══════════════════════════════════════════════════════════
// The wire-backed structural slots as React components, shared by every
// react-shaped render target (terminal/react in the browser, terminal/ink in a
// TTY) — same seam, different renderer. What a slot IS — which tree it draws,
// where its events go — is ../slots.ts, the same for every framework. Split
// from the react target so the ink bundle never drags react-dom.
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

// The host-specific leaf renderers a react-shaped target threads through to
// nova's provider: ink needs all three, the browser none.
export type LeafRenderers = {
  fallback?: NovaComponent;
  textWrapper?: ComponentType<{ children?: ReactNode }>;
  errorMarker?: ComponentType<{ code: string; message: string }>;
};

export type WireSlotOptions = LeafRenderers & {
  slotWrapper?: TerminalSlotWrapper;
  // wraps each canvas's rendered tree with a host context (ink provides the
  // per-canvas marker resolver here); the browser omits it
  canvasProvider?: ComponentType<{ canvasId: string; children?: ReactNode }>;
  // the same, per action instance — inside a list canvas several instances
  // share refs, so ink resolves markers per instance here
  instanceProvider?: ComponentType<{ canvasId: string; instanceId: string; children?: ReactNode }>;
};

// Register the wire-backed structural slots on a registry (../slots.ts says
// what each is). With no wrapper an ActionSlot is transparent; with one, the
// wrapper decides everything. Keyed by instanceId so an instance swap
// REMOUNTS: no stale view state crossing instances.
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
