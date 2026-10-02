import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { ComponentRegistry, RenderNode } from '@niscorp/nova';
import { TerminalApiContext, registerWireSlots } from './slots';
import type { TerminalSlotWrapper } from './slots';

// ═══════════════════════════════════════════════════════════
// @niscorp/moss/terminal/react/server — the React target, drawing to a string.
// The same registry, the same wire slots and the same tree as the browser's
// target (./index), so what a server writes into a document is what the
// browser's target then adopts element for element. A terminal host, like any
// other: it is handed a screen and draws it. Split from ./index so a browser
// bundle never carries react-dom/server, and this never carries react-dom/client.
// ═══════════════════════════════════════════════════════════

export type RenderSnapshotConfig = {
  // the frame and every canvas's tree — moss's `shells.snapshot`
  snapshot: { frame: RenderNode[]; trees: Record<string, RenderNode[]> };
  // the app's kit, exactly as the browser's `reactTarget` is given it
  registry: ComponentRegistry<NovaComponent>;
  slotWrapper?: TerminalSlotWrapper;
};

const nothing = (): void => undefined;

export const renderSnapshot = (config: RenderSnapshotConfig): string => {
  const { snapshot, registry, slotWrapper } = config;
  registerWireSlots(registry, { slotWrapper });
  const api = {
    frame: () => snapshot.frame,
    canvasTree: (id: string) => snapshot.trees[id] ?? [],
    // a string has nobody to press it
    dispatch: nothing,
    publish: nothing,
  };
  return renderToString(
    createElement(
      TerminalApiContext.Provider,
      { value: api },
      createElement(NovaRenderProvider, { registry, dispatch: nothing, publish: nothing }, createElement(RenderTree, { nodes: api.frame() })),
    ),
  );
};
