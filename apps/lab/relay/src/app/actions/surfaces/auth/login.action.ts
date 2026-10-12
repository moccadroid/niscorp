import type { ActionDefinition } from '@niscorp/nova';
import { loginLayout } from './login.layout';

// `redeem` grants the session on the server and the terminal reconnects signed
// in: this action navigates nowhere itself.
export const loginAction: ActionDefinition = {
  id: 'auth.login',
  name: 'Sign in',
  data: { stage: 'user', username: '', error: '' },
  layout: loginLayout,
  endpoints: {
    sendLink: { fn: 'auth.sendLink', errorTarget: 'error' },
    redeem: { fn: 'auth.redeem', errorTarget: 'error' },
  },
  triggers: [
    { event: 'ui:click', ref: 'send', do: [{ call: 'sendLink', onSuccess: [{ set: 'error', value: '' }, { set: 'stage', value: 'sent' }] }] },
    { event: 'ui:key', ref: 'username', key: 'Enter', do: [{ call: 'sendLink', onSuccess: [{ set: 'error', value: '' }, { set: 'stage', value: 'sent' }] }] },
    { event: 'ui:click', ref: 'open-link', do: [{ call: 'redeem' }] },
    { event: 'ui:click', ref: 'back', do: [{ set: 'stage', value: 'user' }, { set: 'error', value: '' }] },
  ],
};
