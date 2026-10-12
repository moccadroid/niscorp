import type { ActionDefinition } from '@niscorp/nova';
import { signinLayout } from './signin.layout';

export const signinAction: ActionDefinition = {
  id: 'lectern.signin',
  title: 'Speaker sign-in',
  data: { email: '', sending: false, sent: false, error: '' },
  layout: signinLayout,
  endpoints: {
    request: { fn: 'lectern.request', errorTarget: 'error' },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'send',
      do: [
        { set: 'error', value: '' },
        { set: 'sent', value: false },
        { set: 'sending', value: true },
        {
          call: 'request',
          onSuccess: [{ set: 'sending', value: false }, { set: 'sent', value: true }],
          onError: [{ set: 'sending', value: false }],
        },
      ],
    },
  ],
};
