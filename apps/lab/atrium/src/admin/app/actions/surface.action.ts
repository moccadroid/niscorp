import type { ActionDefinition } from '@niscorp/nova';
import { surfaceLayout } from './surface.layout';
import { panelTriggers } from './panel';

// THE RESOLVED SURFACE — `surface_slots` × `properties`, with the resolver's
// verdict on each pair and the reason it decided that way.
//
// The app has two panes that show a slice of this, and both are right for their
// audience and useless for ours: the vendor's rollout table is one connector,
// the manager's integrations list is one hotel looking outward. Neither can
// answer "why is check-in dark at Casa Marisol", because the factors that decide
// it belong to different people. Here they are one row.
//
// The switch on the end is `surface_slots.enabled`, and it is ours alone. A
// hotel switching a service off writes `property_capabilities`, a vendor
// withdrawing one writes `connector_capabilities`, and this writes neither: it
// retires a surface WE shipped, which is the one thing neither of them can do.
export const surfaceAction: ActionDefinition = {
  id: 'admin.surface',
  title: 'Surface',
  data: { surface: {}, property: {}, stage: {}, loading: true, working: false, error: '' },
  layout: surfaceLayout,
  endpoints: {
    load: { fn: 'admin.surface', target: 'surface', errorTarget: 'error' },
    flip: { fn: 'admin.setSlot', errorTarget: 'error' },
  },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { set: 'error', value: '' }], onError: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    { event: 'ui:click', ref: 'pick', do: [{ set: 'property', value: '@event.payload' }, { call: 'load' }] },
    // One ref for both directions: the row carries its own state and the handler
    // posts the opposite. A "withdraw" ref and a "restore" ref would be the same
    // decision written twice, and one of them would eventually drift.
    {
      event: 'ui:click',
      ref: 'flip',
      do: [
        { set: 'stage', value: '@event.payload' },
        { set: 'working', value: true },
        // The seam resolves and refreshes before it answers, so by the time
        // `load` re-reads, every living shell in the app has already adopted.
        { call: 'flip', onSuccess: [{ set: 'working', value: false }, { call: 'load' }], onError: [{ set: 'working', value: false }] },
      ],
    },
    ...panelTriggers,
  ],
};
