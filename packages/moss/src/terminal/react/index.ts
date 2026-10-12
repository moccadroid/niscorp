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

export { TerminalApiContext } from './slots';
export type { TerminalSlotWrapper, TerminalSlotWrapperProps } from './slots';

export const reactTarget = (config: { root: HTMLElement; registry: ComponentRegistry<NovaComponent>; slotWrapper?: TerminalSlotWrapper }): Target => {
  const { root, registry, slotWrapper } = config;
  registerWireSlots(registry, { slotWrapper });

  return (api) => {
    const Frame: FC = () => terminalFrame(api, registry);
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
