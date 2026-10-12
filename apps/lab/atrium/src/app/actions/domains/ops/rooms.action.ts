import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { roomsLayout } from './rooms.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { roomsPrism, setRoomPrism } from './ops.prism';

export const opsRoomsAction: ActionDefinition = {
  id: 'ops.rooms',
  title: 'Rooms',
  data: { propertyId: '', rows: [], toggleRoomId: '', toggleStatus: '', loading: true, expanded: true },
  layout: previewable(crewCard('Rooms', 'bed', '{{$.rows.length}} rooms — take one out of, or back into, service'), roomsLayout),
  endpoints: {
    load: { url: '/api/service/vex', method: 'POST', request: roomsPrism, target: 'rows' },
    setStatus: { url: '/api/service/vex', method: 'POST', request: setRoomPrism },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'toggle',
      do: [
        { set: 'toggleRoomId', value: '@event.payload.room_id' },
        // A reopened room comes back 'dirty': housekeeping still has to turn it
        // before it can be sold.
        { set: 'toggleStatus', value: { $if: '@event.payload.out_of_order', $then: 'dirty', $else: 'out_of_order' } },
        { call: 'setStatus', onSuccess: [{ call: 'load' }, { emit: { channel: 'rooms-changed' } }] },
      ],
    },
    { message: 'rooms-changed', do: [{ call: 'load' }] },
    ...previewTriggers,
  ],
};

export const opsRoomsInputSchema = z.toJSONSchema(
  z.object({
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    expanded: z.boolean().optional().describe('false renders the one-line card (the composed crew surface); true (default) the full inventory.'),
  }),
);
