import { createApp, createSSRApp, shallowRef } from 'vue';
import type { NovaComponent } from '@niscorp/nova/adapters/vue';
import type { ComponentRegistry } from '@niscorp/nova';
import { hideStatus, holdsDrawnScreen, showStatus } from '../targets';
import type { Target, TerminalApi } from '../index';
import { registerWireSlots, terminalFrame } from './slots';
import type { TerminalSlotWrapper } from './slots';

export { TerminalApiKey } from './slots';
export type { TerminalSlotWrapper, TerminalSlotWrapperProps } from './slots';

export type VueTargetConfig = {
  root: HTMLElement;
  registry: ComponentRegistry<NovaComponent>;
  slotWrapper?: TerminalSlotWrapper;
};

export const vueTarget = (config: VueTargetConfig): Target => {
  const { root, registry, slotWrapper } = config;
  registerWireSlots(registry, slotWrapper);

  return (api) => {
    // Each read of the wire touches the revision, so the render functions that made one run again
    // when `update` bumps it.
    const revision = shallowRef(0);
    const live: TerminalApi = {
      frame: () => {
        void revision.value;
        return api.frame();
      },
      canvasTree: (canvasId) => {
        void revision.value;
        return api.canvasTree(canvasId);
      },
      dispatch: (canvasId, event) => api.dispatch(canvasId, event),
      publish: (channel, payload) => api.publish(channel, payload),
      status: () => {
        void revision.value;
        return api.status();
      },
    };

    const Frame = terminalFrame(live, registry);

    const adopts = holdsDrawnScreen(root, api);
    showStatus(root, api.status());
    const app = adopts ? createSSRApp(Frame) : createApp(Frame);
    app.mount(root);
    return {
      update: () => {
        showStatus(root, api.status());
        revision.value += 1;
      },
      destroy: () => {
        app.unmount();
        hideStatus(root);
      },
    };
  };
};
