import type { ActionDefinition } from '@niscorp/nova';
import { loginLayout } from './login.layout';

export const loginAction: ActionDefinition = {
  id: 'auth.login',
  title: 'Atrium',
  data: { people: [], pending: '', error: '' },
  layout: loginLayout,
  endpoints: {
    enter: { fn: 'auth.enter', errorTarget: 'error' },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'pick',
      do: [
        { set: 'pending', value: '@event.payload' },
        { call: 'enter', onError: [{ set: 'pending', value: '' }] },
      ],
    },
  ],
};
