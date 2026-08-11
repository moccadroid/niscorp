import type { CacheEntry, MutationEntry } from './index';
import { statusText, statusTone } from '@lyra/app/prisms/format.prism';

// The front desk's daily loop: who is due in this class, and who has arrived.

const row = (name: string) => ({ $get: { from: { $var: 'b' }, path: [name] } });

// Everyone booked into one session, with whether they have turned up.
//
// `attended` comes off the booking row rather than a join to check_ins, and
// that is not an optimisation — vex only LEFT-joins nullable foreign keys, so
// joining check_ins would be INNER and would drop exactly the people the desk
// still has to check in. The counter cache is what keeps the list complete.
export const rosterForSession: CacheEntry = {
  fingerprint: 'roster/forSession',
  intent: 'Everyone booked into one class, and whether they have checked in',
  shape: [{ booking_id: '', membership_id: '', person_name: '', status_display: '', status_tone: '', attended: false, arrived_label: '' }],
  dsl: {
    from: ['bookings', 'memberships', 'people'],
    fields: [
      { field: 'bookings.id', as: 'booking_id' },
      'bookings.membership_id',
      'bookings.attended',
      { field: 'memberships.status', as: 'membership_status' },
      { field: 'people.name', as: 'person_name' },
    ],
    filter: { and: [{ eq: ['bookings.session_id', { $context: 'sessionId' }] }, { eq: ['bookings.status', 'booked'] }] },
    sort: [{ field: 'people.name', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'b',
      body: {
        booking_id: row('booking_id'),
        membership_id: row('membership_id'),
        person_name: row('person_name'),
        status_display: statusText(row('membership_status')),
        status_tone: statusTone(row('membership_status')),
        attended: row('attended'),
        // The label the row wears. Said here rather than in a layout, because
        // "here" and "not yet" is presentation and belongs on the way out.
        arrived_label: { $case: { branches: [{ when: row('attended'), then: 'Here' }], else: 'Due' } },
        arrived_tone: { $case: { branches: [{ when: row('attended'), then: 'good' }], else: 'neutral' } },
      },
    },
  },
};

// Who walked in today without a booking. A walk-in is a check_in with no
// session — the case the "attendance means a booking" shortcut gets wrong, and
// the reason check_ins is its own table.
export const walkInsToday: CacheEntry = {
  fingerprint: 'check-ins/walk-ins-today',
  intent: 'Check-ins today that belong to no class',
  shape: [{ check_in_id: '', person_name: '' }],
  dsl: {
    from: ['check_ins', 'memberships', 'people'],
    fields: [{ field: 'check_ins.id', as: 'check_in_id' }, { field: 'people.name', as: 'person_name' }],
    filter: { and: [{ eq: ['check_ins.held_on', { $scope: 'today' }] }, { isNull: 'check_ins.session_id' }] },
    sort: [{ field: 'check_ins.happened_at', dir: 'desc' }],
  },
};

// ─── the write ───────────────────────────────────────────────
//
// TWO statements, ONE transaction. The mutation grammar takes an array and runs
// it together, which is exactly what a counter cache needs: the check_in and
// the flag it is cached in move or neither does.
//
// Note what the caller does NOT send: a studio id (the engine stamps it), and a
// time (the database defaults it — see schema.ts). What is left is who and
// which class, which is all a desk actually knows.
export const checkInMark: MutationEntry = {
  fingerprint: 'check-ins/mark',
  intent: 'Check a booked member into their class',
  mutation: [
    {
      op: 'insert',
      table: 'check_ins',
      // No id: the column defaults to `gen_random_uuid()`. The grammar sets
      // literals and `$context` values and cannot read a generated key back, so
      // the alternative is a client-invented primary key — which is a collision
      // waiting for two front desks and a slow network.
      values: { membership_id: { $context: 'membershipId' }, session_id: { $context: 'sessionId' }, method: 'desk' },
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

// Who could still be added to this class: current members who are not already
// on the roster. `NOT EXISTS` over bookings, correlated to the outer row —
// which is why the roster and this list can never disagree about who is in.
export const bookableForSession: CacheEntry = {
  fingerprint: 'members/bookable-for-session',
  intent: 'Current members at this studio who are not booked into the given class',
  shape: [{ membership_id: '', person_name: '', status_display: '', status_tone: '' }],
  dsl: {
    from: ['memberships', 'people'],
    fields: [
      { field: 'memberships.id', as: 'membership_id' },
      'memberships.status',
      { field: 'people.name', as: 'person_name' },
    ],
    filter: {
      and: [
        { in: ['memberships.status', ['active', 'trialling']] },
        {
          not: {
            exists: {
              from: ['bookings'],
              filter: {
                and: [
                  { eq: ['bookings.membership_id', 'memberships.id'] },
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
        membership_id: row('membership_id'),
        person_name: row('person_name'),
        status_display: statusText(row('status')),
        status_tone: statusTone(row('status')),
      },
    },
  },
};

// ONE statement. No id (the column defaults), no studio (the engine stamps
// it), and no count (a trigger keeps it) — so what a booking write actually
// carries is who and which class, which is all anybody knows.
//
// Capacity is not checked here and cannot be: "insert only if the class is not
// full" is not expressible in a closed grammar, and read-then-write is a race
// with a queue at the door. A BEFORE INSERT trigger raises instead, and the
// desk is told the class is full rather than pressing a button that appears to
// work. See schema.ts.
export const bookingCreate: MutationEntry = {
  fingerprint: 'bookings/create',
  intent: 'Book a member into a class',
  mutation: {
    op: 'insert',
    table: 'bookings',
    values: { session_id: { $context: 'sessionId' }, membership_id: { $context: 'membershipId' }, status: 'booked' },
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
