import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { homeMemberLayout, meMembershipLayout, meBookingsLayout, meClassesLayout } from './me.layouts';
import { bookPrism, cancelPrism, coursesPrism, joinPrism, leavePrism, myBookingsPrism, myCardPrism, myEnrolmentsPrism, upcomingPrism } from './me.prism';

// THE MEMBER'S LANDING SURFACE.
//
// Granted BY NAME at the member rung, like every other home. The wildcard that
// once sat here handed an instructor the owner's dashboard, and the fix was to
// name them — so this one is named too, and the rung above takes `home.classes`
// explicitly rather than inheriting whatever the bottom of the ladder holds.
export const homeMemberAction: ActionDefinition = {
  id: 'home.member',
  title: 'Today',
  data: {
    studioName: '',
    greeting: '',
    identity: {},
    card: {},
    bookings: [],
    loading: true,
  },
  layout: homeMemberLayout,
  endpoints: {
    // Read on mount, not seeded at boot — same reason as the staff landing
    // surfaces. A member who taps into their classes and back had no name.
    identity: { fn: 'nav.identity', target: 'identity' },
    card: { url: '/api/me/vex', method: 'POST', request: myCardPrism, target: 'card' },
    bookings: { url: '/api/me/vex', method: 'POST', request: myBookingsPrism, target: 'bookings' },
  },
  lifecycle: {
    mount: [
      { call: 'identity', onSuccess: [{ set: 'greeting', value: '$.identity.greeting' }, { set: 'studioName', value: '$.identity.studioName' }] },
      { call: 'card' },
      { call: 'bookings', onSuccess: [{ set: 'loading', value: false }] },
    ],
  },
  triggers: [{ message: 'my-bookings-changed', do: [{ call: 'bookings' }] }],
};

export const homeMemberInputSchema = z.toJSONSchema(z.object({}));

// ── the membership, reachable from the menu ──────────────────
//
// Same read as the landing surface's card, because it is the same fact. What
// this adds is a DESTINATION: a landing surface is only reachable by landing on
// it, and staff land somewhere else. Tobias teaches here and trains here — he
// held `home.member` and could not get to it.
export const meMembershipAction: ActionDefinition = {
  id: 'me.membership',
  title: 'My membership',
  data: { card: {} },
  layout: meMembershipLayout,
  endpoints: { card: { url: '/api/me/vex', method: 'POST', request: myCardPrism, target: 'card' } },
  lifecycle: { mount: [{ call: 'card' }] },
};

export const meMembershipInputSchema = z.toJSONSchema(z.object({}));

// ── booking ──────────────────────────────────────────────────
export const meClassesAction: ActionDefinition = {
  id: 'me.classes',
  title: 'Book a class',
  data: {
    sessions: [],
    sessionId: '',
    courses: [],
    enrolments: [],
    courseId: '',
    enrolmentId: '',
    loading: true,
    error: '',
    notice: '',
  },
  layout: meClassesLayout,
  endpoints: {
    load: { url: '/api/me/vex', method: 'POST', request: upcomingPrism, target: 'sessions' },
    book: { url: '/api/me/vex', method: 'POST', request: bookPrism, errorTarget: 'error' },
    courses: { url: '/api/me/vex', method: 'POST', request: coursesPrism, target: 'courses' },
    mine: { url: '/api/me/vex', method: 'POST', request: myEnrolmentsPrism, target: 'enrolments' },
    join: { url: '/api/me/vex', method: 'POST', request: joinPrism, errorTarget: 'error' },
    leave: { url: '/api/me/vex', method: 'POST', request: leavePrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'courses' }, { call: 'mine' }, { call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'join',
      do: [
        { set: 'error', value: '' },
        { set: 'notice', value: '' },
        { set: 'courseId', value: '@event.payload.course_id' },
        {
          call: 'join',
          onSuccess: [{ set: 'notice', value: 'You are on the course. Every week is booked for you.' }, { call: 'courses' }, { call: 'mine' }, { call: 'load' }, { emit: { channel: 'my-bookings-changed' } }],
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'leave',
      do: [
        { set: 'error', value: '' },
        { set: 'notice', value: '' },
        { set: 'enrolmentId', value: '@event.payload.enrolment_id' },
        {
          call: 'leave',
          onSuccess: [{ set: 'notice', value: 'Withdrawn. Your places are free again.' }, { call: 'courses' }, { call: 'mine' }, { call: 'load' }, { emit: { channel: 'my-bookings-changed' } }],
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'book',
      do: [
        { set: 'error', value: '' },
        { set: 'notice', value: '' },
        { set: 'sessionId', value: '@event.payload.session_id' },
        {
          // `load` re-runs on success because booking moves the places count on
          // the row that was just tapped — the seat the member took is the one
          // the next person must not be offered.
          call: 'book',
          // HONEST FOR BOTH OUTCOMES.
          //
          // A full class queues rather than refusing, so the same click can end
          // in a seat or in a place in line — and the trigger grammar has no
          // conditional to tell them apart here. "Booked. See you there." was
          // therefore a lie roughly whenever it mattered most. The badge on My
          // classes carries the truth; this only has to not contradict it.
          onSuccess: [{ set: 'notice', value: 'Added — see My classes. A full class puts you on the waiting list.' }, { call: 'load' }, { emit: { channel: 'my-bookings-changed' } }],
        },
      ],
    },
    { message: 'my-bookings-changed', do: [{ call: 'load' }, { call: 'mine' }, { call: 'courses' }] },
  ],
};

export const meClassesInputSchema = z.toJSONSchema(z.object({}));

// ── what they hold ───────────────────────────────────────────
export const meBookingsAction: ActionDefinition = {
  id: 'me.bookings',
  title: 'My classes',
  data: {
    bookings: [],
    bookingId: '',
    loading: true,
    error: '',
    notice: '',
  },
  layout: meBookingsLayout,
  endpoints: {
    load: { url: '/api/me/vex', method: 'POST', request: myBookingsPrism, target: 'bookings' },
    cancel: { url: '/api/me/vex', method: 'POST', request: cancelPrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'cancel',
      do: [
        { set: 'error', value: '' },
        { set: 'notice', value: '' },
        { set: 'bookingId', value: '@event.payload.booking_id' },
        {
          call: 'cancel',
          onSuccess: [{ set: 'notice', value: 'Cancelled. The place is free again.' }, { call: 'load' }, { emit: { channel: 'my-bookings-changed' } }],
        },
      ],
    },
    { message: 'my-bookings-changed', do: [{ call: 'load' }] },
  ],
};

export const meBookingsInputSchema = z.toJSONSchema(z.object({}));
