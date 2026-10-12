import type { ActionDefinition } from '@niscorp/nova';
import { explainLayout } from './explain.layout';
import { panelTriggers } from './panel';

export const explainAction: ActionDefinition = {
  id: 'admin.explain',
  title: 'Explain',
  data: { explain: {}, principal: {}, state: 'any', loading: true, error: '' },
  layout: explainLayout,
  endpoints: { load: { fn: 'admin.explain', target: 'explain', errorTarget: 'error' } },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { set: 'error', value: '' }], onError: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    { event: 'ui:click', ref: 'pick', do: [{ set: 'principal', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'state', do: [{ set: 'state', value: '@event.payload' }, { call: 'load' }] },
    ...panelTriggers,
  ],
};
