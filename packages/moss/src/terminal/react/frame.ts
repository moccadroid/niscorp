import { createElement, type ReactElement } from 'react';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { ComponentRegistry } from '@niscorp/nova';
import type { TerminalApi } from '../index';
import { TerminalApiContext } from './slots';
import type { LeafRenderers } from './slots';

// The frame, as an element: the api provided, the registry bound, the frame's
// tree drawn. One definition for every react-shaped target — the browser's
// (./index), the one that draws to a string (./server) and ink's (../ink) — so
// what a server writes is what the browser then adopts. The twin of
// ../vue/frame.ts.
export const terminalFrame = (api: TerminalApi, registry: ComponentRegistry<NovaComponent>, leaves: LeafRenderers = {}): ReactElement =>
  createElement(
    TerminalApiContext.Provider,
    { value: api },
    createElement(
      NovaRenderProvider,
      {
        registry,
        // the frame is chrome — app events flow only from inside a canvas
        dispatch: () => undefined,
        publish: (channel: string, payload?: unknown) => api.publish(channel, payload),
        ...leaves,
      },
      createElement(RenderTree, { nodes: api.frame() }),
    ),
  );
