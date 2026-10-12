import type { CacheEntry, MutationEntry } from './index';
import { dateText, pattern, timeText } from '@lyra/app/prisms/format.prism';
import { STANDING, standingLabel, standingTone } from './standing';

const row = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name] } });
const one = (name: string, fallback: unknown = '') => ({ $get: { from: { $var: 'c' }, path: [name], fallback } });

export const myCard: CacheEntry = {
  fingerprint: 'me/card',
  intent: 'The standing of whoever is asking, at their own studio',
  // Without `reach` a caller holding two roles gets the widest either grants:
  // a teacher who trains here is handed whichever person the planner reached.
  reach: 'personal',
  // No join to subscriptions or passes: a reverse join is INNER, and the card
  // would vanish for a prospect who holds neither.
  shape: { studio_name: '', standing: '', status_label: '', status_tone: '', joined_display: '', trial_display: '', on_trial: false },
  dsl: {
    from: ['studio_people', 'studios'],
    fields: [
      { field: 'studios.name', as: 'studio_name' },
      'studio_people.first_seen_on',
      'studio_people.trial_ends_on',
    ],
    compute: STANDING,
    limit: 1,
  },
  mapping: {
    $with: {
      let: { c: { $ref: '$.result' } },
      value: {
        studio_name: one('studio_name'),
        standing: one('standing'),
        status_label: standingLabel(one('standing')),
        status_tone: standingTone(one('standing')),
        joined_display: dateText(one('first_seen_on', null)),
        trial_display: dateText(one('trial_ends_on', null)),
        on_trial: { $case: { branches: [{ when: { $eq: [one('standing'), 'trialling'] }, then: true }], else: false } },
      },
    },
  },
};

export const myPasses: CacheEntry = {
  fingerprint: 'me/passes',
  intent: 'The class passes of whoever is asking',
  reach: 'personal',
  shape: [{ pass_id: '', name: '', credits_display: '', state_label: '', expires_display: '' }],
  dsl: {
    from: ['passes', 'offerings'],
    fields: [
      { field: 'passes.id', as: 'pass_id' },
      'passes.credits_total',
      'passes.credits_used',
      'passes.status',
      'passes.expires_on',
      { field: 'offerings.name', as: 'name' },
    ],
    sort: [{ field: 'passes.purchased_on', dir: 'desc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        pass_id: row('pass_id'),
        name: row('name'),
        credits_display: pattern('{n} of {total} left', { n: { $sub: [row('credits_total'), row('credits_used')] }, total: row('credits_total') }),
        state_label: { $case: { branches: [{ when: { $eq: [row('status'), 'used_up'] }, then: 'Used up' }], else: 'Active' } },
        expires_display: dateText({ $get: { from: { $var: 'r' }, path: ['expires_on'], fallback: { $const: null } } }),
      },
    },
  },
};

export const myBookings: CacheEntry = {
  fingerprint: 'me/bookings',
  reach: 'personal',
  intent: 'The classes the person asking has booked',
  shape: [{ booking_id: '', session_id: '', class_name: '', program_name: '', tone: '', status: '', when_display: '', held_on: '', state_label: '', state_tone: '', session_cancelled: false }],
  dsl: {
    from: ['bookings', 'class_sessions', 'programs'],
    fields: [
      { field: 'bookings.id', as: 'booking_id' },
      'bookings.session_id',
      'bookings.status',
      { field: 'class_sessions.name', as: 'class_name' },
      { field: 'class_sessions.held_on', as: 'held_on' },
      { field: 'class_sessions.starts_at', as: 'starts_at' },
      // A studio cancelling a class does not touch anybody's booking row, so
      // the session's own status is read as well.
      { field: 'class_sessions.status', as: 'session_status' },
      { field: 'programs.name', as: 'program_name' },
      { field: 'programs.colour', as: 'tone' },
    ],
    filter: { and: [{ gte: ['class_sessions.held_on', { $scope: 'today' }] }, { neq: ['bookings.status', 'cancelled'] }] },
    sort: [{ field: 'class_sessions.held_on', dir: 'asc' }, { field: 'class_sessions.starts_at', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        booking_id: row('booking_id'),
        session_id: row('session_id'),
        class_name: row('class_name'),
        program_name: row('program_name'),
        tone: row('tone'),
        status: row('status'),
        held_on: row('held_on'),
        when_display: { $join: { parts: [dateText(row('held_on')), timeText(row('starts_at'))], sep: ' · ' } },
        session_cancelled: { $eq: [row('session_status'), 'cancelled'] },
        state_label: {
          $case: {
            branches: [
              { when: { $eq: [row('session_status'), 'cancelled'] }, then: 'Cancelled' },
              { when: { $eq: [row('status'), 'waitlisted'] }, then: 'Waiting' },
            ],
            else: 'Booked',
          },
        },
        state_tone: {
          $case: {
            branches: [
              { when: { $eq: [row('session_status'), 'cancelled'] }, then: 'warn' },
              { when: { $eq: [row('status'), 'waitlisted'] }, then: 'warm' },
            ],
            else: 'good',
          },
        },
      },
    },
  },
};

