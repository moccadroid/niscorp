import type { ActionDefinition, Step } from '@niscorp/nova';
import { z } from 'zod';
import { peopleList } from '../../vex/people.entries';
import { invitePrism } from './invite.prism';
import { listLayout } from './list.layout';

const invite: Step[] = [
  { set: 'inviting', value: true },
  { set: 'error', value: '' },
  {
    call: 'invite',
    onSuccess: [{ set: 'inviting', value: false }, { set: 'email', value: '' }, { set: 'name', value: '' }, { call: 'load' }],
    onError: [{ set: 'inviting', value: false }, { set: 'error', value: 'Mira could not invite that address. Is it an email address?' }],
  },
];

export const listAction: ActionDefinition = {
  id: 'people.list',
  title: 'People',
  description: 'People: everyone who can sign in, and a form to invite someone by email. Your person presses Invite.',
  data: { rows: [], email: '', name: '', inviting: false, error: '' },
  input: z.toJSONSchema(
    z.object({
      email: z.string().optional().describe('The email address to put in the invite form, if they gave one.'),
      name: z.string().optional().describe('The name to put in the invite form, if they gave one.'),
    }),
  ),
  layout: listLayout,
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: peopleList.fingerprint, context: {} }, target: 'rows' },
    invite: { url: '/api/vex', method: 'POST', request: invitePrism },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [
    { event: 'ui:click', ref: 'invite', do: invite },
    { event: 'ui:key', ref: 'email', key: 'Enter', do: invite },
    { event: 'ui:key', ref: 'name', key: 'Enter', do: invite },
  ],
};
