import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { homeMemberLayout, meMembershipLayout, meBookingsLayout, meClassesLayout } from './me.layouts';
import {
  bookForPrism,
  bookPrism,
  cancelForPrism,
  cancelPrism,
  choosePlanPrism,
  coursesPrism,
  familyBookingsPrism,
  joinPrism,
  leavePrism,
  myBookedSessionsPrism,
  myBookingsPrism,
  myCardPrism,
  myEnrolmentsPrism,
  myGiveNoticePrism,
  myMembershipPrism,
  myPassesPrism,
  myPausePrism,
  myResumePrism,
  plansOnSalePrism,
  upcomingPrism,
} from './me.prism';

export const homeMemberAction: ActionDefinition = {
  id: 'home.member',
  title: 'Today',
  data: {
    studioName: '',
    greeting: '',
    identity: {},
    card: {},
    membership: {},
    passes: [],
    bookings: [],
    loading: true,
  },
  layout: homeMemberLayout,
  endpoints: {
    identity: { fn: 'nav.identity', target: 'identity' },
    card: { url: '/api/me/vex', method: 'POST', request: myCardPrism, target: 'card' },
    membership: { url: '/api/me/vex', method: 'POST', request: myMembershipPrism, target: 'membership' },
    passes: { url: '/api/me/vex', method: 'POST', request: myPassesPrism, target: 'passes' },
    bookings: { url: '/api/me/vex', method: 'POST', request: myBookingsPrism, target: 'bookings' },
  },
  lifecycle: {
    mount: [
      { call: 'identity', onSuccess: [{ set: 'greeting', value: '$.identity.greeting' }, { set: 'studioName', value: '$.identity.studioName' }] },
      { call: 'card' },
      { call: 'membership' },
      { call: 'passes' },
      { call: 'bookings', onSuccess: [{ set: 'loading', value: false }] },
    ],
  },
  triggers: [
    { message: 'my-bookings-changed', do: [{ call: 'bookings' }] },
    { event: 'ui:click', ref: 'choosePlan', do: [{ push: { action: 'me.membership', canvas: 'sheet', with: ['sheet'] } }] },
    { message: 'members-changed', do: [{ call: 'card' }, { call: 'membership' }, { call: 'passes' }] },
  ],
};

export const homeMemberInputSchema = z.toJSONSchema(z.object({}));

