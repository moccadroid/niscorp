import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { deskCheckInLayout } from './desk.layout';
import { bookablePrism, checkInPrism, rosterPrism, sessionsTodayPrism, walkInBookPrism, walkInsPrism } from './desk.prism';

export const deskCheckInAction: ActionDefinition = {
  id: 'desk.checkin',
  title: 'Check in',
  data: {
    sessions: [],
    roster: [],
    selectedSessionId: '',
    selectedName: '',
    arrivedSummary: '',
    loadingSessions: true,
    loadingRoster: false,
    // What the pending tap is about. Held as data because a trigger's steps
    // run against the action, not against the event.
    pendingPersonId: '',
    pendingBookingId: '',
    // The walk-in half: who could still join the chosen class, the one the
    // desk picked, and the row the create handed back.
    bookable: [],
    walkInPersonId: '',
    walkInBooked: {},
    walkIns: [],
    error: '',
  },
  layout: deskCheckInLayout,
  endpoints: {
    sessions: { url: '/api/schedule/vex', method: 'POST', request: sessionsTodayPrism, target: 'sessions' },
    roster: { url: '/api/schedule/vex', method: 'POST', request: rosterPrism, target: 'roster' },
    checkin: { url: '/api/schedule/vex', method: 'POST', request: checkInPrism, errorTarget: 'error' },
    // The picker's options, shaped at the SOURCE: the entry emits `value`,
    // `name`, `sub` — its one consumer is this picker, and `name` (never
    // `label`) keeps a person's name off the language pass.
    bookable: { url: '/api/schedule/vex', method: 'POST', request: bookablePrism, target: 'bookable' },
    // The insert answers with the row it wrote — the id is what the check-in
    // needs to flip `attended` on the booking it just created.
    book: { url: '/api/schedule/vex', method: 'POST', request: walkInBookPrism, target: 'walkInBooked', errorTarget: 'error' },
    walkIns: { url: '/api/schedule/vex', method: 'POST', request: walkInsPrism, target: 'walkIns' },
  },
  lifecycle: { mount: [
      { call: 'roster' }, { call: 'walkIns' }, { call: 'sessions', onSuccess: [{ set: 'loadingSessions', value: false }] }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'pick',
      do: [
        { set: 'selectedSessionId', value: '@event.payload.session_id' },
        { set: 'selectedName', value: '@event.payload.name' },
        { set: 'walkInPersonId', value: '' },
        { set: 'loadingRoster', value: true },
        { call: 'roster', onSuccess: [{ set: 'loadingRoster', value: false }] },
        { call: 'bookable' },
      ],
    },
    // The walk-in: book, then check in — two writes the desk fires as one
    // tap. Steps await in order, so the booking id is in hand before the
    // check-in that flips its `attended`.
    {
      event: 'ui:click',
      ref: 'walkinBook',
      do: [
        { set: 'error', value: '' },
        {
          call: 'book',
          onSuccess: [
            { set: 'pendingPersonId', value: '$.walkInPersonId' },
            { set: 'pendingBookingId', value: '$.walkInBooked.id' },
            { set: 'walkInPersonId', value: '' },
            { call: 'checkin', onSuccess: [{ call: 'roster' }, { call: 'bookable' }, { emit: { channel: 'check-ins-changed' } }] },
          ],
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'checkin',
      do: [
        { set: 'error', value: '' },
        { set: 'pendingPersonId', value: '@event.payload.person_id' },
        { set: 'pendingBookingId', value: '@event.payload.booking_id' },
        {
          call: 'checkin',
          // Re-read the roster, and announce — the day's figures live on
          // another surface entirely and hear the same channel.
          onSuccess: [{ call: 'roster' }, { emit: { channel: 'check-ins-changed' } }],
        },
      ],
    },
    { message: 'sessions-changed', do: [{ call: 'sessions' }] },
  ],
};

export const deskCheckInInputSchema = z.toJSONSchema(
  z.object({
    selectedSessionId: z.string().optional().describe('Open straight onto one class — for a kiosk pinned to the 18:30.'),
  }),
);
