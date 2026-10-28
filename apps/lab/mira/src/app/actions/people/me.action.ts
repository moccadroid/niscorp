import type { ActionDefinition, Step } from '@niscorp/nova';
import { z } from 'zod';
import { personMe } from '../../vex/people.entries';
import { meLayout } from './me.layout';
import { namePrism } from './name.prism';

const save: Step[] = [
  { set: 'saving', value: true },
  { set: 'error', value: '' },
  {
    call: 'save',
    onSuccess: [{ set: 'saving', value: false }, { set: 'name', value: '' }, { call: 'load' }],
    onError: [{ set: 'saving', value: false }, { set: 'error', value: 'Mira could not keep that name. Try again.' }],
  },
];

export const meAction: ActionDefinition = {
  id: 'people.me',
  title: 'Your name',
  description: 'Your name: the name Mira calls your person, and a box to change it. Your person presses Save.',
  data: { me: {}, name: '', saving: false, error: '' },
  input: z.toJSONSchema(z.object({ name: z.string().optional().describe('The name to put in the box, if they told you one.') })),
  layout: meLayout,
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: personMe.fingerprint, context: {} }, target: 'me' },
    save: { url: '/api/vex', method: 'POST', request: namePrism },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [
    { event: 'ui:click', ref: 'save', do: save },
    { event: 'ui:key', ref: 'name', key: 'Enter', do: save },
  ],
};
