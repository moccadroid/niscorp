import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { attentionLayout } from './attention.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { waitingPrism, unattendedPrism, pendingPrism, frontOfficePrism, answeringPrism } from './desk.prism';

// What is waiting on a person, derived. The one surface on a clerk's screen that
// answers "what should I do next" without them having to hold five lists in
// their head and compare timestamps.
//
// The whole argument for it: "6 unread" is decoration, because the number does
// not say which one has been ignored for four hours, and there is nothing to
// press. A stall list is the same information with the answer already in it.
//
// Every row is aimed. Tapping a waiting guest opens THEIR thread, tapping a
// fault opens THAT issue with the dispatch controls showing — so the list is not
// a summary you then go and act on somewhere else, it is the acting.
export const deskAttentionAction: ActionDefinition = {
  id: 'desk.attention',
  title: 'Needs a person',
  // `openRow` is the key of the row whose record is open beside this list. It
  // marks that row, and it is the only thing that tells a reader of this card —
  // a person or the assistant — which of six waiting guests is the one on the
  // screen next to it.
  //
  // `answers` is the action that serves an approval at this property, looked up
  // rather than named: the request is core's, the screen that answers it ships
  // with a connector.
  // `dueIn` and `notReady` went with the notice that rendered them. A card holds
  // what it shows: unrendered rows are invisible to the clerk and still reach
  // anything reading this card's data as though they were on the screen.
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
    // Each row opens the record it is ABOUT, not a list containing it, and marks
    // itself so the list still says where the person is.
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
    // An ask waiting on a yes opens the screen that ANSWERS it, aimed at that
    // one request. The id comes from `answers`, because which surface that is
    // depends on the connector this property runs.
    {
      event: 'ui:click',
      ref: 'open-pending',
      do: [
        { set: 'openRow', value: '@event.payload.request_id' },
        {
          resetTo: {
            action: '{{$.answers.action_id}}',
            canvas: 'detail',
            // The row names the card it opens. It already holds the ask and the
            // guest, and a surface opened on one record should not still be
            // wearing the name of the queue it came from.
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
    // Every channel a stall can be cleared on. A list of things waiting that
    // does not notice them stop waiting is worse than no list.
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
