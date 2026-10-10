import { createElement, type FC } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { ComponentRegistry } from '@niscorp/nova';
import { holdsDrawnScreen } from '../drawn';
import type { Target } from '../index';
import { terminalFrame } from './frame';
import { hideStatus, showStatus } from '../status';
import { registerWireSlots } from './slots';
import type { TerminalSlotWrapper } from './slots';

// ═══════════════════════════════════════════════════════════
// @niscorp/moss/terminal/react — the React render target. The app brings its
// component registry (its design system); this binds it to the wire via
// nova's React adapter. The framework-shaped code lives here, in the subpath,
// never in moss core. The wire-backed slots live in ./slots and the frame in
// ./frame, shared with the other react-shaped target (terminal/ink).
// ═══════════════════════════════════════════════════════════

// What a kit component reads the wire through: what this target renders
// against, the connection's status on it.
export { TerminalApiContext } from './slots';
export type { TerminalSlotWrapper, TerminalSlotWrapperProps } from './slots';

export const reactTarget = (config: { root: HTMLElement; registry: ComponentRegistry<NovaComponent>; slotWrapper?: TerminalSlotWrapper }): Target => {
  const { root, registry, slotWrapper } = config;
  registerWireSlots(registry, { slotWrapper });

  return (api) => {
    const Frame: FC = () => terminalFrame(api, registry);
    // The conductor drives re-render: each `update` re-reads api.frame() and
    // the canvas trees, and React reconciles (preserving focus by node key).
    const adopts = holdsDrawnScreen(root, api);
    showStatus(root, api.status());
    const reactRoot = adopts ? hydrateRoot(root, createElement(Frame)) : createRoot(root);
    const render = (): void => {
      showStatus(root, api.status());
      reactRoot.render(createElement(Frame));
    };
    if (!adopts) render();
    return {
      update: render,
      destroy: () => {
        reactRoot.unmount();
        hideStatus(root);
      },
    };
  };
};
