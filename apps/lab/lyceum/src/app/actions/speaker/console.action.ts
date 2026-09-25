import type { ActionDefinition } from '@niscorp/nova';
import { memberCounts } from '@lyceum/app/vex/member.entries';
import { consoleLayout } from './console.layout';

// The speaker's controller — the one screen that holds the talk's levers.
// Sorting is a server function: it runs as the `hat`, one person at a time,
// and each placement re-roles that person's live shell.
export const consoleAction: ActionDefinition = {
  id: 'speaker.console',
  title: 'Controller',
  data: { counts: { joined: 0, sorted: 0 }, sorting: false, error: '' },
  layout: consoleLayout,
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'counts' },
    sort: { fn: 'speaker.sort', errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'sort',
      do: [
        { set: 'sorting', value: true },
        { set: 'error', value: '' },
        {
          call: 'sort',
          onSuccess: [{ set: 'sorting', value: false }, { call: 'load' }],
          onError: [{ set: 'sorting', value: false }],
        },
      ],
    },
    { message: 'members-changed', do: [{ call: 'load' }] },
  ],
};