export const meMembershipAction: ActionDefinition = {
  id: 'me.membership',
  title: 'My membership',
  data: {
    card: {},
    membership: {},
    passes: [],
    plans: [],
    chosenOfferingId: '',
    chosenName: '',
    chosenPrice: '',
    chosenInterval: '',
    chosenAllowance: '',
    chosenTerms: '',
    confirmTitle: '',
    confirmMessage: '',
    error: '',
    notice: '',
  },
  layout: meMembershipLayout,
  endpoints: {
    card: { url: '/api/me/vex', method: 'POST', request: myCardPrism, target: 'card' },
    membership: { url: '/api/me/vex', method: 'POST', request: myMembershipPrism, target: 'membership' },
    passes: { url: '/api/me/vex', method: 'POST', request: myPassesPrism, target: 'passes' },
    plans: { url: '/api/me/vex', method: 'POST', request: plansOnSalePrism, target: 'plans' },
    choose: { url: '/api/me/vex', method: 'POST', request: choosePlanPrism, errorTarget: 'error' },
    giveNotice: { url: '/api/me/vex', method: 'POST', request: myGiveNoticePrism, errorTarget: 'error' },
    pause: { url: '/api/me/vex', method: 'POST', request: myPausePrism, errorTarget: 'error' },
    resume: { url: '/api/me/vex', method: 'POST', request: myResumePrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'card' }, { call: 'membership' }, { call: 'passes' }, { call: 'plans' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'pick',
      do: [
        { set: 'error', value: '' },
        { set: 'notice', value: '' },
        { set: 'chosenOfferingId', value: '@event.payload.offering_id' },
        { set: 'chosenName', value: '@event.payload.name' },
        { set: 'chosenPrice', value: '@event.payload.price_display' },
        { set: 'chosenInterval', value: '@event.payload.interval_display' },
        { set: 'chosenAllowance', value: '@event.payload.allowance_display' },
        { set: 'chosenTerms', value: '@event.payload.term_display' },
        // A `$prism` in the same run of sets reads the data these sets have not
        // reached yet, so composing waits for the message.
        { emit: { channel: 'compose-plan-confirm' } },
      ],
    },
    {
      message: 'compose-plan-confirm',
      do: [
        { set: 'confirmTitle', value: { $prism: { $join: { parts: ['Start ', { $ref: '$.chosenName' }, '?'], sep: '' } } } },
        {
          set: 'confirmMessage',
          value: {
            $prism: {
              $join: {
                parts: [
                  { $ref: '$.chosenPrice' },
                  ' ',
                  { $ref: '$.chosenInterval' },
                  ' · ',
                  { $fill: { $ref: '$.chosenAllowance' } },
                  ' · ',
                  { $fill: { $ref: '$.chosenTerms' } },
                  '. Starting today. The studio settles payment with you directly.',
                ],
                sep: '',
              },
            },
          },
        },
        { emit: { channel: 'open-plan-confirm' } },
      ],
    },
    {
      message: 'open-plan-confirm',
      do: [
        {
          push: {
            action: 'confirm',
            canvas: 'sheet',
            with: ['sheet'],
            input: {
              title: '$.confirmTitle',
              message: '$.confirmMessage',
              confirmLabel: 'I agree — start it',
              channel: 'plan-chosen',
            },
          },
        },
      ],
    },
    {
      message: 'plan-chosen',
      do: [
        {
          call: 'choose',
          onSuccess: [
            { set: 'notice', value: 'You are on. The studio will sort payment out with you.' },
            { call: 'card' },
            { call: 'membership' },
            { emit: { channel: 'members-changed' } },
          ],
        },
      ],
    },
    // The shared card block carries this button; here the chooser is already
    // on the page, so it only points at it.
    { event: 'ui:click', ref: 'choosePlan', do: [{ set: 'notice', value: 'Pick a plan below — you will confirm the terms before anything starts.' }] },

    {
      event: 'ui:click',
      ref: 'giveNotice',
      do: [{ push: { action: 'confirm', canvas: 'sheet', with: ['sheet'], input: { title: 'Give notice?', message: 'Your last day is worked out from your notice period and any minimum term — whichever runs longer. The studio will confirm the date with you.', confirmLabel: 'Give notice', tone: 'danger', channel: 'me-notice-given' } } }],
    },
    {
      message: 'me-notice-given',
      do: [{ call: 'giveNotice', onSuccess: [{ set: 'notice', value: 'Noted. Your membership runs to its last day as agreed.' }, { call: 'membership' }, { call: 'card' }, { emit: { channel: 'members-changed' } }] }],
    },
    {
      event: 'ui:click',
      ref: 'pause',
      do: [{ push: { action: 'confirm', canvas: 'sheet', with: ['sheet'], input: { title: 'Pause your membership?', message: 'Your place is kept and billing stops while you are away. Paused time does not count toward any minimum term — it moves out by the same number of days.', confirmLabel: 'Pause it', channel: 'me-paused' } } }],
    },
    {
      message: 'me-paused',
      do: [{ call: 'pause', onSuccess: [{ set: 'notice', value: 'Paused. Resume whenever you are ready.' }, { call: 'membership' }, { call: 'card' }, { emit: { channel: 'members-changed' } }] }],
    },
    {
      event: 'ui:click',
      ref: 'resume',
      do: [{ call: 'resume', onSuccess: [{ set: 'notice', value: 'Welcome back.' }, { call: 'membership' }, { call: 'card' }, { emit: { channel: 'members-changed' } }] }],
    },
  ],
};

export const meMembershipInputSchema = z.toJSONSchema(z.object({}));

