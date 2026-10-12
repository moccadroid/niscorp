import type { ActionDefinition } from '@niscorp/nova';
import { timelineLayout } from './timeline.layout';
import { panelTriggers } from './panel';

export const timelineAction: ActionDefinition = {
  id: 'admin.timeline',
  title: 'Timeline',
  data: { timeline: {}, principal: {}, loading: true, error: '' },
  layout: timelineLayout,
  endpoints: { load: { fn: 'admin.timeline', target: 'timeline', errorTarget: 'error' } },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { set: 'error', value: '' }], onError: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    { event: 'ui:click', ref: 'pick', do: [{ set: 'principal', value: '@event.payload' }, { call: 'load' }] },
    ...panelTriggers,
  ],
};
