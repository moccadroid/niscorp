import type { CacheEntry } from './index';
import { dayText, fillText, fillTone } from '@lyra/app/prisms/format.prism';
import { standingOver, standingLabel, standingTone } from './standing';

const row = (name: string) => ({ $get: { from: { $var: 's' }, path: [name] } });
const person = (name: string) => ({ $get: { from: { $var: 'b' }, path: [name] } });

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

export const sessionAttending: CacheEntry = {
  fingerprint: 'session/attending',
  intent: 'Everyone holding a place in one class, booked or waiting',
  shape: [{ booking_id: '', person_name: '', place_label: '', place_tone: '', status_display: '', status_tone: '' }],
  dsl: {
    from: ['bookings', 'people'],
    fields: [
      { field: 'bookings.id', as: 'booking_id' },
      { field: 'bookings.status', as: 'place' },
      { field: 'people.name', as: 'person_name' },
    ],
    compute: standingOver('bookings'),
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
        status_display: standingLabel(person('standing')),
        status_tone: standingTone(person('standing')),
      },
    },
  },
};
