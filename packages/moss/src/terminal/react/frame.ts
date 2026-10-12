import { createElement, type ReactElement } from 'react';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { ComponentRegistry } from '@niscorp/nova';
import type { TerminalApi } from '../index';
import { TerminalApiContext } from './slots';
import type { LeafRenderers } from './slots';

export const terminalFrame = (api: TerminalApi, registry: ComponentRegistry<NovaComponent>, leaves: LeafRenderers = {}): ReactElement =>
  createElement(
    TerminalApiContext.Provider,
    { value: api },
    createElement(
      NovaRenderProvider,
      {
        registry,
        // The frame is chrome: events come only from inside a canvas.
        dispatch: () => undefined,
        publish: (channel: string, payload?: unknown) => api.publish(channel, payload),
        ...leaves,
      },
      createElement(RenderTree, { nodes: api.frame() }),
    ),
  );
