import type { ActionDefinition } from '@niscorp/nova';
import { capabilitiesLayout } from './capabilities.layout';
import { panelTriggers } from './panel';

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
    {
      event: 'ui:click',
      ref: 'flip',
      do: [
        { set: 'stage', value: '@event.payload' },
        { set: 'working', value: true },
        { call: 'flip', onSuccess: [{ set: 'working', value: false }, { call: 'load' }], onError: [{ set: 'working', value: false }] },
      ],
    },
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
