import type { ActionDefinition } from '@niscorp/nova';
import { surfaceLayout } from './surface.layout';
import { panelTriggers } from './panel';

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
    {
      event: 'ui:click',
      ref: 'flip',
      do: [
        { set: 'stage', value: '@event.payload' },
        { set: 'working', value: true },
        { call: 'flip', onSuccess: [{ set: 'working', value: false }, { call: 'load' }], onError: [{ set: 'working', value: false }] },
      ],
    },
    ...panelTriggers,
  ],
};
