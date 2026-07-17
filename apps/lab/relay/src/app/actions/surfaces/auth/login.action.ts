import type { ActionDefinition } from '@niscorp/nova';
import { loginLayout } from './login.layout';

// Sign-in: username → fake magic link → token. The fns live in
// src/server/auth — SERVER-side, on the anonymous session; this action is
// just the surface. Granted to the anonymous principal only. Redeeming
// publishes the token on `session.grant`; moss sends it down the socket
// and the terminal reconnects authenticated — this action never navigates
// anywhere itself.
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
