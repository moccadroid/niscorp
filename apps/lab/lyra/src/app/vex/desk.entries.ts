import type { CacheEntry, MutationEntry } from './index';
import { standingOver, standingLabel, standingTone, hasSubscription, hasLivePass, onACourse, trialRunning, isStaff } from './standing';

// The front desk's daily loop: who is due in this class, and who has arrived.

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
    // The same derivation the roll uses, correlated on the booking's own
    // person through the anchor's mirrors — a desk sees "On trial" beside a
    // name without any grant on the table that says what anybody pays.
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
        // The label the row wears. Said here rather than in a layout, because
        // "here" and "not yet" is presentation and belongs on the way out.
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

// ─── the write ───────────────────────────────────────────────
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

// ─── booking ─────────────────────────────────────────────────

export const bookableForSession: CacheEntry = {
  fingerprint: 'people/bookable-for-session',
  intent: 'People with live access at this studio who are not booked into the given class',
  shape: [{ person_id: '', person_name: '', status_display: '', status_tone: '' }],
  dsl: {
    from: ['studio_people', 'people'],
    fields: [
      'studio_people.person_id',
      { field: 'people.name', as: 'person_name' },
    ],
    compute: standingOver('studio_people'),
    // Live access is what makes somebody bookable: a subscription, credits, a
    // live trial, a course seat — or working here. Exactly the "current" lens.
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
        person_id: row('person_id'),
        person_name: row('person_name'),
        status_display: standingLabel(row('standing')),
        status_tone: standingTone(row('standing')),
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

// Cancelling keeps the row. "Who dropped out" is a question every studio owner
// asks, and deleting the evidence answers it with silence.
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
