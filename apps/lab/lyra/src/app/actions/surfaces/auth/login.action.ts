import type { ActionDefinition } from '@niscorp/nova';
import { loginLayout } from './login.layout';

export const authLoginAction: ActionDefinition = {
  id: 'auth.login',
  title: 'Sign in',
  data: {
    email: '',
    sent: false,
    error: '',
    busy: false,
    people: [],
  },
  layout: loginLayout,
  endpoints: {
    request: { fn: 'auth.request', errorTarget: 'error' },
    enter: { fn: 'auth.enter', errorTarget: 'error' },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'send',
      do: [
        { set: 'error', value: '' },
        { set: 'busy', value: true },
        {
          call: 'request',
          onSuccess: [
            { set: 'busy', value: false },
            { set: 'sent', value: true },
          ],
          onError: [{ set: 'busy', value: false }],
        },
      ],
    },
    // The picker: choosing a name IS the auth in the lab, exactly as clicking
    // the link would be. One trigger, because the payload carries who.
    {
      event: 'ui:click',
      ref: 'as',
      do: [
        { set: 'error', value: '' },
        { set: 'email', value: '@event.payload.email' },
        { call: 'enter', onError: [{ set: 'busy', value: false }] },
      ],
    },
    { event: 'ui:click', ref: 'back', do: [{ set: 'sent', value: false }] },
  ],
};
