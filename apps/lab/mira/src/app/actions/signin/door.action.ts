import type { ActionDefinition, Step } from '@niscorp/nova';
import { doorLayout } from './door.layout';

const send: Step[] = [
  { set: 'sending', value: true },
  { set: 'sent', value: false },
  { set: 'error', value: '' },
  {
    call: 'request',
    onSuccess: [{ set: 'sending', value: false }, { set: 'sent', value: true }],
    onError: [{ set: 'sending', value: false }, { set: 'error', value: '{{@error.message}}' }],
  },
];

export const doorAction: ActionDefinition = {
  id: 'signin.door',
  title: 'Sign in',
  description: 'Signing in: an email address, and a button that mails a link to it.',
  data: { email: '', sending: false, sent: false, error: '' },
  layout: doorLayout,
  endpoints: { request: { fn: 'signin.request' } },
  triggers: [
    { event: 'ui:click', ref: 'send', do: send },
    { event: 'ui:key', ref: 'email', key: 'Enter', do: send },
  ],
};