export const myBookedSessions: CacheEntry = {
  fingerprint: 'me/booked-sessions',
  reach: 'personal',
  intent: 'Which class sessions the person asking is already booked into',
  shape: [{ session_id: '' }],
  dsl: {
    from: ['bookings'],
    fields: ['bookings.session_id'],
    filter: { eq: ['bookings.status', 'booked'] },
  },
};

export const bookClass: MutationEntry = {
  fingerprint: 'me/book',
  intent: 'Book myself into a class',
  reach: 'personal',

  mutation: {
    op: 'insert',
    table: 'bookings',
    values: { session_id: { $context: 'sessionId' } },
  },
};

export const familyBookings: CacheEntry = {
  fingerprint: 'me/family-bookings',
  intent: "The classes the person asking and their children have booked, in one answer",
  reach: 'household',
  shape: [{ booking_id: '', person_id: '', session_id: '', class_name: '', program_name: '', tone: '', when_display: '', held_on: '', state_label: '', state_tone: '', session_cancelled: false }],
  dsl: {
    from: ['bookings', 'class_sessions', 'programs'],
    fields: [
      { field: 'bookings.id', as: 'booking_id' },
      'bookings.person_id',
      'bookings.session_id',
      'bookings.status',
      { field: 'class_sessions.name', as: 'class_name' },
      { field: 'class_sessions.held_on', as: 'held_on' },
      { field: 'class_sessions.starts_at', as: 'starts_at' },
      { field: 'class_sessions.status', as: 'session_status' },
      { field: 'programs.name', as: 'program_name' },
      { field: 'programs.colour', as: 'tone' },
    ],
    filter: { and: [{ gte: ['class_sessions.held_on', { $scope: 'today' }] }, { neq: ['bookings.status', 'cancelled'] }] },
    sort: [{ field: 'class_sessions.held_on', dir: 'asc' }, { field: 'class_sessions.starts_at', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        booking_id: row('booking_id'),
        person_id: row('person_id'),
        session_id: row('session_id'),
        class_name: row('class_name'),
        program_name: row('program_name'),
        tone: row('tone'),
        held_on: row('held_on'),
        when_display: { $join: { parts: [dateText(row('held_on')), timeText(row('starts_at'))], sep: ' · ' } },
        session_cancelled: { $eq: [row('session_status'), 'cancelled'] },
        state_label: {
          $case: {
            branches: [
              { when: { $eq: [row('session_status'), 'cancelled'] }, then: 'Cancelled' },
              { when: { $eq: [row('status'), 'waitlisted'] }, then: 'Waiting' },
            ],
            else: 'Booked',
          },
        },
        state_tone: {
          $case: {
            branches: [
              { when: { $eq: [row('session_status'), 'cancelled'] }, then: 'warn' },
              { when: { $eq: [row('status'), 'waitlisted'] }, then: 'warm' },
            ],
            else: 'good',
          },
        },
      },
    },
  },
};

// `person_id` is a `$lookup` on `guardianships`, whose read rules vex ANDs into
// the subquery (`guardian_person_id = userId`, the studio pin): a child the
// caller does not guard resolves NULL. `can_book` gates booking, not the reads.
export const bookForFamily: MutationEntry = {
  fingerprint: 'me/book-for',
  intent: 'Book one of my children into a class',
  reach: 'household',
  mutation: {
    op: 'insert',
    table: 'bookings',
    values: {
      session_id: { $context: 'sessionId' },
      person_id: {
        $lookup: {
          from: 'guardianships',
          field: 'child_person_id',
          where: {
            and: [
              { eq: ['guardianships.child_person_id', { $context: 'subjectId' }] },
              { eq: ['guardianships.can_book', true] },
            ],
          },
        },
      },
    },
  },
};

export const cancelFamilyBooking: MutationEntry = {
  fingerprint: 'me/cancel-for',
  intent: "Cancel a class booked for me or one of my children",
  reach: 'household',
  mutation: {
    op: 'update',
    table: 'bookings',
    set: { status: 'cancelled' },
    where: { eq: ['bookings.id', { $context: 'bookingId' }] },
  },
};

export const cancelMyBooking: MutationEntry = {
  fingerprint: 'me/cancel',
  intent: 'Cancel a class I booked',
  reach: 'personal',

  mutation: {
    op: 'update',
    table: 'bookings',
    set: { status: 'cancelled' },
    where: { eq: ['bookings.id', { $context: 'bookingId' }] },
  },
};
