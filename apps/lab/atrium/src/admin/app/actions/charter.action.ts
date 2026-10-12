import type { ActionDefinition } from '@niscorp/nova';
import { charterLayout } from './charter.layout';
import { panelTriggers } from './panel';

export const charterAction: ActionDefinition = {
  id: 'admin.charter',
  title: 'Charter',
  data: { charter: {}, selected: {}, actions: [], probe: {}, holders: [], loading: true, error: '' },
  layout: charterLayout,
  endpoints: {
    load: { fn: 'admin.charter', target: 'charter', errorTarget: 'error' },
    holders: { fn: 'admin.holders', target: 'holders', errorTarget: 'error' },
  },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { set: 'error', value: '' }], onError: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'pick',
      do: [{ set: 'selected', value: '@event.payload' }, { set: 'actions', value: '@event.payload.actions' }, { set: 'holders', value: [] }, { set: 'probe', value: {} }],
    },
    { event: 'ui:click', ref: 'probe', do: [{ set: 'probe', value: '@event.payload' }, { call: 'holders' }] },
    ...panelTriggers,
  ],
};
