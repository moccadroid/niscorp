import { createContext, createElement, Fragment, useContext, type FC, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { ComponentRegistry, NovaEvent } from '@niscorp/nova';
import type { Target, TerminalApi } from '../index';

// ═══════════════════════════════════════════════════════════
// @niscorp/moss/terminal/react — the React render target. The app brings its
// component registry (its design system); this binds it to the wire via
// nova's React adapter. The framework-shaped code lives here, in the subpath,
// never in moss core.
// ═══════════════════════════════════════════════════════════

const TerminalApiContext = createContext<TerminalApi | undefined>(undefined);

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

export const reactTarget = (config: { registry: ComponentRegistry<NovaComponent>; slotWrapper?: TerminalSlotWrapper }): Target => {
  const { registry, slotWrapper } = config;

  // The wire-backed CanvasSlot: a served CanvasSlot marker in the frame
  // resolves to that canvas's live tree, dispatching events tagged with the
  // canvas (the server stamps origin). It overrides nova's shell-backed
  // CanvasSlot, which the terminal has no shell for.
  const CanvasSlot: NovaComponent<{ canvasId?: string }> = ({ canvasId }: { canvasId?: string }) => {
    const api = useContext(TerminalApiContext);
    if (api === undefined || canvasId === undefined || canvasId === '') return null;
    const tree = api.canvasTree(canvasId);
    if (tree.length === 0) return null;
    return createElement(
      NovaRenderProvider,
      {
        registry,
        dispatch: (event: NovaEvent) => api.dispatch(canvasId, event),
        publish: (channel: string, payload?: unknown) => api.publish(channel, payload),
      },
      createElement(RenderTree, { nodes: tree }),
    );
  };
  registry.register('CanvasSlot', CanvasSlot, { description: 'A canvas, live from the server.' });

  // The wire-backed ActionSlot: the per-instance boundary a served tree
  // carries (identity in props, rendered content as children). With no
  // wrapper it's transparent; with one, the wrapper decides everything
  // (wrap or pass through — policy lives in the wrapper). Keyed by
  // instanceId so an instance swap REMOUNTS: no stale DOM state crossing
  // instances, enter animations fire. It overrides nova's shell-backed
  // ActionSlot, which the terminal has no shell for.
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

  return (root, api) => {
    const reactRoot = createRoot(root);
    const Frame: FC = () =>
      createElement(
        TerminalApiContext.Provider,
        { value: api },
        createElement(
          NovaRenderProvider,
          {
            registry,
            // the frame is chrome — app events flow only from inside a canvas
            dispatch: () => undefined,
            publish: (channel: string, payload?: unknown) => api.publish(channel, payload),
          },
          createElement(RenderTree, { nodes: api.frame() }),
        ),
      );
    // The conductor drives re-render: each `update` re-reads api.frame() and
    // the canvas trees, and React reconciles (preserving focus by node key).
    const render = (): void => reactRoot.render(createElement(Frame));
    render();
    return { update: render, destroy: () => reactRoot.unmount() };
  };
};
