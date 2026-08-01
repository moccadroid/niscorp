import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { moveLayout } from './move.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { deskStayPrism, freeRoomsPrism, moveStayPrism, soilOldRoomPrism, claimNewRoomPrism, moveTellPrism } from './desk.prism';

// Moving a guest — the biggest thing the app could not do.
//
// `stays.room_id` has existed since the first schema and nothing could write it,
// which meant the single most ordinary front-desk gesture there is — a fault in
// a room with somebody in it — had no answer anywhere in the product. A clerk
// could read the complaint, raise the issue, dispatch the engineer and comp the
// dinner, and still not move the person out of the room.
//
// One press does four things, and all four are consequences rather than
// choices: the stay changes room, the room they left goes down for turning, the
// room they walk into stops being sellable, and the guest is told. Splitting
// those into four buttons would be honest about the mechanism and useless at a
// counter.
//
// The CANDIDATES are the interesting part: one read that already knows which
// rooms are spoken for, which is why this is two taps rather than a
// conversation with housekeeping.
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
      // One read. Which rooms are spoken for is a NOT EXISTS inside it, so
      // there is no window between "what is taken" and "what is free" for a
      // colleague to check somebody in through.
      { call: 'loadRooms', onSuccess: [{ set: 'loading', value: false }] },
    ],
  },
  triggers: [
    // Same class or better is the default a hotel would choose; "anything free"
    // is the four-in-the-morning answer and it is one press away.
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
          // `soil` before `move`, because it reads the OLD room off the stay and
          // the stay is about to stop pointing at it.
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
