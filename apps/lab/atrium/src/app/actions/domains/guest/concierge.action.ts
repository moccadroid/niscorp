import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { conciergeLayout } from './concierge.layout';
import { currentStayPrism, liveSlotsPrism } from './concierge.prism';
import { stayIssuesPrism } from './stay.prism';

// The guest's home. Everything they can do is here, and nothing here was
// decided by this file: `stay/current` is the mirrored reservation, whichever
// PMS owns it, and `surface/live` is the slots that RESOLVED for this property
// and stay state — dark slots never arrive, so there is nothing here to hide.
//
// Conversation lives with the shell's AGENT (the assistant dock); this home is
// the direct-manipulation surface it places onto.
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
    // The guest's own activity, read back onto the home so every action they
    // take shows up where they land. Because this action is always loaded, its
    // mount/resume re-read IS the freshness — no push needed.
    loadIssues: { url: '/api/service/vex', method: 'POST', request: stayIssuesPrism, target: 'issues' },
    loadMark: { url: '/api/vex', method: 'POST', request: { fingerprint: 'seen/last', context: { topic: 'messages' } }, target: 'mark' },
    loadUnread: { url: '/api/vex', method: 'POST', request: { fingerprint: 'messages/unreadForStay', context: { stayId: { $ref: '$.stayId' }, since: { $ref: '$.mark.last' } } }, target: 'unread' },
  },
  lifecycle: {
    // The stay first — the slot resolution depends on its property and state, so
    // this is a genuine chain rather than two parallel loads.
    mount: [{ call: 'loadStay', onSuccess: [{ call: 'loadSlots', onSuccess: [{ set: 'loading', value: false }] }] }, { call: 'loadIssues' }, { call: 'loadMark', onSuccess: [{ call: 'loadUnread' }] }],
  },
  triggers: [
    // A resolved slot opens. The action id rides in on the row; nova resolves
    // the binding into the push target.
    {
      event: 'ui:click',
      ref: 'open',
      do: [
        {
          push: {
            action: '{{@event.payload.action_id}}',
            canvas: 'sheet',
            with: ['sheet'],
            // `capability` rides in from the slot so the generic request action
            // knows which menu to load. Non-request actions ignore it.
            input: { sheetTitle: '@event.payload.title', capability: '@event.payload.capability_id', stayId: '$.stayId', propertyId: '$.propertyId' },
          },
        },
      ],
    },
    // Anything that changes the stay, an issue, a message, or what is live
    // re-reads the relevant part. These fire within the guest's own shell after
    // they act; the mount/resume re-read covers everything else.
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
