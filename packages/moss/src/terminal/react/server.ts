import { renderToString } from 'react-dom/server';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { ComponentRegistry } from '@niscorp/nova';
import { drawnApi } from '../drawn';
import type { DrawnSnapshot } from '../drawn';
import { terminalFrame } from './frame';
import { registerWireSlots } from './slots';
import type { TerminalSlotWrapper } from './slots';

export type RenderSnapshotConfig = {
  snapshot: DrawnSnapshot;
  registry: ComponentRegistry<NovaComponent>;
  slotWrapper?: TerminalSlotWrapper;
};

export const renderSnapshot = (config: RenderSnapshotConfig): string => {
  const { snapshot, registry, slotWrapper } = config;
  registerWireSlots(registry, { slotWrapper });
  return renderToString(terminalFrame(drawnApi(snapshot), registry));
};
