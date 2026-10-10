import { createApp, createSSRApp, shallowRef } from 'vue';
import type { NovaComponent } from '@niscorp/nova/adapters/vue';
import type { ComponentRegistry } from '@niscorp/nova';
import { holdsDrawnScreen } from '../drawn';
import type { Target, TerminalApi } from '../index';
import { hideStatus, showStatus } from '../status';
import { terminalFrame } from './frame';
import { registerWireSlots } from './slots';
import type { TerminalSlotWrapper } from './slots';

// ═══════════════════════════════════════════════════════════
// @niscorp/moss/terminal/vue — the Vue render target. The app brings its
// component registry (its design system); this binds it to the wire via
// nova's Vue adapter. The twin of terminal/react: the same wire-backed slots
// (./slots), the same frame (./frame), framework-shaped code kept in this
// subpath.
//
// Re-render is REACTIVE, never a remount. The target hands its tree a LIVE
// view of the api whose `frame()` / `canvasTree()` / `status()` read a revision
// ref; the conductor's `update` bumps it, and exactly the render functions that
// read the wire — the frame, each CanvasSlot, a kit component that draws the
// status — re-run. Vue patches the DOM in place, so focus, carets and Input
// drafts survive every update.
// ═══════════════════════════════════════════════════════════

export { terminalFrame } from './frame';
export { TerminalApiKey, registerWireSlots } from './slots';
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
    // The revision every wire read depends on. shallowRef: a counter, and the
    // trees behind it are the wire's own immutable snapshots.
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
