import type { ActionDefinition } from '@niscorp/nova';
import { dockLayout } from './dock.layout';

export const dockAction: ActionDefinition = {
  id: 'admin.dock',
  title: 'Atrium admin',
  data: { open: false },
  layout: dockLayout,
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ set: 'open', value: true }] },
    { event: 'ui:click', ref: 'shut', do: [{ set: 'open', value: false }] },
    // Literal ids, not one templated push: moss's closure audit checks a literal
    // target at boot and exempts a templated one.
    { event: 'ui:click', ref: 'explain', do: [{ push: { action: 'admin.explain' } }] },
    { event: 'ui:click', ref: 'charter', do: [{ push: { action: 'admin.charter' } }] },
    { event: 'ui:click', ref: 'catalog', do: [{ push: { action: 'admin.catalog' } }] },
    { event: 'ui:click', ref: 'entries', do: [{ push: { action: 'admin.entries' } }] },
    { event: 'ui:click', ref: 'surface', do: [{ push: { action: 'admin.surface' } }] },
    { event: 'ui:click', ref: 'capabilities', do: [{ push: { action: 'admin.capabilities' } }] },
    { event: 'ui:click', ref: 'shells', do: [{ push: { action: 'admin.shells' } }] },
    { event: 'ui:click', ref: 'timeline', do: [{ push: { action: 'admin.timeline' } }] },
    { event: 'ui:click', ref: 'runs', do: [{ push: { action: 'admin.runs' } }] },
    { message: 'admin:close', do: [{ set: 'open', value: false }] },
  ],
};
