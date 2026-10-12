import type { CacheEntry, MutationEntry } from './index';
import { standingOver, standingLabel, standingTone, hasSubscription, hasLivePass, onACourse, trialRunning, isStaff } from './standing';

const row = (name: string) => ({ $get: { from: { $var: 'b' }, path: [name] } });

export const rosterForSession: CacheEntry = {
  fingerprint: 'roster/forSession',
  intent: 'Everyone booked into one class, and whether they have checked in',
  shape: [{ booking_id: '', person_id: '', person_name: '', status_display: '', status_tone: '', attended: false, arrived_label: '' }],
  dsl: {
    from: ['bookings', 'people'],
    fields: [
      { field: 'bookings.id', as: 'booking_id' },
      'bookings.person_id',
      'bookings.attended',
      { field: 'people.name', as: 'person_name' },
    ],
    compute: standingOver('bookings'),
    filter: { and: [{ eq: ['bookings.session_id', { $context: 'sessionId' }] }, { eq: ['bookings.status', 'booked'] }] },
    sort: [{ field: 'people.name', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'b',
      body: {
        booking_id: row('booking_id'),
        person_id: row('person_id'),
        person_name: row('person_name'),
        status_display: standingLabel(row('standing')),
        status_tone: standingTone(row('standing')),
        attended: row('attended'),
        arrived_label: { $case: { branches: [{ when: row('attended'), then: 'Here' }], else: 'Due' } },
        arrived_tone: { $case: { branches: [{ when: row('attended'), then: 'good' }], else: 'neutral' } },
      },
    },
  },
};

export const walkInsToday: CacheEntry = {
  fingerprint: 'check-ins/walk-ins-today',
  intent: 'Check-ins today that belong to no class',
  shape: [{ check_in_id: '', person_name: '' }],
  dsl: {
    from: ['check_ins', 'people'],
    fields: [{ field: 'check_ins.id', as: 'check_in_id' }, { field: 'people.name', as: 'person_name' }],
    filter: { and: [{ eq: ['check_ins.held_on', { $scope: 'today' }] }, { isNull: 'check_ins.session_id' }] },
    sort: [{ field: 'check_ins.happened_at', dir: 'desc' }],
  },
};

export const checkInMark: MutationEntry = {
  fingerprint: 'check-ins/mark',
  intent: 'Check a booked person into their class',
  mutation: [
    {
      op: 'insert',
      table: 'check_ins',
      values: { person_id: { $context: 'personId' }, session_id: { $context: 'sessionId' }, method: 'desk' },
    },
    {
      op: 'update',
      table: 'bookings',
      set: { attended: true },
      where: { eq: ['bookings.id', { $context: 'bookingId' }] },
    },
  ],
};

export const bookableForSession: CacheEntry = {
  fingerprint: 'people/bookable-for-session',
  intent: 'People with live access at this studio who are not booked into the given class',
  // `name`, never `label`: that keeps a person's name off the language pass.
  // `sub` is the standing word, which translates.
  shape: [{ value: '', name: '', sub: '' }],
  dsl: {
    from: ['studio_people', 'people'],
    fields: [
      'studio_people.person_id',
      { field: 'people.name', as: 'person_name' },
    ],
    compute: standingOver('studio_people'),
    filter: {
      and: [
        {
          or: [
            hasSubscription('studio_people', ['active']),
            hasLivePass('studio_people'),
            trialRunning('studio_people'),
            onACourse('studio_people'),
            isStaff('studio_people'),
          ],
        },
        {
          not: {
            exists: {
              from: ['bookings'],
              filter: {
                and: [
                  { eq: ['bookings.person_id', 'studio_people.person_id'] },
                  { eq: ['bookings.studio_id', 'studio_people.studio_id'] },
                  { eq: ['bookings.session_id', { $context: 'sessionId' }] },
                  { eq: ['bookings.status', 'booked'] },
                ],
              },
            },
          },
        },
      ],
    },
    sort: [{ field: 'people.name', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'b',
      body: {
        value: row('person_id'),
        name: row('person_name'),
        sub: standingLabel(row('standing')),
      },
    },
  },
};

export const bookingCreate: MutationEntry = {
  fingerprint: 'bookings/create',
  intent: 'Book a person into a class',
  mutation: {
    op: 'insert',
    table: 'bookings',
    values: { session_id: { $context: 'sessionId' }, person_id: { $context: 'personId' }, status: 'booked' },
  },
};

export const bookingCancel: MutationEntry = {
  fingerprint: 'bookings/cancel',
  intent: 'Cancel a booking, keeping the record',
  mutation: {
    op: 'update',
    table: 'bookings',
    set: { status: 'cancelled' },
    where: { eq: ['bookings.id', { $context: 'bookingId' }] },
  },
};
