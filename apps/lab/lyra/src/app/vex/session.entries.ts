import type { CacheEntry } from './index';
import { dayText, fillText, fillTone, statusText, statusTone } from '@lyra/app/prisms/format.prism';

// ONE CLASS, LOOKED AT PROPERLY.
//
// The timetable answers "what is on" and the check-in screen answers "who has
// arrived". Neither answers the question an owner actually asks — who is coming
// to this class — and the gap was filled by opening the DESK's check-in tool
// over the calendar: a sheet with its own today-only class picker inside it,
// showing a roster for a class next Monday. Two screens deep, and wrong.
//
// These two entries are that question. Everybody who holds a place, booked or
// waiting, and the facts about the class itself in one row.

const row = (name: string) => ({ $get: { from: { $var: 's' }, path: [name] } });
const person = (name: string) => ({ $get: { from: { $var: 'b' }, path: [name] } });

// The class itself. Separate from the roster below on purpose: this joins
// through `staff` to `people` for the teacher, and the roster joins through
// `memberships` to `people` for the attendees. One query wanting `people` twice
// for two different reasons is a query nobody can read.
export const sessionDetail: CacheEntry = {
  fingerprint: 'session/detail',
  intent: 'One class: when it runs, who teaches it, and how full it is',
  shape: { session_id: '', name: '', program_name: '', program_tone: '', day_display: '', starts_at: '', booked_display: '', fill_tone: '', teacher_name: '', cancelled: false },
  dsl: {
    from: ['class_sessions', 'programs'],
    fields: [
      { field: 'class_sessions.id', as: 'session_id' },
      'class_sessions.name',
      'class_sessions.held_on',
      'class_sessions.starts_at',
      'class_sessions.capacity',
      'class_sessions.booked_count',
      'class_sessions.status',
      { field: 'programs.name', as: 'program_name' },
      { field: 'programs.colour', as: 'program_tone' },
    ],
    filter: { eq: ['class_sessions.id', { $context: 'sessionId' }] },
    limit: 1,
  },
  mapping: {
    $with: {
      let: { s: { $ref: '$.result' } },
      value: {
        session_id: row('session_id'),
        name: row('name'),
        program_name: row('program_name'),
        program_tone: row('program_tone'),
        day_display: dayText(row('held_on')),
        starts_at: row('starts_at'),
        booked_display: fillText(row('booked_count'), row('capacity')),
        fill_tone: fillTone(row('booked_count'), row('capacity')),
        cancelled: { $eq: [row('status'), 'cancelled'] },
      },
    },
  },
};

// Everybody with a place, INCLUDING the queue.
//
// `roster/forSession` deliberately shows only confirmed bookings, because the
// desk checks in the people who are actually coming. An owner looking at a full
// class needs the other half of the picture: five waiting is the difference
// between "popular" and "put another one on".
export const sessionAttending: CacheEntry = {
  fingerprint: 'session/attending',
  intent: 'Everyone holding a place in one class, booked or waiting',
  shape: [{ booking_id: '', person_name: '', place_label: '', place_tone: '', status_display: '', status_tone: '' }],
  dsl: {
    from: ['bookings', 'memberships', 'people'],
    fields: [
      { field: 'bookings.id', as: 'booking_id' },
      { field: 'bookings.status', as: 'place' },
      { field: 'memberships.status', as: 'membership_status' },
      { field: 'people.name', as: 'person_name' },
    ],
    filter: {
      and: [
        { eq: ['bookings.session_id', { $context: 'sessionId' }] },
        { neq: ['bookings.status', 'cancelled'] },
      ],
    },
    // Booked before waiting, then by name — the queue reads as a queue.
    sort: [{ field: 'bookings.status', dir: 'asc' }, { field: 'people.name', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'b',
      body: {
        booking_id: person('booking_id'),
        person_name: person('person_name'),
        place_label: { $case: { branches: [{ when: { $eq: [person('place'), 'waitlisted'] }, then: 'Waiting' }], else: 'Booked' } },
        place_tone: { $case: { branches: [{ when: { $eq: [person('place'), 'waitlisted'] }, then: 'warm' }], else: 'good' } },
        status_display: statusText(person('membership_status')),
        status_tone: statusTone(person('membership_status')),
      },
    },
  },
};
