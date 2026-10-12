import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { moveLayout } from './move.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { deskStayPrism, freeRoomsPrism, moveStayPrism, soilOldRoomPrism, claimNewRoomPrism, moveTellPrism } from './desk.prism';

export const deskMoveAction: ActionDefinition = {
  id: 'desk.move',
  title: 'Move rooms',
  data: { stayId: '', propertyId: '', stay: {}, rooms: [], chosen: {}, kindFilter: '%', reason: '', tell: '', drafted: '', loading: true, working: false, done: false, expanded: true },
  layout: previewable(
    crewCard('Move rooms', 'door', { $if: '$.rooms.length', $then: '{{$.rooms.length}} rooms ready — move them out of {{$.stay.room_number}}', $else: 'Nothing ready to move them into.' }),
    moveLayout,
  ),
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: deskStayPrism, target: 'stay' },
    loadRooms: { url: '/api/service/vex', method: 'POST', request: freeRoomsPrism, target: 'rooms' },
    move: { url: '/api/stay/vex', method: 'POST', request: moveStayPrism },
    soil: { url: '/api/service/vex', method: 'POST', request: soilOldRoomPrism },
    claim: { url: '/api/service/vex', method: 'POST', request: claimNewRoomPrism },
    tell: { url: '/api/stay/vex', method: 'POST', request: moveTellPrism },
  },
  lifecycle: {
    mount: [
      { call: 'load' },
      { call: 'loadRooms', onSuccess: [{ set: 'loading', value: false }] },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'same-class', do: [{ set: 'kindFilter', value: '$.stay.room_kind' }, { set: 'chosen', value: {} }, { call: 'loadRooms' }] },
    { event: 'ui:click', ref: 'any-class', do: [{ set: 'kindFilter', value: '%' }, { set: 'chosen', value: {} }, { call: 'loadRooms' }] },
    { event: 'ui:click', ref: 'pick-room', do: [{ set: 'chosen', value: { $if: { $eq: ['@event.payload.room_id', '$.chosen.room_id'] }, $then: {}, $else: '@event.payload' } }] },
    { event: 'ui:model', ref: 'reason', do: [{ set: 'reason', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'tell', do: [{ set: 'tell', value: '@event.payload' }, { set: 'drafted', value: '' }] },
    {
      event: 'ui:click',
      ref: 'move',
      do: [
        { set: 'working', value: true },
        {
          call: 'soil',
          onSuccess: [
            {
              call: 'move',
              onSuccess: [
                {
                  call: 'claim',
                  onSuccess: [
                    {
                      call: 'tell',
                      onSuccess: [
                        { set: 'working', value: false },
                        { set: 'done', value: true },
                        { call: 'load' },
                        { emit: { channel: 'stay-changed' } },
                        { emit: { channel: 'rooms-changed' } },
                        { emit: { channel: 'messages-changed' } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    { message: 'rooms-changed', do: [{ call: 'loadRooms' }] },
    ...previewTriggers,
  ],
};

export const deskMoveInputSchema = z.toJSONSchema(
  z.object({
    stayId: z.string().optional().describe('Who is moving.'),
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    chosen: z
      .object({ room_id: z.string().optional(), number_display: z.string().optional() })
      .optional()
      .describe('Stage a room from the candidate list, e.g. { "room_id": "…", "number_display": "Room 613" }. Only rooms this card offered can be moved into.'),
    kindFilter: z.string().optional().describe("Which classes to offer: the guest's own room kind for a like-for-like move, or '%' for anything ready."),
    reason: z.string().optional().describe('Why the move is happening, for the record. Short — "air conditioning fault, second night".'),
    tell: z
      .string()
      .optional()
      .describe('The line that goes to the guest, ALREADY WRITTEN. Say which room the guest is moving to and why, in the guest’s language if the thread is in one. The user presses send, never you.'),
    drafted: z.string().optional().describe('Set this to the same text as `tell` when the words are yours, so the card says so.'),
    expanded: z.boolean().optional().describe('false renders the one-line card (the guest workspace); true (default) the full surface.'),
  }),
);
