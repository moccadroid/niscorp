import { defineComponent, Fragment, h, inject, type Component, type InjectionKey } from 'vue';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/adapters/vue';
import type { NovaComponent } from '@niscorp/nova/adapters/vue';
import type { ComponentRegistry } from '@niscorp/nova';
import type { TerminalApi } from '../index';
import { actionSlotOf, canvasSlotOf, registerSlots } from '../slots';

export const TerminalApiKey: InjectionKey<TerminalApi> = Symbol.for('@niscorp/moss/terminal/vue:api');

export type TerminalSlotWrapperProps = {
  canvasId?: string;
  instanceId?: string;
  definitionId?: string;
};
export type TerminalSlotWrapper = Component;

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
        // Keyed by instance, so a swap of instances remounts and no view state crosses over.
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
