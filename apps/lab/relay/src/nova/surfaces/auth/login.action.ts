import type { ActionDefinition } from '@niscorp/nova';
import { loginLayout } from './login.layout';

// Sign-in: username → fake magic link → token. The fns live in src/auth —
// the only place that knows how sign-in works; this action is just the
// surface. Granted to the anonymous principal only. Redeeming the link
// stores the token and the app rebuilds the shell for the resolved catalog,
// so this action never navigates anywhere itself.
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
