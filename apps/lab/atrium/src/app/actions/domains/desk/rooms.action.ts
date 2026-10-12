import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { deskRoomsLayout } from './rooms.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { roomsPrism, roomStatusPrism } from './desk.prism';

export const deskRoomsAction: ActionDefinition = {
  id: 'desk.rooms',
  title: 'Rooms',
  data: { propertyId: '', scope: 'all', rows: [], markRoomId: '', markStatus: '', loading: true, expanded: true },
  layout: previewable(crewCard('Rooms', 'bed', '{{$.rows.length}} rooms — what is ready, and what is still to turn'), deskRoomsLayout),
  endpoints: {
    load: { url: '/api/service/vex', method: 'POST', request: roomsPrism, target: 'rows' },
    mark: { url: '/api/service/vex', method: 'POST', request: roomStatusPrism },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:click', ref: 'tab', do: [{ set: 'scope', value: '@event.payload' }, { call: 'load' }] },
    {
      event: 'ui:click',
      ref: 'release',
      do: [
        { set: 'markRoomId', value: '@event.payload.room_id' },
        {
          set: 'markStatus',
          value: { $if: { $eq: ['@event.payload.status', 'out_of_order'] }, $then: 'out_of_order', $else: { $if: { $eq: ['@event.payload.status', 'inspected'] }, $then: 'dirty', $else: 'inspected' } },
        },
        { call: 'mark', onSuccess: [{ call: 'load' }, { emit: { channel: 'rooms-changed' } }] },
      ],
    },
    { message: 'rooms-changed', do: [{ call: 'load' }] },
    ...previewTriggers,
  ],
};

export const deskRoomsInputSchema = z.toJSONSchema(
  z.object({
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    scope: z.enum(['all', 'ready', 'turning']).optional().describe('Which slice to open on. `ready` is what can be sold right now; `turning` is what housekeeping still owes you.'),
    expanded: z.boolean().optional().describe('false renders the one-line card (the composed crew surface); true (default) the full board.'),
  }),
);
