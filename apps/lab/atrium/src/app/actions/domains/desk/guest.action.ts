import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { guestLayout } from './guest.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { deskStayPrism, deskCheckinPrism, deskCheckoutPrism } from './desk.prism';

// One RESERVATION, managed: the stay as the desk sees it and the two controls
// that move it — check in, check out. Opened WITH a stay: from a movements row,
// from the inbox (the agent picks the stay out of the thread), or placed by the
// shell's agent with the stay preselected.
//
// It shed the guest's open issues when `desk.brief` arrived. Both cards land in
// the same workspace, and both were answering "who is this" — one of them
// properly, with history, spend, notes and language, and one of them with a
// three-row list. Two live surfaces for one record is the same bug as two live
// figures for one number.
export const deskGuestAction: ActionDefinition = {
  id: 'desk.guest',
  title: 'The stay',
  data: { stayId: '', propertyId: '', stay: {}, working: false, loading: true, expanded: true },
  layout: previewable(crewCard('The stay', 'bed', '{{$.stay.guest_name}} · Room {{$.stay.room_number}} · {{$.stay.state_text}}'), guestLayout),
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: deskStayPrism, target: 'stay' },
    checkin: { url: '/api/stay/vex', method: 'POST', request: deskCheckinPrism },
    checkout: { url: '/api/stay/vex', method: 'POST', request: deskCheckoutPrism },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'checkin',
      do: [
        { set: 'working', value: true },
        { call: 'checkin', onSuccess: [{ set: 'working', value: false }, { call: 'load' }, { emit: { channel: 'stay-changed' } }], onError: [{ set: 'working', value: false }] },
      ],
    },
    {
      event: 'ui:click',
      ref: 'checkout',
      do: [
        { set: 'working', value: true },
        { call: 'checkout', onSuccess: [{ set: 'working', value: false }, { call: 'load' }, { emit: { channel: 'stay-changed' } }], onError: [{ set: 'working', value: false }] },
      ],
    },
    { message: 'stay-changed', do: [{ call: 'load' }] },
    ...previewTriggers,
  ],
};

export const deskGuestInputSchema = z.toJSONSchema(
  z.object({
    stayId: z.string().optional().describe('The stay to manage — from an arrivals row, a message thread, or the agent.'),
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    expanded: z.boolean().optional().describe('false renders the one-line card (the guest workspace); true (default) the full surface.'),
  }),
);
