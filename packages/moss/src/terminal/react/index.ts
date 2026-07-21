import { createElement, type FC } from 'react';
import { createRoot } from 'react-dom/client';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { ComponentRegistry } from '@niscorp/nova';
import type { Target } from '../index';
import { TerminalApiContext, registerWireSlots } from './slots';
import type { TerminalSlotWrapper } from './slots';

// ═══════════════════════════════════════════════════════════
// @niscorp/moss/terminal/react — the React render target. The app brings its
// component registry (its design system); this binds it to the wire via
// nova's React adapter. The framework-shaped code lives here, in the subpath,
// never in moss core. The wire-backed slots live in ./slots, shared with the
// other react-shaped target (terminal/ink).
// ═══════════════════════════════════════════════════════════

export { TerminalApiContext, registerWireSlots } from './slots';
export type { TerminalSlotWrapper, TerminalSlotWrapperProps, WireSlotOptions } from './slots';

export const reactTarget = (config: { root: HTMLElement; registry: ComponentRegistry<NovaComponent>; slotWrapper?: TerminalSlotWrapper }): Target => {
  const { root, registry, slotWrapper } = config;
  registerWireSlots(registry, { slotWrapper });

  return (api) => {
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
