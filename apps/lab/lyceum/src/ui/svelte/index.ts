import { mount, unmount } from 'svelte';
import { createSubscriber } from 'svelte/reactivity';
import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME, createComponentRegistry } from '@niscorp/nova';
import type { Target, TerminalApi } from '@niscorp/moss/terminal';
import ActionSlot from './ActionSlot.svelte';
import CanvasSlot from './CanvasSlot.svelte';
import Frame from './Frame.svelte';
import { SVELTE_KIT } from './kit';
import { frameContext, type SvelteKitComponent } from './context';

// Nova's tree drawn by Svelte: the kit's components under a walker of its own,
// and the slots drawing the boxes the stylesheet lays the screen out by.
export const svelteRenderer = (host: HTMLElement): Target => (api) => {
  const registry = createComponentRegistry<SvelteKitComponent>();
  registry.registerAll(SVELTE_KIT);
  registry.register(CANVAS_SLOT_NAME, CanvasSlot);
  registry.register(ACTION_SLOT_NAME, ActionSlot);

  // Every read of a tree subscribes whatever drew it; a new frame runs those again.
  let changed = (): void => undefined;
  const subscribe = createSubscriber((update) => {
    changed = update;
    return () => {
      changed = () => undefined;
    };
  });
  const live: TerminalApi = {
    frame: () => {
      subscribe();
      return api.frame();
    },
    canvasTree: (canvasId) => {
      subscribe();
      return api.canvasTree(canvasId);
    },
    dispatch: (canvasId, event) => api.dispatch(canvasId, event),
    publish: (channel, payload) => api.publish(channel, payload),
    status: () => api.status(),
  };

  const app = mount(Frame, { target: host, context: frameContext(live, registry) });
  return {
    update: () => changed(),
    destroy: () => void unmount(app),
  };
};
