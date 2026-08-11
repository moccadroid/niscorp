import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { deskCheckInLayout } from './desk.layout';
import { checkInPrism, rosterPrism, sessionsTodayPrism } from './desk.prism';

// The front desk's daily loop: pick a class, tap people in.
//
// One action rather than list → detail, deliberately. A desk works ONE class
// for twenty minutes and needs the roster and the schedule on screen together —
// pushing a record would cost a Back press per arrival, which is the wrong
// trade at 200 taps a day. The rule is "list → detail → form" where a record is
// a place you go; here it is a pane you glance at.
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
    pendingMembershipId: '',
    pendingBookingId: '',
    error: '',
  },
  layout: deskCheckInLayout,
  endpoints: {
    sessions: { url: '/api/schedule/vex', method: 'POST', request: sessionsTodayPrism, target: 'sessions' },
    roster: { url: '/api/schedule/vex', method: 'POST', request: rosterPrism, target: 'roster' },
    checkin: { url: '/api/schedule/vex', method: 'POST', request: checkInPrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [
      // Opened FROM a class — the calendar links each row to its roster, so the
      // session arrives as input and the roster loads without a second tap.
      // Opened bare, `selectedSessionId` is empty, the roster read answers
      // nothing, and the ordinary pick-a-class flow is exactly what shows.
      { call: 'roster' },{ call: 'sessions', onSuccess: [{ set: 'loadingSessions', value: false }] }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'pick',
      do: [
        { set: 'selectedSessionId', value: '@event.payload.session_id' },
        { set: 'selectedName', value: '@event.payload.name' },
        { set: 'loadingRoster', value: true },
        { call: 'roster', onSuccess: [{ set: 'loadingRoster', value: false }] },
      ],
    },
    {
      event: 'ui:click',
      ref: 'checkin',
      do: [
        { set: 'error', value: '' },
        { set: 'pendingMembershipId', value: '@event.payload.membership_id' },
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
