import { defineComponent, h, provide, type Component } from 'vue';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/adapters/vue';
import type { NovaComponent } from '@niscorp/nova/adapters/vue';
import type { ComponentRegistry } from '@niscorp/nova';
import type { TerminalApi } from '../index';
import { TerminalApiKey } from './slots';

const noDispatch = (): void => undefined;

export const terminalFrame = (api: TerminalApi, registry: ComponentRegistry<NovaComponent>): Component =>
  defineComponent(
    () => {
      provide(TerminalApiKey, api);
      return () =>
        h(
          NovaRenderProvider,
          // The frame is chrome: events come only from inside a canvas.
          { registry, dispatch: noDispatch, publish: api.publish },
          { default: () => h(RenderTree, { nodes: api.frame() }) },
        );
    },
    { name: 'MossTerminalFrame' },
  );
