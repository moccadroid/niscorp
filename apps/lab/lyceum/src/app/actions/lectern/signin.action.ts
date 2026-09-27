import type { ActionDefinition } from '@niscorp/nova';
import { signinLayout } from './signin.layout';

// THE SPEAKER'S SIGN-IN DESK — the whole application of a device that opened
// /speaker (server/login.ts gives it a principal of its own, granted only
// this). Asking is a server function: it mails a one-time link if the address
// is the speaker's, and answers the same either way. The link, opened, signs
// that device in as the speaker.
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
