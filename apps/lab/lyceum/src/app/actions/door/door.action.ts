import type { ActionDefinition } from '@niscorp/nova';
import { doorLayout } from './door.layout';

// The anonymous principal's whole application. Stepping in is a server
// function that lets the person in and GRANTS the session — the terminal
// reconnects as the new member, and their shell is built from their row.
export const doorAction: ActionDefinition = {
  id: 'door.join',
  title: 'Step in',
  data: { entering: false, error: '' },
  layout: doorLayout,
  endpoints: {
    enter: { fn: 'door.enter', errorTarget: 'error' },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'enter',
      do: [
        { set: 'entering', value: true },
        { call: 'enter', onError: [{ set: 'entering', value: false }] },
      ],
    },
  ],
};
