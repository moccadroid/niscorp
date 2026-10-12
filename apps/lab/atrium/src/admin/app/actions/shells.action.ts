import type { ActionDefinition } from '@niscorp/nova';
import { shellsLayout } from './shells.layout';
import { panelTriggers } from './panel';

export const shellsAction: ActionDefinition = {
  id: 'admin.shells',
  title: 'Shells',
  data: { shells: {}, selected: {}, loading: true, working: false, arming: false, done: false, error: '' },
  layout: shellsLayout,
  endpoints: {
    load: { fn: 'admin.shells', target: 'shells', errorTarget: 'error' },
    restart: { fn: 'admin.resetShell', errorTarget: 'error' },
  },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { set: 'error', value: '' }], onError: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    { event: 'ui:click', ref: 'pick', do: [{ set: 'selected', value: '@event.payload' }, { set: 'arming', value: false }, { set: 'done', value: false }, { set: 'error', value: '' }] },
    { event: 'ui:click', ref: 'arm', do: [{ set: 'arming', value: true }, { set: 'done', value: false }, { set: 'error', value: '' }] },
    { event: 'ui:click', ref: 'cancel', do: [{ set: 'arming', value: false }] },
    {
      event: 'ui:click',
      ref: 'restart',
      do: [
        { set: 'working', value: true },
        {
          call: 'restart',
          onSuccess: [{ set: 'working', value: false }, { set: 'arming', value: false }, { set: 'done', value: true }, { set: 'selected', value: {} }, { call: 'load' }],
          onError: [{ set: 'working', value: false }, { set: 'arming', value: false }],
        },
      ],
    },
    ...panelTriggers,
  ],
};
