import { createElement, type FC } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
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
    // A root that already holds elements was rendered on the server from the
    // snapshot the wire starts from: adopt those elements instead of replacing
    // them. An empty root is the client-rendered page it always was.
    // Only when there is a frame to adopt them WITH: a wire that did not start
    // from the page's snapshot (it was rendered for somebody else) has nothing
    // that matches, and the elements are replaced as on any other page.
    const adopts = root.firstElementChild !== null && api.frame().length > 0;
    const reactRoot = adopts ? hydrateRoot(root, createElement(Frame)) : createRoot(root);
    const render = (): void => reactRoot.render(createElement(Frame));
    if (!adopts) render();
    return { update: render, destroy: () => reactRoot.unmount() };
  };
};
