import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { guestLayout } from './guest.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { deskStayPrism, deskCheckinPrism, deskCheckoutPrism } from './desk.prism';

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
