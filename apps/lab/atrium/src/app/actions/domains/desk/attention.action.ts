import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { attentionLayout } from './attention.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { waitingPrism, unattendedPrism, pendingPrism, frontOfficePrism, answeringPrism } from './desk.prism';

export const deskAttentionAction: ActionDefinition = {
  id: 'desk.attention',
  title: 'Needs a person',
  data: { propertyId: '', waiting: [], unattended: [], pending: [], handed: [], openRow: '', answers: {}, loading: true, expanded: true },
  layout: previewable(
    crewCard('Needs a person', 'alert', {
      $if: '$.waiting.length',
      $then: '{{$.waiting.length}} guests waiting on an answer, {{$.unattended.length}} faults with nobody on them',
      $else: { $if: '$.unattended.length', $then: '{{$.unattended.length}} faults with nobody on them', $else: 'Nothing is waiting.' },
    }),
    attentionLayout,
  ),
  endpoints: {
    loadWaiting: { url: '/api/stay/vex', method: 'POST', request: waitingPrism, target: 'waiting' },
    loadUnattended: { url: '/api/service/vex', method: 'POST', request: unattendedPrism, target: 'unattended' },
    loadPending: { url: '/api/vex', method: 'POST', request: pendingPrism, target: 'pending' },
    loadHanded: { url: '/api/service/vex', method: 'POST', request: frontOfficePrism, target: 'handed' },
    loadAnswers: { url: '/api/surface/vex', method: 'POST', request: answeringPrism, target: 'answers' },
  },
  lifecycle: {
    mount: [
      { call: 'loadWaiting', onSuccess: [{ set: 'loading', value: false }] },
      { call: 'loadUnattended' },
      { call: 'loadPending' },
      { call: 'loadHanded' },
      { call: 'loadAnswers' },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'open-thread',
      do: [
        { set: 'openRow', value: '@event.payload.stay_id' },
        { resetTo: { action: 'desk.thread.detail', canvas: 'detail', input: { stayId: '@event.payload.stay_id', guestName: '@event.payload.guest_name' }, with: ['detail'] } },
      ],
    },
    {
      event: 'ui:click',
      ref: 'open-issue',
      do: [
        { set: 'openRow', value: '@event.payload.issue_id' },
        { resetTo: { action: 'desk.issue.detail', canvas: 'detail', input: { issueId: '@event.payload.issue_id', propertyId: '$.propertyId' }, with: ['detail'] } },
      ],
    },
    {
      event: 'ui:click',
      ref: 'open-pending',
      do: [
        { set: 'openRow', value: '@event.payload.request_id' },
        {
          resetTo: {
            action: '{{$.answers.action_id}}',
            canvas: 'detail',
            input: {
              requestId: '@event.payload.request_id',
              propertyId: '$.propertyId',
              cardTitle: '{{@event.payload.label}} — {{@event.payload.guest_name}}',
            },
            with: ['detail'],
          },
        },
      ],
    },
    { event: 'ui:click', ref: 'open-guest', do: [{ set: 'openRow', value: '@event.payload.stay_id' }, { resetTo: { action: 'desk.guest', canvas: 'detail', input: { stayId: '@event.payload.stay_id', propertyId: '$.propertyId' }, with: ['detail'] } }] },
    { message: 'messages-changed', do: [{ call: 'loadWaiting' }] },
    { message: 'issues-changed', do: [{ call: 'loadUnattended' }] },
    { message: 'tasks-changed', do: [{ call: 'loadUnattended' }, { call: 'loadHanded' }] },
    { message: 'requests-changed', do: [{ call: 'loadPending' }] },
    ...previewTriggers,
  ],
};

export const deskAttentionInputSchema = z.toJSONSchema(
  z.object({
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    expanded: z.boolean().optional().describe('false renders the one-line card (the composed crew surface); true (default) the full list.'),
  }),
);
