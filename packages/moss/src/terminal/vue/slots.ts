import { defineComponent, Fragment, h, inject, type Component, type InjectionKey } from 'vue';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/adapters/vue';
import type { NovaComponent } from '@niscorp/nova/adapters/vue';
import type { ComponentRegistry } from '@niscorp/nova';
import type { TerminalApi } from '../index';
import { actionSlotOf, canvasSlotOf, registerSlots } from '../slots';

// ═══════════════════════════════════════════════════════════
// The wire-backed structural slots as Vue components — the twin of
// ../react/slots.ts. What a slot IS — which tree it draws, where its events
// go — is ../slots.ts, the same for every framework.
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

// Register the wire-backed structural slots on a registry (../slots.ts says
// what each is). An ActionSlot is keyed by instanceId so an instance swap
// REMOUNTS — no stale view state crossing instances.
export const registerWireSlots = (registry: ComponentRegistry<NovaComponent>, slotWrapper: TerminalSlotWrapper | undefined): void => {
  const CanvasSlot = defineComponent(
    (props: { canvasId?: string }) => {
      const api = inject(TerminalApiKey, undefined);
      return () => {
        const slot = canvasSlotOf(api, props.canvasId);
        if (slot === undefined) return null;
        return h(NovaRenderProvider, { registry, dispatch: slot.dispatch, publish: slot.publish }, { default: () => h(RenderTree, { nodes: slot.tree }) });
      };
    },
    { name: 'MossCanvasSlot', props: ['canvasId'], inheritAttrs: false },
  );

  const ActionSlot = defineComponent(
    (props: TerminalSlotWrapperProps, { slots }) => {
      const api = inject(TerminalApiKey, undefined);
      return () => {
        const { instanceId, canvasId, definitionId } = props;
        const wrapped =
          slotWrapper === undefined
            ? h(Fragment, { key: instanceId }, slots.default?.() ?? [])
            : h(slotWrapper, { key: instanceId, instanceId, canvasId, definitionId }, { default: () => slots.default?.() });
        const slot = actionSlotOf(api, canvasId, instanceId);
        if (slot === undefined) return wrapped;
        return h(NovaRenderProvider, { registry, dispatch: slot.dispatch, publish: slot.publish }, { default: () => wrapped });
      };
    },
    { name: 'MossActionSlot', props: ['instanceId', 'canvasId', 'definitionId'], inheritAttrs: false },
  );

  registerSlots(registry, { canvas: CanvasSlot, action: ActionSlot });
};
