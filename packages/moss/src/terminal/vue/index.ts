import { createApp, defineComponent, Fragment, h, inject, provide, shallowRef, type Component, type InjectionKey } from 'vue';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/adapters/vue';
import type { NovaComponent } from '@niscorp/nova/adapters/vue';
import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME, scopeDispatch } from '@niscorp/nova';
import type { ComponentRegistry, NovaEvent } from '@niscorp/nova';
import type { Target, TerminalApi } from '../index';

// ═══════════════════════════════════════════════════════════
// @niscorp/moss/terminal/vue — the Vue render target. The app brings its
// component registry (its design system); this binds it to the wire via
// nova's Vue adapter. The twin of terminal/react: the same wire-backed slots,
// the same origin rule, framework-shaped code kept in this subpath.
//
// Re-render is REACTIVE, never a remount. The target hands its tree a LIVE
// view of the api whose `frame()` / `canvasTree()` read a revision ref; the
// conductor's `update` bumps it, and exactly the render functions that read
// the wire — the frame and each CanvasSlot — re-run. Vue patches the DOM in
// place, so focus, carets and Input drafts survive every update.
// ═══════════════════════════════════════════════════════════

// The live TerminalApi, for any kit component that needs the wire itself.
// Reading `frame()` / `canvasTree()` inside a render function subscribes that
// render to wire updates.
export const TerminalApiKey: InjectionKey<TerminalApi> = Symbol.for('@niscorp/moss/terminal/vue:api');

// An app-supplied component wrapping each action instance at the ActionSlot
// boundary — the terminal twin of nova's SlotWrapper. It receives these props
// (identity only — served trees carry ids, not definitions) and the instance's
// content as its default slot.
export type TerminalSlotWrapperProps = {
  canvasId?: string;
  instanceId?: string;
  definitionId?: string;
};
export type TerminalSlotWrapper = Component;

export type VueTargetConfig = {
  root: HTMLElement;
  registry: ComponentRegistry<NovaComponent>;
  slotWrapper?: TerminalSlotWrapper;
};

const noDispatch = (): void => undefined;

// Register the wire-backed structural slots on a registry, overriding nova's
// shell-backed pair (the terminal has no shell):
//
// - CanvasSlot: a served CanvasSlot marker in the frame resolves to that
//   canvas's live tree, dispatching events tagged with the canvas.
// - ActionSlot: the per-instance boundary a served tree carries (identity in
//   props, rendered content as children). Keyed by instanceId so an instance
//   swap REMOUNTS — no stale view state crossing instances. Origin is decided
//   HERE, where instance identity lives: a list canvas renders several live
//   cards at once, and a click inside THIS boundary must reach THIS instance's
//   triggers. Events that already carry an origin keep it (core's
//   scopeDispatch).
const registerWireSlots = (registry: ComponentRegistry<NovaComponent>, slotWrapper: TerminalSlotWrapper | undefined): void => {
  const CanvasSlot = defineComponent(
    (props: { canvasId?: string }) => {
      const api = inject(TerminalApiKey, undefined);
      return () => {
        const canvasId = props.canvasId;
        if (api === undefined || canvasId === undefined || canvasId === '') return null;
        const tree = api.canvasTree(canvasId);
        if (tree.length === 0) return null;
        return h(
          NovaRenderProvider,
          {
            registry,
            dispatch: (event: NovaEvent) => api.dispatch(canvasId, event),
            publish: (channel: string, payload?: unknown) => api.publish(channel, payload),
          },
          { default: () => h(RenderTree, { nodes: tree }) },
        );
      };
    },
    { name: 'MossCanvasSlot', props: ['canvasId'], inheritAttrs: false },
  );
  registry.register(CANVAS_SLOT_NAME, CanvasSlot, { description: 'A canvas, live from the server.' });

  const ActionSlot = defineComponent(
    (props: TerminalSlotWrapperProps, { slots }) => {
      const api = inject(TerminalApiKey, undefined);
      return () => {
        const { instanceId, canvasId, definitionId } = props;
        const wrapped =
          slotWrapper === undefined
            ? h(Fragment, { key: instanceId }, slots.default?.() ?? [])
            : h(slotWrapper, { key: instanceId, instanceId, canvasId, definitionId }, { default: () => slots.default?.() });
        if (api === undefined || instanceId === undefined || canvasId === undefined) return wrapped;
        return h(
          NovaRenderProvider,
          {
            registry,
            dispatch: scopeDispatch((event: NovaEvent) => api.dispatch(canvasId, event), instanceId),
            publish: (channel: string, payload?: unknown) => api.publish(channel, payload),
          },
          { default: () => wrapped },
        );
      };
    },
    { name: 'MossActionSlot', props: ['instanceId', 'canvasId', 'definitionId'], inheritAttrs: false },
  );
  registry.register(ACTION_SLOT_NAME, ActionSlot, {
    description: 'An action instance boundary from the server; the app slotWrapper wraps it.',
  });
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
    };

    const Frame = defineComponent(
      () => {
        provide(TerminalApiKey, live);
        return () =>
          h(
            NovaRenderProvider,
            // the frame is chrome — app events flow only from inside a canvas
            { registry, dispatch: noDispatch, publish: live.publish },
            { default: () => h(RenderTree, { nodes: live.frame() }) },
          );
      },
      { name: 'MossTerminalFrame' },
    );

    const app = createApp(Frame);
    app.mount(root);
    return {
      update: () => {
        revision.value += 1;
      },
      destroy: () => app.unmount(),
    };
  };
};
