import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { roomsLayout } from './rooms.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { roomsPrism, setRoomPrism } from './ops.prism';

// Room inventory — the ops manager's one write. Taking a room out of service
// sets `rooms.status` to `out_of_order`, which is exactly what the "rooms out of
// order" figure on the house pane counts, so the number there moves for real.
// `rooms-changed` tells the house pane (same shell) to re-read.
//
// It stops at the SERVICE question deliberately. Whether a room is clean, turned
// or signed off is the floor's business minute to minute and belongs on the
// desk's own board (`desk.rooms`); a manager taking a room out of the estate for
// a fortnight is a different decision, made once, and it is this one.
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
        // Out of service, or back to the floor as something housekeeping still
        // has to turn — a room that has been shut for a fortnight is never
        // ready to sell the moment it reopens.
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
