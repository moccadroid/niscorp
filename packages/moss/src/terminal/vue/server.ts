import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import type { NovaComponent } from '@niscorp/nova/adapters/vue';
import type { ComponentRegistry, RenderNode } from '@niscorp/nova';
import { registerWireSlots, terminalFrame } from './index';
import type { TerminalSlotWrapper } from './index';

// ═══════════════════════════════════════════════════════════
// @niscorp/moss/terminal/vue/server — the Vue target, drawing to a string. The
// twin of terminal/react/server: the same registry, the same wire slots, the
// same frame component as the browser's target, so the browser adopts what
// this wrote. Vue's own server renderer is asynchronous, so this is too.
// ═══════════════════════════════════════════════════════════

export type RenderSnapshotConfig = {
  snapshot: { frame: RenderNode[]; trees: Record<string, RenderNode[]> };
  registry: ComponentRegistry<NovaComponent>;
  slotWrapper?: TerminalSlotWrapper;
};

const nothing = (): void => undefined;

export const renderSnapshot = (config: RenderSnapshotConfig): Promise<string> => {
  const { snapshot, registry, slotWrapper } = config;
  registerWireSlots(registry, slotWrapper);
  const api = {
    frame: () => snapshot.frame,
    canvasTree: (id: string) => snapshot.trees[id] ?? [],
    // a string has nobody to press it
    dispatch: nothing,
    publish: nothing,
  };
  return renderToString(createSSRApp(terminalFrame(api, registry)));
};
