import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { conciergeLayout } from './concierge.layout';
import { currentStayPrism, liveSlotsPrism } from './concierge.prism';
import { stayIssuesPrism } from './stay.prism';

export const conciergeAction: ActionDefinition = {
  id: 'concierge',
  title: 'Your stay',
  data: {
    stayId: '',
    propertyId: '',
    stay: {},
    slots: [],
    issues: [],
    mark: {},
    unread: {},
    loading: true,
  },
  layout: conciergeLayout,
  endpoints: {
    loadStay: { url: '/api/stay/vex', method: 'POST', request: currentStayPrism, target: 'stay' },
    loadSlots: { url: '/api/surface/vex', method: 'POST', request: liveSlotsPrism, target: 'slots' },
    loadIssues: { url: '/api/service/vex', method: 'POST', request: stayIssuesPrism, target: 'issues' },
    loadMark: { url: '/api/vex', method: 'POST', request: { fingerprint: 'seen/last', context: { topic: 'messages' } }, target: 'mark' },
    loadUnread: { url: '/api/vex', method: 'POST', request: { fingerprint: 'messages/unreadForStay', context: { stayId: { $ref: '$.stayId' }, since: { $ref: '$.mark.last' } } }, target: 'unread' },
  },
  lifecycle: {
    // The stay first: the slot resolution reads its property and state.
    mount: [{ call: 'loadStay', onSuccess: [{ call: 'loadSlots', onSuccess: [{ set: 'loading', value: false }] }] }, { call: 'loadIssues' }, { call: 'loadMark', onSuccess: [{ call: 'loadUnread' }] }],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'open',
      do: [
        {
          push: {
            action: '{{@event.payload.action_id}}',
            canvas: 'sheet',
            with: ['sheet'],
            input: { sheetTitle: '@event.payload.title', capability: '@event.payload.capability_id', stayId: '$.stayId', propertyId: '$.propertyId' },
          },
        },
      ],
    },
    { message: 'stay-changed', do: [{ call: 'loadStay', onSuccess: [{ call: 'loadSlots' }] }] },
    { message: 'capabilities-changed', do: [{ call: 'loadSlots' }] },
    { message: 'issues-changed', do: [{ call: 'loadIssues' }] },
    { message: 'messages-changed', do: [{ call: 'loadMark', onSuccess: [{ call: 'loadUnread' }] }] },
    { event: 'ui:click', ref: 'open-messages', do: [{ push: { action: 'stay.message', canvas: 'sheet', with: ['sheet'], input: { sheetTitle: 'Messages', stayId: '$.stayId', propertyId: '$.propertyId' } } }] },
  ],
};

export const conciergeInputSchema = z.toJSONSchema(
  z.object({
    stayId: z.string().optional().describe('The stay this shell is bound to — seeded from the session, never from a client.'),
    propertyId: z.string().optional().describe('The property the stay belongs to.'),
  }),
);
