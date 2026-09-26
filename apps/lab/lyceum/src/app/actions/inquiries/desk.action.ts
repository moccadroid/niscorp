import type { ActionDefinition } from '@niscorp/nova';
import { inquiryByDepartment, inquiryNewest, inquiryWaiting } from '@lyceum/app/vex/member.entries';
import { deskLayout } from './desk.layout';
import { askPrism } from './desk.prism';

// INQUIRIES' clearance: put a question to the records. Each question is a
// stored query — a fingerprint — replayed as you, and the answer keeps
// answering: it is a reactive read, so it changes while you look at it.
export const deskAction: ActionDefinition = {
  id: 'inquiries.desk',
  title: 'Put a question to the records',
  data: {
    questions: [
      { fingerprint: inquiryByDepartment.fingerprint, question: 'How many are in each department?' },
      { fingerprint: inquiryNewest.fingerprint, question: 'Who arrived last?' },
      { fingerprint: inquiryWaiting.fingerprint, question: 'Who is still waiting?' },
    ],
    asked: '',
    answer: [],
    error: '',
  },
  layout: deskLayout,
  endpoints: {
    ask: { url: '/api/vex', method: 'POST', request: askPrism, target: 'answer', errorTarget: 'error' },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'question',
      do: [{ set: 'asked', value: '@event.payload' }, { set: 'error', value: '' }, { call: 'ask' }],
    },
  ],
};
