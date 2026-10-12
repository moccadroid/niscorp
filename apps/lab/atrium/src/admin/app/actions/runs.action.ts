import type { ActionDefinition } from '@niscorp/nova';
import { runsLayout } from './runs.layout';
import { panelTriggers } from './panel';

export const runsAction: ActionDefinition = {
  id: 'admin.runs',
  title: 'Agent runs',
  data: { runs: {}, open: {}, loading: true, error: '' },
  layout: runsLayout,
  endpoints: { load: { fn: 'admin.runs', target: 'runs', errorTarget: 'error' } },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { set: 'error', value: '' }], onError: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ set: 'open', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'close', do: [{ clear: 'open' }] },
    ...panelTriggers,
  ],
};
