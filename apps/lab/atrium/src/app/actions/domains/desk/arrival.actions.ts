import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { arrivalLayout, groupLayout } from './arrival.layouts';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { deskStayPrism, deskCheckinPrism, notesByStayPrism, requestsByStayPrism, roomByStayPrism, groupPrism, groupStaysPrism, groupReadyPrism, groupCheckInPrism } from './desk.prism';

// ═══════════════════════════════════════════════════════════
// THE TWO SURFACES ABOUT PEOPLE WHO HAVE NOT WALKED IN YET.
//
// Both are pushed rather than composed: they are about a specific arrival or a
// specific block, so they arrive carrying it and never sit on the house screen
// waiting to be aimed.
// ═══════════════════════════════════════════════════════════

// ── one arrival, prepared ───────────────────────────────────
export const deskArrivalAction: ActionDefinition = {
  id: 'desk.arrival',
  title: 'Arrival prep',
  data: { stayId: '', propertyId: '', stay: {}, room: {}, requests: [], notes: [], working: false, loading: true, expanded: true },
  layout: previewable(
    crewCard('Arrival prep', 'check', { $if: '$.room.sellable', $then: 'Room {{$.stay.room_number}} is ready for {{$.stay.guest_name}}', $else: 'Room {{$.stay.room_number}} is not ready yet' }),
    arrivalLayout,
  ),
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: deskStayPrism, target: 'stay' },
    loadRoom: { url: '/api/stay/vex', method: 'POST', request: roomByStayPrism, target: 'room' },
    loadRequests: { url: '/api/vex', method: 'POST', request: requestsByStayPrism, target: 'requests' },
    loadNotes: { url: '/api/service/vex', method: 'POST', request: notesByStayPrism, target: 'notes' },
    checkin: { url: '/api/stay/vex', method: 'POST', request: deskCheckinPrism },
  },
  lifecycle: {
    // The room read hangs off the stay, so it waits for it.
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { call: 'loadRoom' }] }, { call: 'loadRequests' }, { call: 'loadNotes' }],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'checkin',
      do: [
        { set: 'working', value: true },
        { call: 'checkin', onSuccess: [{ set: 'working', value: false }, { call: 'load' }, { emit: { channel: 'stay-changed' } }], onError: [{ set: 'working', value: false }] },
      ],
    },
    { message: 'stay-changed', do: [{ call: 'load' }] },
    { message: 'rooms-changed', do: [{ call: 'loadRoom' }] },
    { message: 'requests-changed', do: [{ call: 'loadRequests' }] },
    { message: 'notes-changed', do: [{ call: 'loadNotes' }] },
    ...previewTriggers,
  ],
};

export const deskArrivalInputSchema = z.toJSONSchema(
  z.object({
    stayId: z.string().describe('Who is arriving. This is what makes an arrival reachable by a push, a link or the assistant.'),
    propertyId: z.string().optional().describe('Seeded by the opener from the session.'),
    expanded: z.boolean().optional().describe('false renders the one-line card; true (default) the full sheet.'),
  }),
);

// ── a block, checked in together ────────────────────────────
export const deskGroupAction: ActionDefinition = {
  id: 'desk.group',
  title: 'The group',
  data: { groupId: '', propertyId: '', group: {}, stays: [], ready: [], loading: true, working: false, done: false, expanded: true },
  layout: previewable(crewCard('The group', 'door', '{{$.group.label}} — {{$.stays.length}} rooms'), groupLayout),
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: groupPrism, target: 'group' },
    loadStays: { url: '/api/stay/vex', method: 'POST', request: groupStaysPrism, target: 'stays' },
    // Who CAN be checked in, decided in SQL. The button below never has to know
    // the rule, and cannot get it wrong.
    loadReady: { url: '/api/stay/vex', method: 'POST', request: groupReadyPrism, target: 'ready' },
    checkin: { url: '/api/stay/vex', method: 'POST', request: groupCheckInPrism },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadStays' }, { call: 'loadReady' }] },
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ resetTo: { action: 'desk.guest', canvas: 'detail', input: { stayId: '@event.payload.stay_id', propertyId: '$.propertyId' }, with: ['detail'] } }] },
    {
      event: 'ui:click',
      ref: 'checkin-ready',
      do: [
        { set: 'working', value: true },
        {
          call: 'checkin',
          onSuccess: [
            { set: 'working', value: false },
            { set: 'done', value: true },
            { call: 'loadStays' },
            { call: 'loadReady' },
            { emit: { channel: 'stay-changed' } },
          ],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    { message: 'stay-changed', do: [{ call: 'loadStays' }, { call: 'loadReady' }] },
    { message: 'rooms-changed', do: [{ call: 'loadStays' }, { call: 'loadReady' }] },
    ...previewTriggers,
  ],
};

export const deskGroupInputSchema = z.toJSONSchema(
  z.object({
    groupId: z.string().describe('The block to work. From a movements row, or from a stay that carries one.'),
    propertyId: z.string().optional().describe('Seeded by the opener from the session.'),
    expanded: z.boolean().optional().describe('false renders the one-line card; true (default) the full block.'),
  }),
);
