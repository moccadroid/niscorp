import type { ActionDefinition } from '@niscorp/nova';
import { loginLayout } from './login.layout';

// The anonymous principal's whole application. There is no auth here beyond
// choosing who to be: the demo's subject is what a token DOES, not how it is
// obtained, so the roles are described on the page and picking one grants it.
//
// `people` arrives as boot input from the server directory — the browser never
// holds the list, it renders one that was handed down.
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
