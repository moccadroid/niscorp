import { defineComponent, h, provide, type Component } from 'vue';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/adapters/vue';
import type { NovaComponent } from '@niscorp/nova/adapters/vue';
import type { ComponentRegistry } from '@niscorp/nova';
import type { TerminalApi } from '../index';
import { TerminalApiKey } from './slots';

const noDispatch = (): void => undefined;

// The frame, as a component: the api provided, the registry bound, the frame's
// tree drawn. One definition for the browser's target (./index) and the one
// that draws to a string (./server), so what a server writes is what the
// browser then adopts. The twin of ../react/frame.ts.
export const terminalFrame = (api: TerminalApi, registry: ComponentRegistry<NovaComponent>): Component =>
  defineComponent(
    () => {
      provide(TerminalApiKey, api);
      return () =>
        h(
          NovaRenderProvider,
          // the frame is chrome — app events flow only from inside a canvas
          { registry, dispatch: noDispatch, publish: api.publish },
          { default: () => h(RenderTree, { nodes: api.frame() }) },
        );
    },
    { name: 'MossTerminalFrame' },
  );
