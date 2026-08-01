import type { ActionDefinition } from '@niscorp/nova';
import { dockLayout } from './dock.layout';

// The pill, and the only thing an operator sees until they ask for more.
//
// It sits at the bottom of the canvas stack forever: panes push over it,
// popping reveals it again, and it never unmounts — which is why the dock
// remembers it was open while you were two panes deep.
//
// It holds no data about the app it administers. Every fact in this tool is
// loaded by the pane that shows it, so the pill costs one render and no calls:
// opening a customer's page with our key present must not put load on their app
// server, and here it demonstrably cannot.
export const dockAction: ActionDefinition = {
  id: 'admin.dock',
  title: 'Atrium admin',
  data: { open: false },
  layout: dockLayout,
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ set: 'open', value: true }] },
    { event: 'ui:click', ref: 'shut', do: [{ set: 'open', value: false }] },
    // Literal ids rather than one templated push. The targets are real actions
    // in the operator's own catalog, so moss's closure audit can check them at
    // boot — a templated target is exempt from that check, and buying
    // flexibility nobody asked for with a gate we already have is a poor trade.
    { event: 'ui:click', ref: 'explain', do: [{ push: { action: 'admin.explain' } }] },
    { event: 'ui:click', ref: 'charter', do: [{ push: { action: 'admin.charter' } }] },
    { event: 'ui:click', ref: 'catalog', do: [{ push: { action: 'admin.catalog' } }] },
    { event: 'ui:click', ref: 'entries', do: [{ push: { action: 'admin.entries' } }] },
    { event: 'ui:click', ref: 'surface', do: [{ push: { action: 'admin.surface' } }] },
    { event: 'ui:click', ref: 'capabilities', do: [{ push: { action: 'admin.capabilities' } }] },
    { event: 'ui:click', ref: 'shells', do: [{ push: { action: 'admin.shells' } }] },
    { event: 'ui:click', ref: 'timeline', do: [{ push: { action: 'admin.timeline' } }] },
    { event: 'ui:click', ref: 'runs', do: [{ push: { action: 'admin.runs' } }] },
    // A pane closing itself says so; the pill is what owns "open".
    { message: 'admin:close', do: [{ set: 'open', value: false }] },
  ],
};
