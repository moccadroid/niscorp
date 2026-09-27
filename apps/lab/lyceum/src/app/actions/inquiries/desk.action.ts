import type { ActionDefinition } from '@niscorp/nova';
import { TAB_BUTTON, TAB_INPUT, TAB_OPENED } from '@lyceum/app/actions/shared/tab.layouts';
import { inquiryByDepartment, inquiryNewest, inquiryWaiting } from '@lyceum/app/vex/member.entries';
import { deskLayout } from './desk.layout';
import { runPrism } from './desk.prism';

// INQUIRIES' clearance: stored queries against the records, one press each.
// Each is a fingerprint replayed as you, and its result keeps answering: a
// reactive read, so it changes while you look at it.
export const deskAction: ActionDefinition = {
  id: 'inquiries.desk',
  title: 'Stored queries',
  data: { tab: false, tabLabel: 'Inquire', tabInk: 'paper', nextInk: 'paper',
    queries: [
      { fingerprint: inquiryByDepartment.fingerprint, label: 'How many are in each department?' },
      { fingerprint: inquiryNewest.fingerprint, label: 'Who arrived last?' },
      { fingerprint: inquiryWaiting.fingerprint, label: 'Who is still waiting?' },
    ],
    chosen: '',
    result: [],
    error: '',
  },
  input: TAB_INPUT,
  layout: { if: '$.tab', then: TAB_BUTTON, else: deskLayout },
  endpoints: {
    run: { url: '/api/vex', method: 'POST', request: runPrism, target: 'result', errorTarget: 'error' },
  },
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ set: 'nextInk', value: 'ink' }, { emit: { channel: 'tab-opened' } }, { resetTo: { action: 'inquiries.desk', canvas: 'body' } }] },
    TAB_OPENED,
    {
      event: 'ui:click',
      ref: 'query',
      do: [{ set: 'chosen', value: '@event.payload' }, { set: 'error', value: '' }, { call: 'run' }],
    },
  ],
};
