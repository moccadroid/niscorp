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
    pendingPersonId: '',
    pendingBookingId: '',
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
    bookable: { url: '/api/schedule/vex', method: 'POST', request: bookablePrism, target: 'bookable' },
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
