import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { deskRoomsLayout } from './rooms.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { roomsPrism, roomStatusPrism } from './desk.prism';

// The desk's room board.
//
// This is a SPLIT of `ops.rooms` rather than a second copy of it, and the seam
// is the role: a manager taking a room out of the estate for a fortnight is a
// decision made once, and a clerk signing off a turned room so the person at the
// counter can have it is a decision made forty times a day. One column, two
// verbs, two audiences — the same shape the issue board took when it became a
// family.
//
// Before this existed, `rooms.out_of_order` was the only room state in the app,
// which meant "not sellable" and "not ready yet" were the same word and the
// desk had no way to say either.
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
        // Signing off makes a room sellable; a room already signed off goes
        // back to needing a turn, which is what a clerk means when they press it
        // twice. Out-of-order rooms are the manager's and this leaves them
        // exactly where they are.
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
