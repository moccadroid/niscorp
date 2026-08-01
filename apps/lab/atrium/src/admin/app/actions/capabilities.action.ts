import type { ActionDefinition } from '@niscorp/nova';
import { capabilitiesLayout } from './capabilities.layout';
import { panelTriggers } from './panel';

// CAPABILITIES — the two switch sets every resolution in the surface is
// computed from, and the discovery pull that finds new ones.
//
// The app exposes both halves, to the two audiences that own them: the vendor
// console flips `connector_capabilities`, the manager's pane flips
// `property_capabilities`. Nothing in the app reaches both, on purpose — a
// hotel must not withdraw a capability from every hotel, and a vendor must not
// decide which services a hotel sells.
//
// We are the party who may do both, so here both are. Not because the rule is
// soft, but because we are neither of them.
export const capabilitiesAction: ActionDefinition = {
  id: 'admin.capabilities',
  title: 'Capabilities',
  data: { capabilities: {}, selected: {}, stage: {}, sync: [], loading: true, working: false, error: '' },
  layout: capabilitiesLayout,
  endpoints: {
    load: { fn: 'admin.capabilities', target: 'capabilities', errorTarget: 'error' },
    flip: { fn: 'admin.setCapability', errorTarget: 'error' },
    pull: { fn: 'admin.sync', target: 'sync', errorTarget: 'error' },
  },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { set: 'error', value: '' }], onError: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    { event: 'ui:click', ref: 'pick', do: [{ set: 'selected', value: '@event.payload' }, { set: 'sync', value: [] }, { call: 'load' }] },
    // One handler, two altitudes: a row carrying a property_id moves that
    // hotel's enablement, a row without one moves the open connector's offer.
    {
      event: 'ui:click',
      ref: 'flip',
      do: [
        { set: 'stage', value: '@event.payload' },
        { set: 'working', value: true },
        { call: 'flip', onSuccess: [{ set: 'working', value: false }, { call: 'load' }], onError: [{ set: 'working', value: false }] },
      ],
    },
    // Discovery on demand. The reports are the only place a bundle a vendor
    // broke becomes visible — a refusal changes nothing on disk and would
    // otherwise be silent.
    {
      event: 'ui:click',
      ref: 'pull',
      do: [
        { set: 'working', value: true },
        { call: 'pull', onSuccess: [{ set: 'working', value: false }, { call: 'load' }], onError: [{ set: 'working', value: false }] },
      ],
    },
    ...panelTriggers,
  ],
};
