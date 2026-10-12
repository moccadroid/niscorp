import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import type { NovaComponent } from '@niscorp/nova/adapters/vue';
import type { ComponentRegistry } from '@niscorp/nova';
import { drawnApi } from '../targets';
import type { DrawnSnapshot } from '../targets';
import { registerWireSlots, terminalFrame } from './slots';
import type { TerminalSlotWrapper } from './slots';

export type RenderSnapshotConfig = {
  snapshot: DrawnSnapshot;
  registry: ComponentRegistry<NovaComponent>;
  slotWrapper?: TerminalSlotWrapper;
};

export const renderSnapshot = (config: RenderSnapshotConfig): Promise<string> => {
  const { snapshot, registry, slotWrapper } = config;
  registerWireSlots(registry, slotWrapper);
  return renderToString(createSSRApp(terminalFrame(drawnApi(snapshot), registry)));
};
