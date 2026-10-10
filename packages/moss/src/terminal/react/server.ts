import { renderToString } from 'react-dom/server';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { ComponentRegistry } from '@niscorp/nova';
import { drawnApi } from '../drawn';
import type { DrawnSnapshot } from '../drawn';
import { terminalFrame } from './frame';
import { registerWireSlots } from './slots';
import type { TerminalSlotWrapper } from './slots';

// ═══════════════════════════════════════════════════════════
// @niscorp/moss/terminal/react/server — the React target, drawing to a string.
// The same registry, the same wire slots and the same frame as the browser's
// target (./index), so what a server writes into a document is what the
// browser's target then adopts element for element. A terminal host, like any
// other: it is handed a screen and draws it. Split from ./index so a browser
// bundle never carries react-dom/server, and this never carries react-dom/client.
// ═══════════════════════════════════════════════════════════

export type RenderSnapshotConfig = {
  // the frame and every canvas's tree — moss's `shells.snapshot`
  snapshot: DrawnSnapshot;
  // the app's kit, exactly as the browser's `reactTarget` is given it
  registry: ComponentRegistry<NovaComponent>;
  slotWrapper?: TerminalSlotWrapper;
};

export const renderSnapshot = (config: RenderSnapshotConfig): string => {
  const { snapshot, registry, slotWrapper } = config;
  registerWireSlots(registry, { slotWrapper });
  return renderToString(terminalFrame(drawnApi(snapshot), registry));
};
