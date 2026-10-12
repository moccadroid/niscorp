import type { ActionDefinition } from '@niscorp/nova';
import { entriesLayout } from './entries.layout';
import { panelTriggers } from './panel';

export const entriesAction: ActionDefinition = {
  id: 'admin.entries',
  title: 'Entries',
  data: { api: {}, filter: '', selected: {}, loading: true, error: '' },
  layout: entriesLayout,
  endpoints: { load: { fn: 'admin.entries', target: 'api', errorTarget: 'error' } },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { set: 'error', value: '' }], onError: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    { event: 'ui:model', ref: 'filter', do: [{ set: 'filter', value: '@event.value' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'pick', do: [{ set: 'selected', value: '@event.payload' }] },
    ...panelTriggers,
  ],
};