export const meClassesAction: ActionDefinition = {
  id: 'me.classes',
  title: 'Book a class',
  data: {
    sessions: [],
    rawSessions: [],
    bookedSessions: [],
    sessionId: '',
    courses: [],
    enrolments: [],
    courseId: '',
    enrolmentId: '',
    loading: true,
    error: '',
    notice: '',
    family: [],
    subjectId: '',
  },
  layout: meClassesLayout,
  endpoints: {
    load: { url: '/api/me/vex', method: 'POST', request: upcomingPrism, target: 'rawSessions' },
    booked: { url: '/api/me/vex', method: 'POST', request: myBookedSessionsPrism, target: 'bookedSessions' },
    book: { url: '/api/me/vex', method: 'POST', request: bookPrism, errorTarget: 'error' },
    family: { fn: 'nav.family', target: 'family' },
    // A second verb, not a parameter on `book`: `me/book` stamps person_id from
    // the caller and cannot name anybody else, so the ordinary path keeps the
    // stronger guarantee.
    bookFor: { url: '/api/me/vex', method: 'POST', request: bookForPrism, errorTarget: 'error' },
    courses: { url: '/api/me/vex', method: 'POST', request: coursesPrism, target: 'courses' },
    mine: { url: '/api/me/vex', method: 'POST', request: myEnrolmentsPrism, target: 'enrolments' },
    join: { url: '/api/me/vex', method: 'POST', request: joinPrism, errorTarget: 'error' },
    leave: { url: '/api/me/vex', method: 'POST', request: leavePrism, errorTarget: 'error' },
  },
  // Steps are awaited in order: `booked` has landed by the time `load`
  // succeeds, so the mark never reads a stale half.
  lifecycle: { mount: [{ call: 'courses' }, { call: 'mine' }, { call: 'booked' }, { call: 'family' }, { call: 'load', onSuccess: [{ emit: { channel: 'mark-booked' } }] }] },
  triggers: [
    // Joined on the screen: a policy cannot permit the entry itself to join a
    // studio-wide list against a personal read.
    {
      message: 'mark-booked',
      do: [
        {
          set: 'sessions',
          value: {
            $prism: {
              $map: {
                over: { $ref: '$.rawSessions' },
                as: 's',
                body: {
                  $with: {
                    let: {
                      held: {
                        $not: {
                          $empty: {
                            $filter: {
                              over: { $ref: '$.bookedSessions' },
                              as: 'b',
                              when: { $eq: [{ $get: { from: { $var: 'b' }, path: ['session_id'] } }, { $get: { from: { $var: 's' }, path: ['session_id'] } }] },
                            },
                          },
                        },
                      },
                    },
                    value: {
                      $merge: [
                        { $var: 's' },
                        {
                          already_booked: { $var: 'held' },
                          mine_display: { $case: { branches: [{ when: { $var: 'held' }, then: 'Booked' }], else: '' } },
                          mine_tone: 'good',
                          unbookable: { $or: [{ $get: { from: { $var: 's' }, path: ['cancelled'] } }, { $var: 'held' }] },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
        { set: 'loading', value: false },
      ],
    },
    {
      event: 'ui:click',
      ref: 'join',
      do: [
        { set: 'error', value: '' },
        { set: 'notice', value: '' },
        { set: 'courseId', value: '@event.payload.course_id' },
        {
          call: 'join',
          onSuccess: [{ set: 'notice', value: 'You are on the course. Every week is booked for you.' }, { call: 'courses' }, { call: 'mine' }, { call: 'booked' }, { call: 'load', onSuccess: [{ emit: { channel: 'mark-booked' } }] }, { emit: { channel: 'my-bookings-changed' } }],
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
          onSuccess: [{ set: 'notice', value: 'Withdrawn. Your places are free again.' }, { call: 'courses' }, { call: 'mine' }, { call: 'booked' }, { call: 'load', onSuccess: [{ emit: { channel: 'mark-booked' } }] }, { emit: { channel: 'my-bookings-changed' } }],
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
          call: 'book',
          onSuccess: [{ set: 'notice', value: 'Added — see My classes. A full class puts you on the waiting list.' }, { call: 'booked' }, { call: 'load', onSuccess: [{ emit: { channel: 'mark-booked' } }] }, { emit: { channel: 'my-bookings-changed' } }],
        },
      ],
    },
    { event: 'ui:click', ref: 'subject', do: [{ set: 'subjectId', value: '@event.payload.value' }] },
    {
      event: 'ui:click',
      ref: 'bookFor',
      do: [
        { set: 'error', value: '' },
        { set: 'notice', value: '' },
        { set: 'sessionId', value: '@event.payload.session_id' },
        {
          call: 'bookFor',
          onSuccess: [{ set: 'notice', value: 'Added — see My classes.' }, { call: 'booked' }, { call: 'load', onSuccess: [{ emit: { channel: 'mark-booked' } }] }, { emit: { channel: 'my-bookings-changed' } }],
        },
      ],
    },
    { message: 'my-bookings-changed', do: [{ call: 'booked' }, { call: 'load', onSuccess: [{ emit: { channel: 'mark-booked' } }] }, { call: 'mine' }, { call: 'courses' }] },
  ],
};

export const meClassesInputSchema = z.toJSONSchema(z.object({}));

export const meBookingsAction: ActionDefinition = {
  id: 'me.bookings',
  title: 'My classes',
  data: {
    bookings: [],
    bookingId: '',
    loading: true,
    error: '',
    notice: '',
    family: [],
    familyBookings: [],
  },
  layout: meBookingsLayout,
  endpoints: {
    load: { url: '/api/me/vex', method: 'POST', request: myBookingsPrism, target: 'bookings' },
    cancel: { url: '/api/me/vex', method: 'POST', request: cancelPrism, errorTarget: 'error' },
    family: { fn: 'nav.family', target: 'family' },
    familyBookings: { url: '/api/me/vex', method: 'POST', request: familyBookingsPrism, target: 'familyBookings' },
    cancelFor: { url: '/api/me/vex', method: 'POST', request: cancelForPrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }, { call: 'family' }, { call: 'familyBookings' }] },
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
    // Its own verb: `me/cancel` is pinned to the caller and matches nothing for
    // a child's booking id.
    {
      event: 'ui:click',
      ref: 'cancelFor',
      do: [
        { set: 'error', value: '' },
        { set: 'notice', value: '' },
        { set: 'bookingId', value: '@event.payload.booking_id' },
        {
          call: 'cancelFor',
          onSuccess: [{ set: 'notice', value: 'Cancelled. The place is free again.' }, { call: 'familyBookings' }, { emit: { channel: 'my-bookings-changed' } }],
        },
      ],
    },
    { message: 'my-bookings-changed', do: [{ call: 'load' }, { call: 'familyBookings' }] },
  ],
};

export const meBookingsInputSchema = z.toJSONSchema(z.object({}));
