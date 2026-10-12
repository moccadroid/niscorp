import type { ActionDefinition } from '@niscorp/nova';
import { doorLayout } from './door.layout';

const enter = [
  { set: 'entering', value: true },
  { set: 'error', value: '' },
  {
    call: 'enter',
    onSuccess: [{ set: 'entering', value: false }],
    onError: [{ set: 'entering', value: false }, { call: 'offer' }],
  },
];

export const doorAction: ActionDefinition = {
  id: 'door.join',
  title: 'Choose your name',
  data: { offer: { names: [], areas: [] }, chosen: '', typed: false, draft: '', entering: false, refused: { name: '', suggested: '' }, error: '' },
  layout: doorLayout,
  endpoints: {
    offer: { fn: 'door.names', target: 'offer' },
    enter: { fn: 'door.enter', target: 'refused', errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'offer' }] },
  triggers: [
    { event: 'ui:click', ref: 'pick', do: [{ set: 'chosen', value: '@event.payload' }, { set: 'typed', value: false }, ...enter] },
    { event: 'ui:click', ref: 'own', do: [{ set: 'chosen', value: '$.draft' }, { set: 'typed', value: true }, ...enter] },
    { event: 'ui:key', ref: 'draft', key: 'Enter', do: [{ set: 'chosen', value: '$.draft' }, { set: 'typed', value: true }, ...enter] },
    { event: 'ui:click', ref: 'more', do: [{ call: 'offer' }] },
  ],
};
